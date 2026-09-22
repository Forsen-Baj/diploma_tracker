using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Archive;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class ArchiveService : IArchiveService
{
    private readonly AppDbContext _dbContext;
    private readonly IFileStorage _storage;
    private readonly ILogger<ArchiveService> _logger;

    public ArchiveService(AppDbContext dbContext, IFileStorage storage, ILogger<ArchiveService> logger)
    {
        _dbContext = dbContext;
        _storage = storage;
        _logger = logger;
    }

    public Task<int> ArchiveGroupAsync(Guid groupId, CancellationToken cancellationToken) =>
        ArchiveAsync(groupId, studentProfileIds: null, markGroupDeleted: true, cancellationToken);

    public async Task<int> ArchiveStudentsAsync(IReadOnlyList<Guid> studentProfileIds, CancellationToken cancellationToken)
    {
        if (studentProfileIds.Count == 0)
        {
            return 0;
        }

        // Students may span several groups (a bulk archive from the students page), and the
        // archive is organised by group, so each group is handled on its own.
        var byGroup = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => studentProfileIds.Contains(p.Id))
            .Select(p => new { p.Id, p.GroupId })
            .ToListAsync(cancellationToken);

        var archived = 0;
        foreach (var group in byGroup.GroupBy(x => x.GroupId))
        {
            archived += await ArchiveAsync(
                group.Key,
                group.Select(x => x.Id).ToList(),
                markGroupDeleted: false,
                cancellationToken);
        }

        return archived;
    }

    /// Phase 8 §4.1/I1: the files a group deletion must archive. A student who has since moved
    /// out keeps their old `StudentTask` rows, reached via `GroupTask.GroupId`; a student
    /// archived in this group with submissions from an earlier group is reached via
    /// `StudentProfile.GroupId`. Owner decision: everything goes into the deleted group's
    /// archive, whichever side matched. Shared by the archiving write path and the
    /// deletion-preview read path so the two can never disagree on what will be archived.
    private static Expression<Func<SubmissionFile, bool>> GroupDeletionFileFilter(Guid groupId) =>
        f => f.Submission.StudentTask.GroupTask.GroupId == groupId
            || f.Submission.StudentTask.StudentProfile.GroupId == groupId;

    /// Phase 8 §I3: same predicate the deletion itself archives by, so the preview the admin
    /// confirms against never disagrees with what actually happens.
    public Task<int> CountFilesForGroupDeletionAsync(Guid groupId, CancellationToken cancellationToken) =>
        _dbContext.SubmissionFiles.AsNoTracking()
            .Where(GroupDeletionFileFilter(groupId))
            .CountAsync(cancellationToken);

    private async Task<int> ArchiveAsync(
        Guid groupId,
        IReadOnlyList<Guid>? studentProfileIds,
        bool markGroupDeleted,
        CancellationToken cancellationToken)
    {
        var group = await _dbContext.Groups.AsNoTracking()
            .Where(g => g.Id == groupId)
            .Select(g => new
            {
                g.Id,
                g.Code,
                g.AcademicYear,
                DepartmentName = g.Department.Name,
                FacultyName = g.Department.Faculty.Name
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (group is null)
        {
            return 0;
        }

        var now = DateTime.UtcNow;

        // Archiving individual students keeps today's narrower filter: only their own group's
        // work, because their rows in any earlier group are archived when that group is
        // eventually deleted or the student is archived from it directly.
        var filesQuery = markGroupDeleted
            ? _dbContext.SubmissionFiles.AsNoTracking().Where(GroupDeletionFileFilter(groupId))
            : _dbContext.SubmissionFiles.AsNoTracking()
                .Where(f => f.Submission.StudentTask.StudentProfile.GroupId == groupId
                    && f.Submission.StudentTask.GroupTask.GroupId == groupId);

        if (studentProfileIds is not null)
        {
            filesQuery = filesQuery.Where(f => studentProfileIds.Contains(f.Submission.StudentTask.StudentProfileId));
        }

        var rows = await filesQuery
            .Select(f => new
            {
                f.StorageKey,
                f.OriginalName,
                f.ContentType,
                f.SizeBytes,
                f.Kind,
                StudentLastName = f.Submission.StudentTask.StudentProfile.User.LastName,
                StudentFirstName = f.Submission.StudentTask.StudentProfile.User.FirstName,
                StudentPatronymic = f.Submission.StudentTask.StudentProfile.User.Patronymic,
                f.Submission.StudentTask.StudentProfile.StudentNumber,
                StepTitle = f.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = f.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                f.Submission.StudentTask.GroupTask.Deadline,
                f.Submission.Version,
                f.Submission.SubmittedAt,
                f.Submission.IsLate,
                f.Submission.Decision,
                f.Submission.Mark,
                ReviewerLastName = f.Submission.Reviewer != null ? f.Submission.Reviewer.LastName : null,
                ReviewerFirstName = f.Submission.Reviewer != null ? f.Submission.Reviewer.FirstName : null,
                f.Submission.ReviewerComment,
                f.Submission.DecidedAt
            })
            .ToListAsync(cancellationToken);

        var archive = await _dbContext.ArchivedGroups
            .Include(a => a.Reviewers)
            .FirstOrDefaultAsync(a => a.SourceGroupId == groupId, cancellationToken);

        // Phase 8 §4.2/M1: one ArchivedGroup exists per group that has anything archived. An
        // empty group, or a student who never submitted, must not create a bare row that then
        // shows on the Archive page with nothing in it. An archive already there is a different
        // matter - it is updated below whatever this call finds, because its metadata (group
        // deleted, reviewers) can change independently of whether new files turned up.
        if (archive is null && rows.Count == 0)
        {
            return 0;
        }

        if (archive is null)
        {
            archive = new ArchivedGroup
            {
                Id = Guid.NewGuid(),
                SourceGroupId = group.Id,
                GroupCode = group.Code,
                AcademicYear = group.AcademicYear,
                DepartmentName = group.DepartmentName,
                FacultyName = group.FacultyName,
                CreatedAt = now,
                UpdatedAt = now
            };
            _dbContext.ArchivedGroups.Add(archive);
        }
        else
        {
            archive.UpdatedAt = now;
        }

        if (markGroupDeleted)
        {
            archive.GroupDeletedAt = now;
        }

        // The live reviewer rows go with the group, so who may read this archive is copied in
        // now (§4.5). Reviewers added since a previous archiving event are picked up here too.
        var reviewers = await _dbContext.GroupReviewers.AsNoTracking()
            .Where(r => r.GroupId == groupId)
            .Select(r => new { r.ReviewerId, r.Reviewer.LastName, r.Reviewer.FirstName, r.Reviewer.Patronymic })
            .ToListAsync(cancellationToken);

        var knownReviewerIds = archive.Reviewers.Select(r => r.ReviewerId).ToHashSet();
        foreach (var reviewer in reviewers.Where(r => !knownReviewerIds.Contains(r.ReviewerId)))
        {
            // Added through the set, like the files below: a child with a preset Guid reached only
            // through a tracked archive's collection would be taken for an existing row and updated.
            _dbContext.ArchivedGroupReviewers.Add(new ArchivedGroupReviewer
            {
                Id = Guid.NewGuid(),
                ArchivedGroupId = archive.Id,
                ReviewerId = reviewer.ReviewerId,
                ReviewerName = string.Join(' ', new[] { reviewer.LastName, reviewer.FirstName, reviewer.Patronymic }
                    .Where(part => !string.IsNullOrWhiteSpace(part)))
            });
        }

        var existingKeys = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.ArchivedGroupId == archive.Id)
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);
        var existing = existingKeys.ToHashSet(StringComparer.Ordinal);

        var added = 0;
        foreach (var row in rows)
        {
            if (!existing.Add(row.StorageKey))
            {
                continue;
            }

            _dbContext.ArchivedFiles.Add(new ArchivedFile
            {
                Id = Guid.NewGuid(),
                ArchivedGroupId = archive.Id,
                StudentName = string.Join(' ', new[] { row.StudentLastName, row.StudentFirstName, row.StudentPatronymic }
                    .Where(part => !string.IsNullOrWhiteSpace(part))),
                StudentNumber = row.StudentNumber,
                StepTitle = row.StepTitle,
                StepOrder = row.StepOrder,
                Deadline = row.Deadline,
                Version = row.Version,
                SubmittedAt = row.SubmittedAt,
                IsLate = row.IsLate,
                Decision = row.Decision != null ? row.Decision.ToString() : null,
                Mark = row.Mark,
                ReviewerName = row.ReviewerLastName == null
                    ? null
                    : string.Join(' ', new[] { row.ReviewerLastName, row.ReviewerFirstName }
                        .Where(part => !string.IsNullOrWhiteSpace(part))),
                ReviewerComment = row.ReviewerComment,
                DecidedAt = row.DecidedAt,
                Kind = row.Kind.ToString(),
                OriginalName = row.OriginalName,
                ContentType = row.ContentType,
                SizeBytes = row.SizeBytes,
                StorageKey = row.StorageKey,
                ArchivedAt = now
            });
            added++;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return added;
    }

    /// Phase 8 §4.5. An administrator sees every archive; a teacher sees the ones whose stored
    /// reviewer ids include theirs. Everyone else sees nothing - and an archive they may not see
    /// answers exactly like one that does not exist.
    private IQueryable<ArchivedGroup> Visible(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.ArchivedGroups;
        }

        if (user.IsTeacher)
        {
            return _dbContext.ArchivedGroups.Where(a => a.Reviewers.Any(r => r.ReviewerId == user.UserId));
        }

        return _dbContext.ArchivedGroups.Where(_ => false);
    }

    public async Task<IReadOnlyList<ArchivedGroupSummaryResponse>> GetGroupsAsync(UserContext user, string? academicYear, string? search)
    {
        var query = Visible(user).AsNoTracking();

        if (!string.IsNullOrWhiteSpace(academicYear))
        {
            var year = academicYear.Trim();
            query = query.Where(a => a.AcademicYear == year);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = search.Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            query = query.Where(a => EF.Functions.Like(a.GroupCode, $"%{term}%")
                || a.Files.Any(f => EF.Functions.Like(f.StudentName, $"%{term}%")));
        }

        return await query
            .OrderByDescending(a => a.AcademicYear)
            .ThenBy(a => a.GroupCode)
            .Select(a => new ArchivedGroupSummaryResponse
            {
                Id = a.Id,
                GroupCode = a.GroupCode,
                AcademicYear = a.AcademicYear,
                DepartmentName = a.DepartmentName,
                FacultyName = a.FacultyName,
                GroupDeletedAt = a.GroupDeletedAt,
                StudentCount = a.Files.Select(f => f.StudentNumber).Distinct().Count(),
                FileCount = a.Files.Count,
                TotalSizeBytes = a.Files.Sum(f => (long?)f.SizeBytes) ?? 0,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .ToListAsync();
    }

    public async Task<(ArchivedGroupDetailsResponse? details, string? error)> GetGroupAsync(UserContext user, Guid id)
    {
        var details = await Visible(user).AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new ArchivedGroupDetailsResponse
            {
                Id = a.Id,
                GroupCode = a.GroupCode,
                AcademicYear = a.AcademicYear,
                DepartmentName = a.DepartmentName,
                FacultyName = a.FacultyName,
                GroupDeletedAt = a.GroupDeletedAt,
                StudentCount = a.Files.Select(f => f.StudentNumber).Distinct().Count(),
                FileCount = a.Files.Count,
                TotalSizeBytes = a.Files.Sum(f => (long?)f.SizeBytes) ?? 0,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt,
                ReviewerNames = a.Reviewers.OrderBy(r => r.ReviewerName).Select(r => r.ReviewerName).ToList(),
                Files = a.Files
                    .OrderBy(f => f.StudentName)
                    .ThenBy(f => f.StepOrder)
                    .ThenBy(f => f.Version)
                    .ThenBy(f => f.Kind)
                    .Select(f => new ArchivedFileResponse
                    {
                        Id = f.Id,
                        StudentName = f.StudentName,
                        StudentNumber = f.StudentNumber,
                        StepTitle = f.StepTitle,
                        StepOrder = f.StepOrder,
                        Deadline = f.Deadline,
                        Version = f.Version,
                        SubmittedAt = f.SubmittedAt,
                        IsLate = f.IsLate,
                        Decision = f.Decision,
                        Mark = f.Mark,
                        ReviewerName = f.ReviewerName,
                        ReviewerComment = f.ReviewerComment,
                        DecidedAt = f.DecidedAt,
                        Kind = f.Kind,
                        OriginalName = f.OriginalName,
                        SizeBytes = f.SizeBytes
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync();

        return details is null ? (null, ArchiveErrors.NotFound) : (details, null);
    }

    public async Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.Id == fileId)
            .Where(f => Visible(user).Any(a => a.Id == f.ArchivedGroupId))
            .Select(f => new { f.StorageKey, f.OriginalName })
            .FirstOrDefaultAsync(cancellationToken);

        if (file is null)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "ArchivedFile", fileId);
            return (null, ArchiveErrors.NotFound);
        }

        var stream = await _storage.OpenReadAsync(file.StorageKey, cancellationToken);
        if (stream is null)
        {
            return (null, ArchiveErrors.NotFound);
        }

        SecurityLog.FileDownloaded(_logger, user.UserId, fileId, Guid.Empty);

        // Always octet-stream: an archived file is handed to a browser for saving, never rendered.
        return (new StoredFileDownload(stream, "application/octet-stream", file.OriginalName), null);
    }

    public async Task<ArchiveUsageResponse> GetUsageAsync()
    {
        var totals = await _dbContext.ArchivedFiles.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(g => new { FileCount = g.Count(), TotalSizeBytes = g.Sum(f => (long?)f.SizeBytes) ?? 0 })
            .FirstOrDefaultAsync();

        return new ArchiveUsageResponse
        {
            GroupCount = await _dbContext.ArchivedGroups.CountAsync(),
            FileCount = totals == null ? 0 : totals.FileCount,
            TotalSizeBytes = totals == null ? 0 : totals.TotalSizeBytes
        };
    }

    public async Task<(bool success, string? error)> PurgeGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken)
    {
        var archive = await _dbContext.ArchivedGroups
            .Include(a => a.Files)
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);

        if (archive is null)
        {
            return (false, ArchiveErrors.NotFound);
        }

        var keys = archive.Files.Select(f => f.StorageKey).ToList();
        var fileCount = archive.Files.Count;
        var bytes = archive.Files.Sum(f => f.SizeBytes);

        // Phase 8 §4.4: a stored file is deleted only when nothing points at it any more. A key
        // may still be named by a live SubmissionFile (this archive was a copy made when the
        // student was archived) or by another archived group.
        var stillLive = await _dbContext.SubmissionFiles.AsNoTracking()
            .Where(f => keys.Contains(f.StorageKey))
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);
        var stillArchived = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.ArchivedGroupId != id && keys.Contains(f.StorageKey))
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);

        var referenced = stillLive.Concat(stillArchived).ToHashSet(StringComparer.Ordinal);

        _dbContext.ArchivedGroups.Remove(archive);
        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var key in keys.Where(key => !referenced.Contains(key)))
        {
            try
            {
                await _storage.DeleteAsync(key, cancellationToken);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // §11: a blob that cannot be removed does not fail the purge. The rows are gone;
                // the next purge that finds nothing referencing this key collects it. A read-only
                // file or a permissions problem surfaces as UnauthorizedAccessException, not
                // IOException, so both are handled the same way.
                _logger.LogWarning(exception, "Archived blob could not be deleted: StorageKey={StorageKey}", key);
            }
        }

        SecurityLog.ArchivePurged(_logger, administratorId, id, fileCount, bytes);
        return (true, null);
    }
}
