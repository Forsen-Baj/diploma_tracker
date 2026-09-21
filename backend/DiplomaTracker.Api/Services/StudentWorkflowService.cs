using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class StudentWorkflowService : IStudentWorkflowService
{
    private const int MaxTextLength = 2000;

    private readonly AppDbContext _dbContext;
    private readonly IAccessScope _accessScope;
    private readonly IFileStorage _fileStorage;
    private readonly ILogger<StudentWorkflowService> _logger;

    public StudentWorkflowService(AppDbContext dbContext, IAccessScope accessScope, IFileStorage fileStorage, ILogger<StudentWorkflowService> logger)
    {
        _dbContext = dbContext;
        _accessScope = accessScope;
        _fileStorage = fileStorage;
        _logger = logger;
    }

    /// Phase 8 §7.1. Approved is done; Submitted is with a reviewer and not the student's
    /// problem. Pending and Returned past the deadline are overdue. Evaluated against the
    /// server's clock so it never depends on the client's.
    public static bool IsOverdue(StudentTaskStatus status, DateTime deadline, DateTime now) =>
        status != StudentTaskStatus.Approved
        && status != StudentTaskStatus.Submitted
        && deadline < now;

    public async Task<(IReadOnlyList<StudentStepResponse>? steps, string? error)> GetMyStepsAsync(UserContext user)
    {
        var profile = await _dbContext.StudentProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == user.UserId && p.ArchivedAt == null);

        if (profile is null)
        {
            return (null, TaskErrors.StudentProfileNotFound);
        }

        var tasks = await LoadStudentTasksAsync(profile.Id, profile.GroupId);
        return (BuildSteps(tasks).Select(step => step.Response).ToList(), null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> GetStepAsync(UserContext user, Guid studentTaskId)
    {
        var access = await ResolveStepAccessAsync(user, studentTaskId);
        return access.error is not null ? (null, access.error) : (await BuildDetailsAsync(user, access.task!), null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> SubmitAsync(
        UserContext user,
        Guid studentTaskId,
        IFormFile? mainFile,
        IReadOnlyList<IFormFile> supportingFiles,
        string? message,
        CancellationToken cancellationToken)
    {
        var task = await _dbContext.StudentTasks
            .Include(t => t.StudentProfile)
            .Include(t => t.GroupTask)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId, cancellationToken);

        if (task is null || task.GroupTask.GroupId != task.StudentProfile.GroupId)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (task.StudentProfile.UserId != user.UserId)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "StudentTask", task.Id);
            return (null, WorkflowErrors.StudentTaskNotYours);
        }

        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId));
        var step = steps.First(s => s.Task.Id == task.Id);
        if (!step.Response.CanSubmit)
        {
            return (null, step.BlockError);
        }

        if (message is { Length: > MaxTextLength })
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var fileError = await SubmissionFileRules.ValidateMainAsync(mainFile) ?? await SubmissionFileRules.ValidateSupportingAsync(supportingFiles);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var now = DateTime.UtcNow;
        var version = await _dbContext.Submissions.CountAsync(s => s.StudentTaskId == task.Id, cancellationToken) + 1;
        var submission = new Submission
        {
            Id = Guid.NewGuid(),
            StudentTaskId = task.Id,
            Version = version,
            Message = IdentityNormalizer.Optional(message),
            SubmittedAt = now,
            IsLate = now > task.GroupTask.Deadline
        };

        var storedKeys = new List<string>();
        try
        {
            submission.Files.Add(await StoreAsync(mainFile!, SubmissionFileKind.Main, storedKeys, cancellationToken));
            foreach (var file in supportingFiles)
            {
                submission.Files.Add(await StoreAsync(file, SubmissionFileKind.Supporting, storedKeys, cancellationToken));
            }
        }
        catch (Exception)
        {
            // Nothing has touched the database yet at this point, so any failure while storing
            // files - a full disk, the ResolvePath traversal guard, etc. - unconditionally orphans
            // whatever was already stored. Clean it all up before rethrowing.
            await DeleteStoredKeysAsync(storedKeys, task.Id);
            throw;
        }

        task.Status = StudentTaskStatus.Submitted;
        task.UpdatedAt = now;
        _dbContext.Submissions.Add(submission);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            // Only compensate (delete the just-written files) when the exception proves nothing
            // committed. Any other failure - e.g. the save committed and the connection then
            // dropped - could be masking a durably-saved Submission/SubmissionFile/StudentTask,
            // and deleting the files in that case would strand the student with no way to
            // resubmit. A leaked file on disk is far cheaper than a lost one.
            if (exception is DbUpdateConcurrencyException
                || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
            {
                await DeleteStoredKeysAsync(storedKeys, task.Id);
                _dbContext.ChangeTracker.Clear();
                return (null, WorkflowErrors.AwaitingReview);
            }

            _logger.LogWarning(exception,
                "Submission save failed with an indeterminate outcome for student task {StudentTaskId}; leaving {StorageKeyCount} stored file(s) on disk rather than risk deleting a committed submission's files. Orphaned storage keys: {StorageKeys}",
                task.Id, storedKeys.Count, storedKeys);

            throw;
        }

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    private async Task DeleteStoredKeysAsync(IReadOnlyList<string> storedKeys, Guid studentTaskId)
    {
        foreach (var key in storedKeys)
        {
            try
            {
                await _fileStorage.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // A locked or read-only file must not mask the original exception or stop the
                // remaining keys from being cleaned up. On Windows a locked/read-only file often
                // throws UnauthorizedAccessException rather than IOException (fix wave M6).
                _logger.LogWarning(exception,
                    "Could not delete orphaned storage key {StorageKey} while rolling back a submission save for student task {StudentTaskId}.",
                    key, studentTaskId);
            }
        }
    }

    public async Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request)
    {
        if (request.Mark is null)
        {
            return (null, WorkflowErrors.MarkRequired);
        }

        // Mark is bound as decimal, not int, so a fractional value (e.g. 88.5) reaches here
        // instead of failing model binding with validation.failed - spec §7 wants
        // review.markOutOfRange for "a whole number from 0 to 100", fractional included.
        if (request.Mark is < 0 or > 100 || request.Mark % 1 != 0)
        {
            return (null, WorkflowErrors.MarkOutOfRange);
        }

        var mark = (int)request.Mark.Value;

        return await DecideAsync(user, submissionId, (submission, task, now) =>
        {
            submission.Decision = SubmissionDecision.Approved;
            submission.Mark = mark;
            submission.ReviewerComment = IdentityNormalizer.Optional(request.Comment);
            task.Status = StudentTaskStatus.Approved;
            task.Mark = mark;
            task.CompletedAt = now;
        });
    }

    public async Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request)
    {
        var comment = IdentityNormalizer.Optional(request.Comment);
        if (comment is null)
        {
            return (null, WorkflowErrors.CommentRequired);
        }

        return await DecideAsync(user, submissionId, (submission, task, _) =>
        {
            submission.Decision = SubmissionDecision.Returned;
            submission.ReviewerComment = comment;
            task.Status = StudentTaskStatus.Returned;
        });
    }

    public async Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await _dbContext.SubmissionFiles.AsNoTracking()
            .Where(f => f.Id == fileId)
            .Select(f => new
            {
                f.StorageKey,
                f.ContentType,
                f.OriginalName,
                f.Kind,
                StudentProfileId = f.Submission.StudentTask.StudentProfileId,
                StudentUserId = f.Submission.StudentTask.StudentProfile.UserId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (file is null)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var allowed = file.StudentUserId == user.UserId || await _accessScope.CanReviewStudentAsync(user, file.StudentProfileId);
        if (!allowed)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "SubmissionFile", fileId);
            return (null, WorkflowErrors.FileNotFound);
        }

        var stream = await _fileStorage.OpenReadAsync(file.StorageKey, cancellationToken);
        if (stream is null)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var contentType = file.Kind == SubmissionFileKind.Main ? file.ContentType : "application/octet-stream";

        SecurityLog.FileDownloaded(_logger, user.UserId, fileId, file.StudentProfileId);

        return (new StoredFileDownload(stream, contentType, file.OriginalName), null);
    }

    public const int ReviewQueueDefaultPageSize = 25;
    public const int ReviewQueueMaxPageSize = 100;

    public async Task<PagedResponse<ReviewQueueItem>> GetReviewQueueAsync(
        UserContext user,
        Guid? groupId,
        bool? late,
        int page,
        int pageSize)
    {
        // Phase 8 §8: an administrator used to receive every undecided submission in one array.
        // The page is clamped rather than refused - a bad page number is a client mistake, not
        // something a reviewer should see an error for.
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? ReviewQueueDefaultPageSize
            : pageSize > ReviewQueueMaxPageSize ? ReviewQueueMaxPageSize
            : pageSize;

        var reviewable = _accessScope.ReviewableStudents(user).Select(s => s.Id);

        var query = _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null
                && s.StudentTask.Status == StudentTaskStatus.Submitted
                && reviewable.Contains(s.StudentTask.StudentProfileId));

        if (groupId is not null)
        {
            query = query.Where(s => s.StudentTask.StudentProfile.GroupId == groupId);
        }

        if (late is not null)
        {
            query = query.Where(s => s.IsLate == late);
        }

        var total = await query.CountAsync();

        var rows = await query
            .OrderBy(s => s.SubmittedAt)
            .ThenBy(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new ReviewQueueItem
            {
                SubmissionId = s.Id,
                StudentTaskId = s.StudentTaskId,
                StudentProfileId = s.StudentTask.StudentProfileId,
                StudentName = s.StudentTask.StudentProfile.User.LastName + " "
                    + s.StudentTask.StudentProfile.User.FirstName
                    + (s.StudentTask.StudentProfile.User.Patronymic == null
                        ? ""
                        : " " + s.StudentTask.StudentProfile.User.Patronymic),
                GroupId = s.StudentTask.StudentProfile.GroupId,
                GroupCode = s.StudentTask.StudentProfile.Group.Code,
                StepTitle = s.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = s.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                Version = s.Version,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate
            })
            .ToListAsync();

        return new PagedResponse<ReviewQueueItem>
        {
            Items = rows,
            Page = page,
            PageSize = pageSize,
            Total = total
        };
    }

    public async Task<(GroupProgressResponse? progress, string? error)> GetGroupProgressAsync(UserContext user, Guid groupId)
    {
        var group = await _accessScope.VisibleGroups(user).AsNoTracking().FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Group", groupId);
            return (null, GroupErrors.NotFound);
        }

        var students = await _dbContext.StudentProfiles.AsNoTracking()
            .Include(p => p.User)
            .Where(p => p.GroupId == groupId && p.ArchivedAt == null && p.User.Role == "Student")
            .OrderBy(p => p.User.LastName)
            .ThenBy(p => p.User.FirstName)
            .ToListAsync();

        var groupTasks = await _dbContext.GroupTasks.AsNoTracking()
            .Include(gt => gt.DiplomaTaskTemplate)
            .Where(gt => gt.GroupId == groupId)
            .OrderBy(gt => gt.DiplomaTaskTemplate.Order)
            .ThenBy(gt => gt.DiplomaTaskTemplate.Title)
            .ToListAsync();

        var now = DateTime.UtcNow;

        var studentIds = students.Select(s => s.Id).ToList();
        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => studentIds.Contains(t.StudentProfileId) && t.GroupTask.GroupId == groupId)
            .Select(t => new
            {
                t.Id,
                t.StudentProfileId,
                t.GroupTaskId,
                t.Status,
                t.Mark,
                Deadline = t.GroupTask.Deadline,
                LatestLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();

        var byStudent = tasks.ToLookup(t => t.StudentProfileId);

        return (new GroupProgressResponse
        {
            GroupId = group.Id,
            GroupCode = group.Code,
            Steps = groupTasks.Select(gt => new GroupProgressStep
            {
                GroupTaskId = gt.Id,
                Title = gt.DiplomaTaskTemplate.Title,
                Order = gt.DiplomaTaskTemplate.Order,
                Deadline = gt.Deadline,
                ApprovedCount = tasks.Count(t => t.GroupTaskId == gt.Id && t.Status == StudentTaskStatus.Approved)
            }).ToList(),
            Students = students.Select(student => new GroupProgressStudent
            {
                StudentProfileId = student.Id,
                Name = PersonName.Full(student.User),
                Cells = groupTasks
                    .Select(gt => byStudent[student.Id].FirstOrDefault(t => t.GroupTaskId == gt.Id))
                    .Where(t => t is not null)
                    .Select(t => new GroupProgressCell
                    {
                        GroupTaskId = t!.GroupTaskId,
                        StudentTaskId = t.Id,
                        Status = t.Status.ToString(),
                        Mark = t.Mark,
                        IsLate = t.LatestLate ?? false,
                        IsOverdue = IsOverdue(t.Status, t.Deadline, now)
                    }).ToList()
            }).ToList()
        }, null);
    }

    public async Task<(StudentProgressResponse? progress, string? error)> GetStudentProgressAsync(UserContext user, Guid? studentProfileId)
    {
        StudentProfile? profile;
        if (studentProfileId is null)
        {
            profile = await _dbContext.StudentProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == user.UserId && p.ArchivedAt == null);
            if (profile is null)
            {
                return (null, TaskErrors.StudentProfileNotFound);
            }
        }
        else
        {
            profile = await _accessScope.ReviewableStudents(user).AsNoTracking().FirstOrDefaultAsync(p => p.Id == studentProfileId);
            if (profile is null)
            {
                SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "StudentProfile", studentProfileId.Value);
                return (null, OnboardingErrors.StudentNotFound);
            }
        }

        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.StudentProfileId == profile.Id && t.GroupTask.GroupId == profile.GroupId)
            .Select(t => new
            {
                t.Status,
                t.Mark,
                t.GroupTask.Deadline,
                LatestLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();

        var marks = tasks.Where(t => t.Mark is not null).Select(t => (double)t.Mark!.Value).ToList();

        return (new StudentProgressResponse
        {
            StudentProfileId = profile.Id,
            Approved = tasks.Count(t => t.Status == StudentTaskStatus.Approved),
            Total = tasks.Count,
            LateSteps = tasks.Count(t => t.LatestLate == true),
            AverageMark = marks.Count == 0 ? null : Math.Round(marks.Average(), 1),
            // Includes overdue unapproved steps (no `Deadline >= now` filter) and takes the
            // earliest, so a student with a missed step sees that deadline instead of a later,
            // still-upcoming one.
            NextDeadline = tasks
                .Where(t => t.Status != StudentTaskStatus.Approved)
                .Select(t => (DateTime?)t.Deadline)
                .OrderBy(d => d)
                .FirstOrDefault()
        }, null);
    }

    private async Task<(StepDetailsResponse? step, string? error)> DecideAsync(
        UserContext user,
        Guid submissionId,
        Action<Submission, StudentTask, DateTime> apply)
    {
        var submission = await _dbContext.Submissions
            .Include(s => s.StudentTask)
            .FirstOrDefaultAsync(s => s.Id == submissionId);

        if (submission is null)
        {
            return (null, WorkflowErrors.SubmissionNotFound);
        }

        if (!await _accessScope.CanReviewStudentAsync(user, submission.StudentTask.StudentProfileId))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Submission", submission.Id);
            return (null, WorkflowErrors.NotReviewer);
        }

        var latestVersion = await _dbContext.Submissions
            .Where(s => s.StudentTaskId == submission.StudentTaskId)
            .MaxAsync(s => s.Version);

        if (submission.Decision is not null
            || submission.Version != latestVersion
            || submission.StudentTask.Status != StudentTaskStatus.Submitted)
        {
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        var now = DateTime.UtcNow;
        apply(submission, submission.StudentTask, now);
        submission.ReviewerId = user.UserId;
        submission.DecidedAt = now;
        submission.StudentTask.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        SecurityLog.SubmissionDecided(
            _logger,
            user.UserId,
            submission.Id,
            submission.Decision!.Value.ToString(),
            submission.Mark);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, submission.StudentTaskId);
    }

    private async Task<(StudentTask? task, string? error)> ResolveStepAccessAsync(UserContext user, Guid studentTaskId)
    {
        var task = await _dbContext.StudentTasks.AsNoTracking()
            .Include(t => t.StudentProfile).ThenInclude(p => p.User)
            .Include(t => t.StudentProfile).ThenInclude(p => p.Group)
            .Include(t => t.GroupTask).ThenInclude(gt => gt.DiplomaTaskTemplate)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId);

        if (task is null || task.GroupTask.GroupId != task.StudentProfile.GroupId)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (user.IsStudent)
        {
            if (task.StudentProfile.UserId == user.UserId)
            {
                return (task, null);
            }

            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "StudentTask", task.Id);
            return (null, WorkflowErrors.StudentTaskNotYours);
        }

        return await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId)
            ? (task, null)
            : (null, TaskErrors.StudentTaskNotFound);
    }

    private async Task<StepDetailsResponse> BuildDetailsAsync(UserContext user, StudentTask task)
    {
        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId));
        var step = steps.First(s => s.Task.Id == task.Id).Response;

        var timeline = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.StudentTaskId == task.Id)
            .OrderBy(s => s.Version)
            .Select(s => new
            {
                s.Id,
                s.Version,
                s.Message,
                s.SubmittedAt,
                s.IsLate,
                s.Decision,
                ReviewerLastName = s.Reviewer != null ? s.Reviewer.LastName : null,
                ReviewerFirstName = s.Reviewer != null ? s.Reviewer.FirstName : null,
                ReviewerPatronymic = s.Reviewer != null ? s.Reviewer.Patronymic : null,
                s.ReviewerComment,
                s.Mark,
                s.DecidedAt,
                Files = s.Files.OrderBy(f => f.Kind).ThenBy(f => f.OriginalName)
                    .Select(f => new { f.Id, f.Kind, f.OriginalName, f.SizeBytes })
                    .ToList()
            })
            .ToListAsync();

        var pending = timeline.LastOrDefault(s => s.Decision is null);
        var canReview = !user.IsStudent && task.Status == StudentTaskStatus.Submitted && pending is not null;

        return new StepDetailsResponse
        {
            Id = step.Id,
            GroupTaskId = step.GroupTaskId,
            Title = step.Title,
            Description = step.Description,
            Order = step.Order,
            Deadline = step.Deadline,
            Status = step.Status,
            Mark = step.Mark,
            CompletedAt = step.CompletedAt,
            IsLate = step.IsLate,
            LatestSubmittedAt = step.LatestSubmittedAt,
            CanSubmit = user.IsStudent && step.CanSubmit,
            BlockReason = step.BlockReason,
            StudentProfileId = task.StudentProfileId,
            StudentName = PersonName.Full(task.StudentProfile.User),
            GroupCode = task.StudentProfile.Group.Code,
            CanReview = canReview,
            PendingSubmissionId = canReview ? pending!.Id : null,
            Timeline = timeline.Select(s => new SubmissionResponse
            {
                Id = s.Id,
                Version = s.Version,
                Message = s.Message,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate,
                Decision = s.Decision?.ToString(),
                ReviewerName = s.ReviewerLastName is null ? null : JoinName(s.ReviewerLastName, s.ReviewerFirstName, s.ReviewerPatronymic),
                ReviewerComment = s.ReviewerComment,
                Mark = s.Mark,
                DecidedAt = s.DecidedAt,
                Files = s.Files.Select(f => new SubmissionFileResponse
                {
                    Id = f.Id,
                    Kind = f.Kind.ToString(),
                    OriginalName = f.OriginalName,
                    SizeBytes = f.SizeBytes
                }).ToList()
            }).ToList()
        };
    }

    private async Task<List<StepRow>> LoadStudentTasksAsync(Guid studentProfileId, Guid groupId)
    {
        return await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.StudentProfileId == studentProfileId && t.GroupTask.GroupId == groupId)
            .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
            .ThenBy(t => t.GroupTask.DiplomaTaskTemplate.Title)
            .Select(t => new StepRow
            {
                Id = t.Id,
                GroupTaskId = t.GroupTaskId,
                Title = t.GroupTask.DiplomaTaskTemplate.Title,
                Description = t.GroupTask.DiplomaTaskTemplate.Description,
                Order = t.GroupTask.DiplomaTaskTemplate.Order,
                Deadline = t.GroupTask.Deadline,
                Status = t.Status,
                Mark = t.Mark,
                CompletedAt = t.CompletedAt,
                LatestSubmittedAt = t.Submissions.OrderByDescending(s => s.Version).Select(s => (DateTime?)s.SubmittedAt).FirstOrDefault(),
                LatestIsLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();
    }

    private static List<BuiltStep> BuildSteps(IReadOnlyList<StepRow> rows)
    {
        var result = new List<BuiltStep>(rows.Count);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var previousApproved = index == 0 || rows[index - 1].Status == StudentTaskStatus.Approved;

            string? blockError = row.Status switch
            {
                StudentTaskStatus.Approved => WorkflowErrors.AlreadyApproved,
                StudentTaskStatus.Submitted => WorkflowErrors.AwaitingReview,
                _ when !previousApproved => WorkflowErrors.PreviousNotApproved,
                _ => null
            };

            result.Add(new BuiltStep(row, blockError, new StudentStepResponse
            {
                Id = row.Id,
                GroupTaskId = row.GroupTaskId,
                Title = row.Title,
                Description = row.Description,
                Order = row.Order,
                Deadline = row.Deadline,
                Status = row.Status.ToString(),
                Mark = row.Mark,
                CompletedAt = row.CompletedAt,
                IsLate = row.LatestIsLate ?? false,
                LatestSubmittedAt = row.LatestSubmittedAt,
                CanSubmit = blockError is null,
                BlockReason = blockError
            }));
        }

        return result;
    }

    private async Task<SubmissionFile> StoreAsync(IFormFile file, SubmissionFileKind kind, List<string> storedKeys, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var key = await _fileStorage.SaveAsync(stream, cancellationToken);
        storedKeys.Add(key);

        return new SubmissionFile
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            OriginalName = SubmissionFileRules.SafeOriginalName(file.FileName),
            StorageKey = key,
            ContentType = SubmissionFileRules.ContentTypeFor(file, kind),
            SizeBytes = file.Length
        };
    }

    private static string JoinName(params string?[] parts) =>
        string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));

    private sealed record BuiltStep(StepRow Task, string? BlockError, StudentStepResponse Response);

    private sealed class StepRow
    {
        public Guid Id { get; init; }
        public Guid GroupTaskId { get; init; }
        public string Title { get; init; } = string.Empty;
        public string? Description { get; init; }
        public int Order { get; init; }
        public DateTime Deadline { get; init; }
        public StudentTaskStatus Status { get; init; }
        public int? Mark { get; init; }
        public DateTime? CompletedAt { get; init; }
        public DateTime? LatestSubmittedAt { get; init; }
        public bool? LatestIsLate { get; init; }
    }
}
