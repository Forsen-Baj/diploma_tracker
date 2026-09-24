namespace DiplomaTracker.Api.DTOs.Workflow;

public class GroupProgressStep
{
    public Guid GroupTaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Order { get; set; }
    public DateTime Deadline { get; set; }
    public int ApprovedCount { get; set; }
}

public class GroupProgressCell
{
    public Guid GroupTaskId { get; set; }
    public Guid StudentTaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public bool IsLate { get; set; }

    /// Phase 8 §7.1: past its deadline with nothing awaiting a decision. `IsLate` is fixed on a
    /// submission when it is made, so a step that was NEVER submitted cannot carry it - which is
    /// why a month-overdue step used to look exactly like one that is not due yet.
    public bool IsOverdue { get; set; }

    /// The reviewer panel's progress, filled only for a `Submitted` cell (null otherwise).
    public int? PanelApproved { get; set; }
    public int? PanelSize { get; set; }
}

public class GroupProgressStudent
{
    public Guid StudentProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public IReadOnlyList<GroupProgressCell> Cells { get; set; } = [];

    /// Follow-up 2026-09-24: whether the caller can open this student's step pages
    /// (`GET /api/student-tasks/{id}`) for steps of this group - an administrator, a reviewer of
    /// the group, or the student's current supervisor. An extra reviewer seat on a single step
    /// does not make the row openable.
    public bool CanOpen { get; set; }
}

public class GroupProgressResponse
{
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public IReadOnlyList<GroupProgressStep> Steps { get; set; } = [];
    public IReadOnlyList<GroupProgressStudent> Students { get; set; } = [];
}
