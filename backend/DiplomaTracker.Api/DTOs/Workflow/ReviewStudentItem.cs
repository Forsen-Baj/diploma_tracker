namespace DiplomaTracker.Api.DTOs.Workflow;

/// O3: one row of the Review tab's overview - a student and where they are, not a submission
/// awaiting a decision (that is what ReviewQueueItem/GetReviewQueueAsync still is, kept for the
/// dashboards' own "waiting for review" lists).
public class ReviewStudentItem
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;

    /// Null when the student has no steps at all - the row then shows "No steps" and has no link.
    public Guid? StudentTaskId { get; set; }
    public string? StepTitle { get; set; }
    public int? StepOrder { get; set; }
    public string? Status { get; set; }

    /// I1 fix: whether the caller could actually open StudentTaskId - CanSeeStudentTaskAsync's own
    /// rule for that specific task, not the broader rule that got the row listed at all. False
    /// (and no link) whenever StudentTaskId is null, too.
    public bool CanOpen { get; set; }

    public int? Version { get; set; }
    public DateTime? SubmittedAt { get; set; }

    /// The current step's latest submission was itself late.
    public bool IsLate { get; set; }

    /// I2 fix: the current step is overdue (StudentWorkflowService.IsOverdue - nothing submitted,
    /// or returned, past the deadline). Shown with the same StepStatusBadge isOverdue prop
    /// GroupProgressMatrix already uses; also what the `late` query filter now matches on,
    /// combined with IsLate.
    public bool IsOverdue { get; set; }

    /// Set only while the current step is Submitted.
    public int? PanelSize { get; set; }
    public int? PanelApproved { get; set; }

    /// The current step is Submitted and the caller holds an undecided seat on it - sorts first.
    public bool IsMyDecision { get; set; }
}
