using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Dashboard;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class DashboardService : IDashboardService
{
    private const int LatestForReviewCount = 5;
    private const int OverdueStepsCount = 20;

    private readonly AppDbContext _dbContext;
    private readonly IAccessScope _accessScope;
    private readonly IStudentWorkflowService _workflow;
    private readonly ITopicSettingsService _settings;

    public DashboardService(
        AppDbContext dbContext,
        IAccessScope accessScope,
        IStudentWorkflowService workflow,
        ITopicSettingsService settings)
    {
        _dbContext = dbContext;
        _accessScope = accessScope;
        _workflow = workflow;
        _settings = settings;
    }

    public async Task<(StudentDashboardResponse? dashboard, string? error)> GetStudentAsync(UserContext user)
    {
        var (progress, error) = await _workflow.GetStudentProgressAsync(user, null);
        if (progress is null)
        {
            return (null, error);
        }

        var latest = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.StudentTask.StudentProfile.UserId == user.UserId && s.Decision != null)
            .OrderByDescending(s => s.DecidedAt)
            .ThenByDescending(s => s.Id)
            .Select(s => new LatestDecisionResponse
            {
                StudentTaskId = s.StudentTaskId,
                SubmissionId = s.Id,
                StepTitle = s.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = s.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                Version = s.Version,
                Decision = s.Decision!.ToString()!,
                Mark = s.Mark,
                ReviewerName = s.Reviewer == null ? null : s.Reviewer.LastName + " " + s.Reviewer.FirstName,
                ReviewerComment = s.ReviewerComment,
                DecidedAt = s.DecidedAt!.Value
            })
            .FirstOrDefaultAsync();

        return (new StudentDashboardResponse { Progress = progress, LatestDecision = latest }, null);
    }

    public async Task<TeacherDashboardResponse> GetTeacherAsync(UserContext user)
    {
        var queue = await _workflow.GetReviewQueueAsync(user, null, null, 1, LatestForReviewCount);
        var now = DateTime.UtcNow;

        var overdue = await OverdueStepsAsync(user, now);
        var groups = await GroupRowsAsync(user, now);

        var supervised = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.SupervisorId == user.UserId && p.ArchivedAt == null)
            .OrderBy(p => p.User.LastName)
            .ThenBy(p => p.User.FirstName)
            .Select(p => new SupervisedStudentRow
            {
                StudentProfileId = p.Id,
                StudentName = p.User.LastName + " " + p.User.FirstName,
                GroupId = p.GroupId,
                GroupCode = p.Group.Code,
                TopicTitle = p.Topic == null ? null : p.Topic.Title,
                // The step they are on: the lowest-ordered step that is not approved.
                CurrentStepTitle = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
                    .Select(t => t.GroupTask.DiplomaTaskTemplate.Title)
                    .FirstOrDefault(),
                CurrentStepStatus = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
                    .Select(t => t.Status.ToString())
                    .FirstOrDefault(),
                NextDeadline = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.Deadline)
                    .Select(t => (DateTime?)t.GroupTask.Deadline)
                    .FirstOrDefault()
            })
            .ToListAsync();

        return new TeacherDashboardResponse
        {
            WaitingReviews = queue.Total,
            LatestForReview = queue.Items,
            OverdueSteps = overdue,
            SupervisedStudents = supervised,
            Groups = groups
        };
    }

    public async Task<AdminDashboardResponse> GetAdminAsync(UserContext user)
    {
        var now = DateTime.UtcNow;
        var deadline = await _settings.GetDeadlineAsync();

        var students = _dbContext.StudentProfiles.AsNoTracking().Where(p => p.ArchivedAt == null);

        var totalStudents = await students.CountAsync();
        var withTopic = await students.CountAsync(p => p.TopicId != null);
        var withRequest = await students.CountAsync(p =>
            p.TopicId == null && p.TopicReservations.Any(r => r.Status == ReservationStatus.Pending));

        var waiting = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null && s.StudentTask.Status == StudentTaskStatus.Submitted)
            .GroupBy(_ => 1)
            .Select(g => new { Total = g.Count(), Late = g.Count(s => s.IsLate) })
            .FirstOrDefaultAsync();

        var overdueCount = await _dbContext.StudentTasks.AsNoTracking()
            .CountAsync(t => t.StudentProfile.ArchivedAt == null
                && t.Status != StudentTaskStatus.Approved
                && t.Status != StudentTaskStatus.Submitted
                && t.GroupTask.Deadline < now);

        var topics = await _dbContext.Topics.AsNoTracking()
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        return new AdminDashboardResponse
        {
            TopicSelection = new TopicSelectionSummary
            {
                TotalStudents = totalStudents,
                WithApprovedTopic = withTopic,
                WithPendingRequest = withRequest,
                WithoutTopic = totalStudents - withTopic - withRequest,
                Deadline = deadline,
                IsOpen = await _settings.IsSelectionOpenAsync()
            },
            ReviewBacklog = new ReviewBacklogSummary
            {
                WaitingReviews = waiting == null ? 0 : waiting.Total,
                WaitingLate = waiting == null ? 0 : waiting.Late,
                OverdueSteps = overdueCount
            },
            Structure = new StructureSummary
            {
                Faculties = await _dbContext.Faculties.CountAsync(),
                Departments = await _dbContext.Departments.CountAsync(),
                Groups = await _dbContext.Groups.CountAsync(),
                ActiveStudents = totalStudents,
                UnclaimedAccounts = await students.CountAsync(p => p.User.PasswordHash == null),
                Teachers = await _dbContext.Users.CountAsync(u => u.Role == "Teacher" && u.IsActive),
                TopicsAvailable = topics.FirstOrDefault(t => t.Status == TopicStatus.Available)?.Count ?? 0,
                TopicsReserved = topics.FirstOrDefault(t => t.Status == TopicStatus.Reserved)?.Count ?? 0,
                TopicsApproved = topics.FirstOrDefault(t => t.Status == TopicStatus.Approved)?.Count ?? 0
            },
            Groups = await GroupRowsAsync(user, now)
        };
    }

    /// The per-group breakdown, identical for both roles apart from which groups are in it: every
    /// group for an administrator, and for a teacher only the groups they review (§7.4). A group a
    /// teacher sees only because they supervise one of its students is left out, as its overdue
    /// and waiting figures are about students the teacher does not review; that student appears
    /// under the students they supervise instead.
    private async Task<IReadOnlyList<DashboardGroupRow>> GroupRowsAsync(UserContext user, DateTime now)
    {
        var groups = _accessScope.VisibleGroups(user);
        if (user.IsTeacher)
        {
            groups = groups.Where(g => g.Reviewers.Any(r => r.ReviewerId == user.UserId));
        }

        return await groups.AsNoTracking()
            .OrderByDescending(g => g.AcademicYear)
            .ThenBy(g => g.Code)
            .Select(g => new DashboardGroupRow
            {
                GroupId = g.Id,
                GroupCode = g.Code,
                AcademicYear = g.AcademicYear,
                DepartmentName = g.Department.Name,
                StudentCount = g.Students.Count(s => s.ArchivedAt == null),
                ApprovedTopicCount = g.Students.Count(s => s.ArchivedAt == null && s.TopicId != null),
                StepsApproved = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Approved),
                StepsTotal = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null),
                WaitingReviews = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Submitted),
                LateSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Submissions.OrderByDescending(s => s.Version).Select(s => s.IsLate).FirstOrDefault()),
                OverdueSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Status != StudentTaskStatus.Approved
                        && t.Status != StudentTaskStatus.Submitted
                        && t.GroupTask.Deadline < now)
            })
            .ToListAsync();
    }

    /// Steps past their deadline with nothing submitted - the one thing the review queue can
    /// never show, because a step that was never submitted never enters it (§7.4).
    private async Task<IReadOnlyList<OverdueStepRow>> OverdueStepsAsync(UserContext user, DateTime now)
    {
        var reviewable = _accessScope.ReviewableStudents(user).Select(s => s.Id);

        var rows = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => reviewable.Contains(t.StudentProfileId)
                && t.StudentProfile.ArchivedAt == null
                && t.Status != StudentTaskStatus.Approved
                && t.Status != StudentTaskStatus.Submitted
                && t.GroupTask.Deadline < now)
            .OrderBy(t => t.GroupTask.Deadline)
            .ThenBy(t => t.Id)
            .Take(OverdueStepsCount)
            .Select(t => new OverdueStepRow
            {
                StudentTaskId = t.Id,
                StudentProfileId = t.StudentProfileId,
                StudentName = t.StudentProfile.User.LastName + " " + t.StudentProfile.User.FirstName,
                GroupId = t.StudentProfile.GroupId,
                GroupCode = t.StudentProfile.Group.Code,
                StepTitle = t.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = t.GroupTask.DiplomaTaskTemplate.Order,
                Deadline = t.GroupTask.Deadline
            })
            .ToListAsync();

        foreach (var row in rows)
        {
            row.DaysOverdue = (int)Math.Floor((now - row.Deadline).TotalDays);
        }

        return rows;
    }
}
