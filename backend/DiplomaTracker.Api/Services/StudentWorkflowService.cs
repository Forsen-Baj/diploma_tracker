using System.Linq.Expressions;
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
        var steps = BuildSteps(tasks, profile.TopicId is not null).Select(step => step.Response).ToList();
        await FillPanelCountsAsync(steps);
        return (steps, null);
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

        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId), task.StudentProfile.TopicId is not null);
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

        // I2: a resubmission whose panel is already fully satisfied (every open seat was filled by
        // a sticky approval from an earlier version) is approved at once, instead of waiting in
        // Submitted for a panel with nobody left to decide (spec §2: "after resubmission, only the
        // reviewers who have not approved decide again" - here none are left).
        await CompleteIfPanelSatisfiedAsync(task, submission, now);

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
            if (exception is DbUpdateConcurrencyException)
            {
                await DeleteStoredKeysAsync(storedKeys, task.Id);
                _dbContext.ChangeTracker.Clear();

                // M7: the RowVersion mismatch may be a panel edit (add/remove reviewer) racing this
                // submit rather than a second submission beating this one to the row - a supervisor
                // adding a reviewer at the moment the student presses Submit must not be told "the
                // latest submission is still under review", which would be false. Reload and answer
                // the generic, retryable panel.changed instead; only when the step is genuinely no
                // longer submittable does the old awaitingReview answer still apply.
                var reloaded = await _dbContext.StudentTasks.AsNoTracking()
                    .Include(t => t.StudentProfile)
                    .FirstOrDefaultAsync(t => t.Id == task.Id, cancellationToken);

                if (reloaded is not null)
                {
                    var reloadedSteps = BuildSteps(
                        await LoadStudentTasksAsync(reloaded.StudentProfileId, reloaded.StudentProfile.GroupId),
                        reloaded.StudentProfile.TopicId is not null);
                    var reloadedStep = reloadedSteps.First(s => s.Task.Id == reloaded.Id);

                    if (reloadedStep.Response.CanSubmit)
                    {
                        return (null, WorkflowErrors.PanelChanged);
                    }
                }

                return (null, WorkflowErrors.AwaitingReview);
            }

            if (exception is DbUpdateException update && update.IsUniqueConstraintViolation())
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

        return await DecideAsync(user, submissionId, SubmissionDecision.Approved, (int)request.Mark.Value, IdentityNormalizer.Optional(request.Comment));
    }

    public async Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request)
    {
        var comment = IdentityNormalizer.Optional(request.Comment);
        if (comment is null)
        {
            return (null, WorkflowErrors.CommentRequired);
        }

        return await DecideAsync(user, submissionId, SubmissionDecision.Returned, null, comment);
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
                StudentTaskId = f.Submission.StudentTaskId,
                StudentUserId = f.Submission.StudentTask.StudentProfile.UserId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (file is null)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var allowed = file.StudentUserId == user.UserId || await _accessScope.CanSeeStudentTaskAsync(user, file.StudentTaskId);
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

        // Design 2026-09-24 §3.5. A teacher's queue is the steps where they hold an OPEN seat; a
        // group reviewer who sits on no panel watches the group and has nothing to decide. An
        // administrator sees every submission still awaiting its panel.
        // M14: a student who moved groups while a version was pending leaves a queue item that
        // opens as studentTask.notFound - agree with the admin dashboard's waiting count.
        var query = _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null
                && s.StudentTask.Status == StudentTaskStatus.Submitted
                && s.StudentTask.GroupTask.GroupId == s.StudentTask.StudentProfile.GroupId);

        if (user.IsTeacher)
        {
            var me = user.UserId;
            query = query.Where(s => s.StudentTask.StudentProfile.ArchivedAt == null && (
                (s.StudentTask.StudentProfile.SupervisorId == me
                    && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                        r.Seat == ReviewSeat.Supervisor
                        && r.Decision == SubmissionDecision.Approved
                        && (r.ReviewerId == me || r.Reviewer.Role == "Admin")))
                // An extra who has become the supervisor sits in the supervisor seat instead.
                || (s.StudentTask.StudentProfile.SupervisorId != me
                    && s.StudentTask.Reviewers.Any(x => x.ReviewerId == me
                        && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                            r.Seat == ReviewSeat.Extra
                            && r.Decision == SubmissionDecision.Approved
                            && r.ReviewerId == me
                            && r.DecidedAt >= x.AddedAt)))));
        }
        else if (!user.IsAdmin)
        {
            query = query.Where(_ => false);
        }

        if (groupId is not null)
        {
            query = query.Where(s => s.StudentTask.StudentProfile.GroupId == groupId);
        }

        if (late is not null)
        {
            query = query.Where(s => s.IsLate == late);
        }

        var total = await query.CountAsync();

        // M4: page and pageSize are both clamped above, but page alone can still be large enough
        // that (page - 1) * pageSize overflows a 32-bit int (e.g. page=100000000, pageSize=100)
        // and wraps negative, which SQL Server refuses as an OFFSET. Computed in long and capped,
        // a page past the end simply finds nothing to skip to and returns an empty page.
        var offset = (long)(page - 1) * pageSize;
        if (offset > int.MaxValue)
        {
            offset = int.MaxValue;
        }

        var rows = await query
            .OrderBy(s => s.SubmittedAt)
            .ThenBy(s => s.Id)
            .Skip((int)offset)
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

        var facts = await LoadPanelFactsAsync(rows.Select(r => r.StudentTaskId).ToList());
        foreach (var row in rows)
        {
            if (facts.TryGetValue(row.StudentTaskId, out var fact))
            {
                var panel = fact.Evaluate();
                row.PanelSize = panel.Size;
                row.PanelApproved = panel.Satisfied;
            }
        }

        return new PagedResponse<ReviewQueueItem>
        {
            Items = rows,
            Page = page,
            PageSize = pageSize,
            Total = total
        };
    }

    /// O3: every visible student and where they are - an overview, not just submissions awaiting
    /// a decision (that stays GetReviewQueueAsync above, which the dashboards' own "waiting for
    /// review" lists still call directly). "Current step" is the first step in order that is not
    /// Approved, or the last step when every one is; projected as two ordered subqueries
    /// (CurrentOpen/LastStep) the same way TopicService.Projection projects a topic's Holder and
    /// Request, and combined with ?? once materialized, since EF cannot translate that
    /// null-coalesce into one query. Visible students for a teacher or administrator are bounded
    /// (their own students, or every active student for an administrator), so - like
    /// GetGroupProgressAsync just above - this loads them in full and paginates in memory rather
    /// than trying to push the state filter, which depends on the computed current step, into SQL.
    public async Task<(PagedResponse<ReviewStudentItem>? result, string? error)> GetReviewStudentsAsync(
        UserContext user,
        Guid? groupId,
        bool? late,
        string? state,
        int page,
        int pageSize)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? ReviewQueueDefaultPageSize
            : pageSize > ReviewQueueMaxPageSize ? ReviewQueueMaxPageSize
            : pageSize;

        var stateFilter = ReviewStateFilter.All;
        if (!string.IsNullOrWhiteSpace(state) && !Enum.TryParse<ReviewStateFilter>(state, ignoreCase: true, out stateFilter))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var query = _accessScope.ReviewOverviewStudents(user);
        if (groupId is not null)
        {
            query = query.Where(s => s.GroupId == groupId);
        }

        var rows = await query.Select(BuildReviewStudentProjection(user)).ToListAsync();

        // Only a Submitted current step ever has an open panel to load facts for.
        var currentTaskIds = rows
            .Select(r => r.CurrentOpen ?? r.LastStep)
            .Where(c => c is not null && c.Status == StudentTaskStatus.Submitted)
            .Select(c => c!.StudentTaskId)
            .ToList();

        var facts = await LoadPanelFactsAsync(currentTaskIds);

        var now = DateTime.UtcNow;
        var working = new List<ReviewStudentWorking>(rows.Count);
        foreach (var row in rows)
        {
            var current = row.CurrentOpen ?? row.LastStep;
            int? panelSize = null;
            int? panelApproved = null;
            var isMyDecision = false;

            if (current is not null && current.Status == StudentTaskStatus.Submitted
                && facts.TryGetValue(current.StudentTaskId, out var fact))
            {
                var panel = fact.Evaluate();
                panelSize = panel.Size;
                panelApproved = panel.Satisfied;

                // Reuses GetReviewQueueAsync's own notion of "waiting for the caller's decision":
                // the seat their decision would fill, and whether that seat is already satisfied.
                var seat = ReviewPanel.SeatFor(user, fact.SupervisorId, fact.Extras);
                isMyDecision = seat is not null && !ReviewPanel.IsSeatSatisfied(panel, seat.Value, user.UserId);
            }

            // I2: "late" is the app's existing notion (StepStatusBadge's isLate/isOverdue pair,
            // GroupProgressMatrix), not just the latest submission's own flag - a step nobody has
            // touched past its deadline is just as much something a reviewer needs to see.
            var isOverdue = current is not null && IsOverdue(current.Status, current.Deadline, now);

            working.Add(new ReviewStudentWorking(row, current, panelSize, panelApproved, isMyDecision, isOverdue));
        }

        IEnumerable<ReviewStudentWorking> filtered = working;

        if (late is not null)
        {
            filtered = filtered.Where(w => IsLateOrOverdue(w) == late);
        }

        filtered = stateFilter switch
        {
            ReviewStateFilter.Waiting => filtered.Where(w => w.IsMyDecision),
            ReviewStateFilter.NotStarted => filtered.Where(w => w.Current is { Status: StudentTaskStatus.Pending }),
            ReviewStateFilter.Submitted => filtered.Where(w => w.Current is { Status: StudentTaskStatus.Submitted }),
            ReviewStateFilter.Returned => filtered.Where(w => w.Current is { Status: StudentTaskStatus.Returned }),
            ReviewStateFilter.Approved => filtered.Where(w => w.Current is { Status: StudentTaskStatus.Approved }),
            _ => filtered
        };

        // A row waiting for the caller's decision sorts first, oldest submission first; the rest
        // sort by group code, then student last name, first name (§ O3).
        var ordered = filtered
            .OrderByDescending(w => w.IsMyDecision)
            .ThenBy(w => w.IsMyDecision ? w.Current!.LatestSubmission!.SubmittedAt : (DateTime?)null)
            .ThenBy(w => w.Row.GroupCode, StringComparer.Ordinal)
            .ThenBy(w => w.Row.LastName, StringComparer.Ordinal)
            .ThenBy(w => w.Row.FirstName, StringComparer.Ordinal)
            .ToList();

        var total = ordered.Count;
        var items = ordered.Skip((page - 1) * pageSize).Take(pageSize).Select(ToReviewStudentItem).ToList();

        return (new PagedResponse<ReviewStudentItem>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            Total = total
        }, null);
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

        // Design 2026-09-24: a row is openable for an administrator, a reviewer of the group (both
        // already give every student here via `ReviewableStudents`), or the student's own
        // supervisor. Computed once for the whole group, not per student.
        var reviewableIds = (await _accessScope.ReviewableStudents(user)
            .Where(s => studentIds.Contains(s.Id))
            .Select(s => s.Id)
            .ToListAsync())
            .ToHashSet();

        var submittedTaskIds = tasks.Where(t => t.Status == StudentTaskStatus.Submitted).Select(t => t.Id).ToList();
        var panelFacts = await LoadPanelFactsAsync(submittedTaskIds);

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
                CanOpen = reviewableIds.Contains(student.Id),
                Cells = groupTasks
                    .Select(gt => byStudent[student.Id].FirstOrDefault(t => t.GroupTaskId == gt.Id))
                    .Where(t => t is not null)
                    .Select(t =>
                    {
                        var panel = t!.Status == StudentTaskStatus.Submitted && panelFacts.TryGetValue(t.Id, out var fact)
                            ? fact.Evaluate()
                            : null;
                        return new GroupProgressCell
                        {
                            GroupTaskId = t.GroupTaskId,
                            StudentTaskId = t.Id,
                            Status = t.Status.ToString(),
                            Mark = t.Mark,
                            IsLate = t.LatestLate ?? false,
                            IsOverdue = IsOverdue(t.Status, t.Deadline, now),
                            PanelApproved = panel?.Satisfied,
                            PanelSize = panel?.Size
                        };
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

    public async Task<(IReadOnlyList<PanelSeatResponse>? panel, string? error)> GetPanelAsync(UserContext user, Guid studentTaskId)
    {
        var (step, error) = await GetStepAsync(user, studentTaskId);
        return step is null ? (null, error) : (step.Panel, null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> AddReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId)
    {
        var (task, error) = await LoadTaskForPanelChangeAsync(user, studentTaskId);
        if (task is null)
        {
            return (null, error);
        }

        // M5: spec §2 says group reviewers "do not mark steps themselves" - a group reviewer must
        // not sidestep that by adding themselves as an extra. The supervisor or an administrator
        // may still name them.
        if (reviewerId == user.UserId && task.StudentProfile.SupervisorId != user.UserId && !user.IsAdmin)
        {
            return (null, WorkflowErrors.PanelNotAllowed);
        }

        var reviewer = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == reviewerId);
        if (reviewer is null || !reviewer.IsActive || (reviewer.Role != "Teacher" && reviewer.Role != "Admin"))
        {
            return (null, WorkflowErrors.PanelReviewerInvalid);
        }

        if (reviewer.Id == task.StudentProfile.SupervisorId)
        {
            return (null, WorkflowErrors.PanelReviewerIsSupervisor);
        }

        if (await _dbContext.StudentTaskReviewers.AnyAsync(r => r.StudentTaskId == task.Id && r.ReviewerId == reviewerId))
        {
            return (null, WorkflowErrors.PanelReviewerExists);
        }

        var now = DateTime.UtcNow;
        _dbContext.StudentTaskReviewers.Add(new StudentTaskReviewer
        {
            Id = Guid.NewGuid(),
            StudentTaskId = task.Id,
            ReviewerId = reviewerId,
            AddedById = user.UserId,
            AddedAt = now
        });

        // The step's RowVersion orders panel changes against decisions (§3.3).
        task.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelChanged);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelReviewerExists);
        }

        SecurityLog.ReviewPanelChanged(_logger, user.UserId, "Added", task.Id, reviewerId);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    public async Task<(StepDetailsResponse? step, string? error)> RemoveReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId)
    {
        var (task, error) = await LoadTaskForPanelChangeAsync(user, studentTaskId);
        if (task is null)
        {
            return (null, error);
        }

        var row = await _dbContext.StudentTaskReviewers
            .FirstOrDefaultAsync(r => r.StudentTaskId == task.Id && r.ReviewerId == reviewerId);
        if (row is null)
        {
            return (null, WorkflowErrors.PanelReviewerNotFound);
        }

        var now = DateTime.UtcNow;
        _dbContext.StudentTaskReviewers.Remove(row);
        task.UpdatedAt = now;

        // §3.3: a removal that leaves every remaining seat satisfied approves the step at once -
        // otherwise a version already approved by everyone else would wait for nobody.
        if (task.Status == StudentTaskStatus.Submitted)
        {
            var latest = await _dbContext.Submissions
                .Where(s => s.StudentTaskId == task.Id)
                .OrderByDescending(s => s.Version)
                .FirstAsync();

            await CompleteIfPanelSatisfiedAsync(task, latest, now, excludingReviewerId: reviewerId);
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelChanged);
        }

        SecurityLog.ReviewPanelChanged(_logger, user.UserId, "Removed", task.Id, reviewerId);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    /// Design 2026-09-24 §3.1: the supervisor, a reviewer of the student's group or an administrator
    /// may change a panel, while the step is not approved and the student is not archived.
    private async Task<(StudentTask? task, string? error)> LoadTaskForPanelChangeAsync(UserContext user, Guid studentTaskId)
    {
        var task = await _dbContext.StudentTasks
            .Include(t => t.StudentProfile)
            .Include(t => t.GroupTask)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId);

        if (task is null
            || task.GroupTask.GroupId != task.StudentProfile.GroupId
            || task.StudentProfile.ArchivedAt is not null)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (!await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "StudentTaskReviewers", task.Id);

            // An extra reviewer sees this step but does not manage its panel; anyone else must not
            // learn that it exists.
            return await _accessScope.CanSeeStudentTaskAsync(user, task.Id)
                ? (null, WorkflowErrors.PanelNotAllowed)
                : (null, TaskErrors.StudentTaskNotFound);
        }

        return task.Status == StudentTaskStatus.Approved
            ? (null, WorkflowErrors.AlreadyApproved)
            : (task, null);
    }

    /// Design 2026-09-24 §3.3. The caller's decision fills their seat on the panel. A return sends
    /// the step back at once; an approval closes the step only when it leaves every seat satisfied.
    private async Task<(StepDetailsResponse? step, string? error)> DecideAsync(
        UserContext user,
        Guid submissionId,
        SubmissionDecision decision,
        int? mark,
        string? comment)
    {
        var submission = await _dbContext.Submissions
            .Include(s => s.StudentTask).ThenInclude(t => t.StudentProfile)
            .FirstOrDefaultAsync(s => s.Id == submissionId);

        // M12: an administrator can see every task regardless of archiving, so the archived check
        // has to be explicit here too - not just left to CanSeeStudentTaskAsync below - and answers
        // like a missing submission, the same as before the student was ever archived.
        if (submission is null || submission.StudentTask.StudentProfile.ArchivedAt is not null)
        {
            return (null, WorkflowErrors.SubmissionNotFound);
        }

        var task = submission.StudentTask;

        // M3: a caller who cannot see this step at all learns nothing about it - the same 404 a
        // missing submission gets. Only a caller who can see the step but holds no seat (e.g. a
        // group reviewer) is told they are not on its panel.
        if (!await _accessScope.CanSeeStudentTaskAsync(user, task.Id))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Submission", submission.Id);
            return (null, WorkflowErrors.SubmissionNotFound);
        }

        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var seat = ReviewPanel.SeatFor(user, facts.SupervisorId, facts.Extras);

        if (seat is null)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Submission", submission.Id);
            return (null, WorkflowErrors.NotOnPanel);
        }

        var latestVersion = await _dbContext.Submissions
            .Where(s => s.StudentTaskId == task.Id)
            .MaxAsync(s => s.Version);

        if (submission.Decision is not null
            || submission.Version != latestVersion
            || task.Status != StudentTaskStatus.Submitted)
        {
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        if (ReviewPanel.IsSeatSatisfied(facts.Evaluate(), seat.Value, user.UserId))
        {
            return (null, WorkflowErrors.SeatSatisfied);
        }

        var now = DateTime.UtcNow;

        // I1 ruling: the unique (SubmissionId, ReviewerId) index says a reviewer decides once per
        // version, but a re-added (or seat-moved) reviewer's earlier approval on this same version
        // can stop counting (ReviewPanel.Evaluate's DecidedAt >= AddedAt), leaving their seat open
        // again. Rather than insert a second row and hit that index, update the existing one in
        // place - Seat included, so a caller who decided in a different seat on this version (e.g.
        // an extra later absorbed into the supervisor seat) is recorded correctly - and let the
        // panel evaluation below proceed exactly as it would for a new decision.
        var existingReview = await _dbContext.SubmissionReviews
            .FirstOrDefaultAsync(r => r.SubmissionId == submission.Id && r.ReviewerId == user.UserId);

        if (existingReview is not null)
        {
            existingReview.Seat = seat.Value;
            existingReview.Decision = decision;
            existingReview.Mark = mark;
            existingReview.Comment = comment;
            existingReview.DecidedAt = now;
        }
        else
        {
            _dbContext.SubmissionReviews.Add(new SubmissionReview
            {
                Id = Guid.NewGuid(),
                SubmissionId = submission.Id,
                ReviewerId = user.UserId,
                Seat = seat.Value,
                Decision = decision,
                Mark = mark,
                Comment = comment,
                DecidedAt = now
            });
        }

        // Every decision touches the step, so its RowVersion serialises decisions: two reviewers
        // deciding at the same moment cannot both complete the panel or both return (§3.3).
        task.UpdatedAt = now;

        if (decision == SubmissionDecision.Returned)
        {
            submission.Decision = SubmissionDecision.Returned;
            submission.DecidedAt = now;
            task.Status = StudentTaskStatus.Returned;
        }
        else
        {
            var after = ReviewPanel.Evaluate(
                facts.SupervisorId,
                facts.Extras,
                [.. facts.Reviews, new ReviewPanel.ReviewFact(user.UserId, user.IsAdmin, seat.Value, decision, mark, now)]);

            if (after.IsComplete)
            {
                CompleteStep(submission, task, after, now);
            }
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        SecurityLog.SubmissionDecided(_logger, user.UserId, submission.Id, decision.ToString(), mark);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    /// What the panel of one step is made of, as loaded; ReviewPanel decides what it means.
    private sealed record PanelFacts(
        Guid? SupervisorId,
        IReadOnlyList<ReviewPanel.ExtraSeatFact> Extras,
        IReadOnlyList<ReviewPanel.ReviewFact> Reviews)
    {
        public ReviewPanel.PanelState Evaluate() => ReviewPanel.Evaluate(SupervisorId, Extras, Reviews);
    }

    /// Loads the panel facts of many steps in three queries, whatever their number - the queue and
    /// "My work" show a panel count on every row.
    private async Task<Dictionary<Guid, PanelFacts>> LoadPanelFactsAsync(IReadOnlyCollection<Guid> studentTaskIds)
    {
        var ids = studentTaskIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, PanelFacts>();
        }

        var supervisors = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new { t.Id, t.StudentProfile.SupervisorId })
            .ToListAsync();

        var extras = await _dbContext.StudentTaskReviewers.AsNoTracking()
            .Where(r => ids.Contains(r.StudentTaskId))
            .Select(r => new { r.StudentTaskId, r.ReviewerId, r.AddedAt })
            .ToListAsync();

        var reviews = await _dbContext.SubmissionReviews.AsNoTracking()
            .Where(r => ids.Contains(r.Submission.StudentTaskId))
            .Select(r => new
            {
                r.Submission.StudentTaskId,
                r.ReviewerId,
                ReviewerIsAdmin = r.Reviewer.Role == "Admin",
                r.Seat,
                r.Decision,
                r.Mark,
                r.DecidedAt
            })
            .ToListAsync();

        var extrasByTask = extras.ToLookup(e => e.StudentTaskId);
        var reviewsByTask = reviews.ToLookup(r => r.StudentTaskId);

        return supervisors.ToDictionary(
            t => t.Id,
            t => new PanelFacts(
                t.SupervisorId,
                extrasByTask[t.Id].Select(e => new ReviewPanel.ExtraSeatFact(e.ReviewerId, e.AddedAt)).ToList(),
                reviewsByTask[t.Id]
                    .Select(r => new ReviewPanel.ReviewFact(r.ReviewerId, r.ReviewerIsAdmin, r.Seat, r.Decision, r.Mark, r.DecidedAt))
                    .ToList()));
    }

    private async Task FillPanelCountsAsync(IReadOnlyList<StudentStepResponse> steps)
    {
        var facts = await LoadPanelFactsAsync(steps.Select(s => s.Id).ToList());
        foreach (var step in steps)
        {
            if (facts.TryGetValue(step.Id, out var fact))
            {
                var panel = fact.Evaluate();
                step.PanelSize = panel.Size;
                step.PanelApproved = panel.Satisfied;
            }
        }
    }

    /// I2: completes a `Submitted` step at once when its panel is already fully satisfied - shared
    /// by the removal path (a removal that leaves every remaining seat satisfied) and by
    /// `SubmitAsync` (a resubmission whose sticky approvals already fill every seat). `excludingReviewerId`
    /// is the extra being removed, so their own seat drops out of the evaluation before it completes.
    private async Task CompleteIfPanelSatisfiedAsync(StudentTask task, Submission latest, DateTime now, Guid? excludingReviewerId = null)
    {
        if (task.Status != StudentTaskStatus.Submitted || latest.Decision is not null)
        {
            return;
        }

        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        if (excludingReviewerId is { } excluded)
        {
            facts = facts with { Extras = facts.Extras.Where(e => e.ReviewerId != excluded).ToList() };
        }

        var after = facts.Evaluate();
        if (after.IsComplete)
        {
            CompleteStep(latest, task, after, now);
        }
    }

    /// The approval (or removal) that leaves every seat satisfied closes the step (§3.3).
    private static void CompleteStep(Submission submission, StudentTask task, ReviewPanel.PanelState panel, DateTime now)
    {
        submission.Decision = SubmissionDecision.Approved;
        submission.DecidedAt = now;
        task.Status = StudentTaskStatus.Approved;
        task.Mark = panel.AverageMark();
        task.CompletedAt = now;
        task.UpdatedAt = now;
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

        return await _accessScope.CanSeeStudentTaskAsync(user, task.Id)
            ? (task, null)
            : (null, TaskErrors.StudentTaskNotFound);
    }

    private async Task<StepDetailsResponse> BuildDetailsAsync(UserContext user, StudentTask task)
    {
        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId), task.StudentProfile.TopicId is not null);
        var step = steps.First(s => s.Task.Id == task.Id).Response;

        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var panel = facts.Evaluate();

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
                s.DecidedAt,
                Reviews = s.Reviews.OrderBy(r => r.DecidedAt)
                    .Select(r => new
                    {
                        r.Id,
                        r.ReviewerId,
                        r.Reviewer.LastName,
                        r.Reviewer.FirstName,
                        r.Reviewer.Patronymic,
                        r.Seat,
                        r.Decision,
                        r.Mark,
                        r.Comment,
                        r.DecidedAt
                    })
                    .ToList(),
                Files = s.Files.OrderBy(f => f.Kind).ThenBy(f => f.OriginalName)
                    .Select(f => new { f.Id, f.Kind, f.OriginalName, f.SizeBytes })
                    .ToList()
            })
            .ToListAsync();

        var latest = timeline.LastOrDefault();
        Guid? pendingId = latest is not null && latest.Decision is null ? latest.Id : null;

        var seat = user.IsStudent ? null : ReviewPanel.SeatFor(user, facts.SupervisorId, facts.Extras);
        var canDecide = seat is not null
            && task.Status == StudentTaskStatus.Submitted
            && pendingId is not null
            && !ReviewPanel.IsSeatSatisfied(panel, seat.Value, user.UserId)
            // M12: an administrator can otherwise decide on an archived student's step, which
            // changes the live step after the archive snapshot was taken and leaves it stale.
            && task.StudentProfile.ArchivedAt is null;

        var canManagePanel = !user.IsStudent
            && task.Status != StudentTaskStatus.Approved
            && task.StudentProfile.ArchivedAt is null
            && await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId);

        // The seats that returned the version now with the student - shown as Returned until they approve.
        List<(ReviewSeat Seat, Guid ReviewerId)> returnedOnLatest = task.Status == StudentTaskStatus.Returned && latest is not null
            ? latest.Reviews.Where(r => r.Decision == SubmissionDecision.Returned).Select(r => (r.Seat, r.ReviewerId)).ToList()
            : [];

        // M13: project to the name/status fields the step page needs, instead of loading whole
        // AppUser rows (PasswordHash included) on every read.
        var seatUserIds = panel.Seats.Where(s => s.ReviewerId is not null).Select(s => s.ReviewerId!.Value).ToList();
        var seatUsers = await _dbContext.Users.AsNoTracking()
            .Where(u => seatUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.LastName, u.FirstName, u.Patronymic, u.IsActive })
            .ToDictionaryAsync(u => u.Id);

        string? NameOf(Guid? id) => id is { } value && seatUsers.TryGetValue(value, out var person)
            ? PersonName.Full(person.LastName, person.FirstName, person.Patronymic)
            : null;

        bool IsActive(Guid? id) => id is { } value && seatUsers.TryGetValue(value, out var person) && person.IsActive;

        string StateOf(ReviewPanel.SeatState s) =>
            s.IsSatisfied ? "Approved"
            : returnedOnLatest.Any(r => r.Seat == s.Seat && (s.Seat == ReviewSeat.Supervisor || r.ReviewerId == s.ReviewerId)) ? "Returned"
            : "Waiting";

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
            PanelSize = panel.Size,
            PanelApproved = panel.Satisfied,
            StudentProfileId = task.StudentProfileId,
            StudentName = PersonName.Full(task.StudentProfile.User),
            GroupCode = task.StudentProfile.Group.Code,
            CanDecide = canDecide,
            PendingSubmissionId = canDecide ? pendingId : null,
            CanManagePanel = canManagePanel,
            Panel = panel.Seats.Select(s => new PanelSeatResponse
            {
                Seat = s.Seat.ToString(),
                ReviewerId = s.ReviewerId,
                ReviewerName = NameOf(s.ReviewerId),
                IsActive = IsActive(s.ReviewerId),
                State = StateOf(s),
                Mark = s.Mark,
                CanRemove = canManagePanel && s.Seat == ReviewSeat.Extra
            }).ToList(),
            Timeline = timeline.Select(s => new SubmissionResponse
            {
                Id = s.Id,
                Version = s.Version,
                Message = s.Message,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate,
                Decision = s.Decision?.ToString(),
                DecidedAt = s.DecidedAt,
                Reviews = s.Reviews.Select(r => new SubmissionReviewResponse
                {
                    Id = r.Id,
                    ReviewerName = JoinName(r.LastName, r.FirstName, r.Patronymic),
                    Seat = r.Seat.ToString(),
                    Decision = r.Decision.ToString(),
                    Mark = r.Mark,
                    Comment = r.Comment,
                    DecidedAt = r.DecidedAt
                }).ToList(),
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

    /// A step can be submitted only while the student holds a topic (StudentProfile.TopicId, the
    /// single source of truth), its previous step is approved, and it is neither approved nor
    /// awaiting review. The missing topic is reported first: it is the first thing to fix.
    private static List<BuiltStep> BuildSteps(IReadOnlyList<StepRow> rows, bool hasTopic)
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
                _ when !hasTopic => WorkflowErrors.TopicRequired,
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

    /// I2 fix: the combined "needs attention" signal the `late` filter matches against - the app's
    /// existing notion (StepStatusBadge's separate isLate/isOverdue props, as GroupProgressMatrix
    /// renders both): either the current step's latest submission was itself late, or the step is
    /// overdue (IsOverdue, above - nothing submitted, or returned, past the deadline).
    private static bool IsLateOrOverdue(ReviewStudentWorking working) =>
        (working.Current?.LatestSubmission?.IsLate ?? false) || working.IsOverdue;

    private static ReviewStudentItem ToReviewStudentItem(ReviewStudentWorking working)
    {
        var current = working.Current;
        return new ReviewStudentItem
        {
            StudentProfileId = working.Row.StudentProfileId,
            StudentName = PersonName.Full(working.Row.LastName, working.Row.FirstName, working.Row.Patronymic),
            GroupId = working.Row.GroupId,
            GroupCode = working.Row.GroupCode,
            StudentTaskId = current?.StudentTaskId,
            StepTitle = current?.Title,
            StepOrder = current?.Order,
            Status = current?.Status.ToString(),
            Version = current?.LatestSubmission?.Version,
            SubmittedAt = current?.LatestSubmission?.SubmittedAt,
            IsLate = current?.LatestSubmission?.IsLate ?? false,
            IsOverdue = working.IsOverdue,
            // I1 fix: the row is still listed (the caller has SOME grant on this student), but the
            // link is only live when the caller could actually open the current step -
            // CanSeeStudentTaskAsync's own, narrower rule, computed per current step below.
            CanOpen = current?.CanOpen ?? false,
            PanelSize = working.PanelSize,
            PanelApproved = working.PanelApproved,
            IsMyDecision = working.IsMyDecision
        };
    }

    private enum ReviewStateFilter
    {
        All,
        Waiting,
        NotStarted,
        Submitted,
        Returned,
        Approved
    }

    private sealed record ReviewStudentWorking(
        StudentProjectionRow Row,
        CurrentStepRow? Current,
        int? PanelSize,
        int? PanelApproved,
        bool IsMyDecision,
        bool IsOverdue);

    private sealed class StudentProjectionRow
    {
        public Guid StudentProfileId { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string? Patronymic { get; init; }
        public Guid GroupId { get; init; }
        public string GroupCode { get; init; } = string.Empty;
        public CurrentStepRow? CurrentOpen { get; init; }
        public CurrentStepRow? LastStep { get; init; }
    }

    private sealed class CurrentStepRow
    {
        public Guid StudentTaskId { get; init; }
        public string Title { get; init; } = string.Empty;
        public int Order { get; init; }
        public StudentTaskStatus Status { get; init; }
        public DateTime Deadline { get; init; }

        /// I1 fix: exactly CanSeeStudentTaskAsync's rule for this one task - not the broader
        /// ReviewOverviewStudents listing rule, which can be satisfied by a seat on a DIFFERENT
        /// step of the same student.
        public bool CanOpen { get; init; }

        public LatestSubmissionRow? LatestSubmission { get; init; }
    }

    /// I3 fix: the current step's latest submission, projected once as a nested object (the
    /// TopicPartyRow pattern) instead of three independent correlated subqueries.
    private sealed class LatestSubmissionRow
    {
        public int Version { get; init; }
        public DateTime SubmittedAt { get; init; }
        public bool IsLate { get; init; }
    }

    /// O3: the student's current step. Projected as two ordered subqueries the way
    /// TopicService.Projection projects a topic's Holder and Request - CurrentOpen (the first
    /// step in order that is not Approved) and LastStep (the last step in order, used only when
    /// CurrentOpen is null: every step is Approved, or there are none) - and combined with ??
    /// after materializing. Built per call (not a static field) because CanOpen needs the
    /// caller's identity closed over so it becomes part of the same SQL query.
    private static Expression<Func<StudentProfile, StudentProjectionRow>> BuildReviewStudentProjection(UserContext user)
    {
        var callerId = user.UserId;
        var isAdmin = user.IsAdmin;

        return p => new StudentProjectionRow
        {
            StudentProfileId = p.Id,
            LastName = p.User.LastName,
            FirstName = p.User.FirstName,
            Patronymic = p.User.Patronymic,
            GroupId = p.GroupId,
            GroupCode = p.Group.Code,
            CurrentOpen = p.StudentTasks
                .Where(t => t.GroupTask.GroupId == p.GroupId && t.Status != StudentTaskStatus.Approved)
                .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
                .ThenBy(t => t.GroupTask.DiplomaTaskTemplate.Title)
                .Select(t => new CurrentStepRow
                {
                    StudentTaskId = t.Id,
                    Title = t.GroupTask.DiplomaTaskTemplate.Title,
                    Order = t.GroupTask.DiplomaTaskTemplate.Order,
                    Status = t.Status,
                    Deadline = t.GroupTask.Deadline,
                    CanOpen = isAdmin
                        || p.SupervisorId == callerId
                        || p.Group.Reviewers.Any(r => r.ReviewerId == callerId)
                        || t.Reviewers.Any(r => r.ReviewerId == callerId),
                    LatestSubmission = t.Submissions
                        .OrderByDescending(s => s.Version)
                        .Select(s => new LatestSubmissionRow { Version = s.Version, SubmittedAt = s.SubmittedAt, IsLate = s.IsLate })
                        .FirstOrDefault()
                })
                .FirstOrDefault(),
            LastStep = p.StudentTasks
                .Where(t => t.GroupTask.GroupId == p.GroupId)
                .OrderByDescending(t => t.GroupTask.DiplomaTaskTemplate.Order)
                .ThenByDescending(t => t.GroupTask.DiplomaTaskTemplate.Title)
                .Select(t => new CurrentStepRow
                {
                    StudentTaskId = t.Id,
                    Title = t.GroupTask.DiplomaTaskTemplate.Title,
                    Order = t.GroupTask.DiplomaTaskTemplate.Order,
                    Status = t.Status,
                    Deadline = t.GroupTask.Deadline,
                    CanOpen = isAdmin
                        || p.SupervisorId == callerId
                        || p.Group.Reviewers.Any(r => r.ReviewerId == callerId)
                        || t.Reviewers.Any(r => r.ReviewerId == callerId),
                    LatestSubmission = t.Submissions
                        .OrderByDescending(s => s.Version)
                        .Select(s => new LatestSubmissionRow { Version = s.Version, SubmittedAt = s.SubmittedAt, IsLate = s.IsLate })
                        .FirstOrDefault()
                })
                .FirstOrDefault()
        };
    }
}
