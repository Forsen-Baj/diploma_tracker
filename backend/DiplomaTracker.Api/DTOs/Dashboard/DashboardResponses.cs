using DiplomaTracker.Api.DTOs.Workflow;

namespace DiplomaTracker.Api.DTOs.Dashboard;

public class LatestDecisionResponse
{
    public Guid StudentTaskId { get; set; }
    public Guid SubmissionId { get; set; }
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }

    /// "Approved" or "Returned".
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime DecidedAt { get; set; }
}

public class StudentDashboardResponse
{
    public StudentProgressResponse Progress { get; set; } = new();
    public LatestDecisionResponse? LatestDecision { get; set; }
}

/// One row of the per-group breakdown both the teacher's and the administrator's page show.
public class DashboardGroupRow
{
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public int StudentCount { get; set; }
    public int ApprovedTopicCount { get; set; }
    public int StepsApproved { get; set; }
    public int StepsTotal { get; set; }
    public int WaitingReviews { get; set; }
    public int LateSteps { get; set; }
    public int OverdueSteps { get; set; }
}

public class OverdueStepRow
{
    public Guid StudentTaskId { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int DaysOverdue { get; set; }
}

public class SupervisedStudentRow
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string? TopicTitle { get; set; }
    public string? CurrentStepTitle { get; set; }
    public string? CurrentStepStatus { get; set; }
    public DateTime? NextDeadline { get; set; }
}

public class TeacherDashboardResponse
{
    public int WaitingReviews { get; set; }
    public IReadOnlyList<ReviewQueueItem> LatestForReview { get; set; } = [];
    public IReadOnlyList<OverdueStepRow> OverdueSteps { get; set; } = [];
    public IReadOnlyList<SupervisedStudentRow> SupervisedStudents { get; set; } = [];
    public IReadOnlyList<DashboardGroupRow> Groups { get; set; } = [];
}

public class TopicSelectionSummary
{
    public int TotalStudents { get; set; }
    public int WithApprovedTopic { get; set; }
    public int WithPendingRequest { get; set; }
    public int WithoutTopic { get; set; }
    public DateTime? Deadline { get; set; }
    public bool IsOpen { get; set; }
}

public class ReviewBacklogSummary
{
    public int WaitingReviews { get; set; }
    public int WaitingLate { get; set; }
    public int OverdueSteps { get; set; }
}

public class StructureSummary
{
    public int Faculties { get; set; }
    public int Departments { get; set; }
    public int Groups { get; set; }
    public int ActiveStudents { get; set; }
    public int UnclaimedAccounts { get; set; }
    public int Teachers { get; set; }
    public int TopicsAvailable { get; set; }
    public int TopicsReserved { get; set; }
    public int TopicsApproved { get; set; }
}

public class AdminDashboardResponse
{
    public TopicSelectionSummary TopicSelection { get; set; } = new();
    public ReviewBacklogSummary ReviewBacklog { get; set; } = new();
    public StructureSummary Structure { get; set; } = new();
    public IReadOnlyList<DashboardGroupRow> Groups { get; set; } = [];
}
