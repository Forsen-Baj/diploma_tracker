namespace DiplomaTracker.Api.DTOs.Workflow;

public class PanelSeatResponse
{
    /// "Supervisor" or "Extra".
    public string Seat { get; set; } = string.Empty;
    public Guid? ReviewerId { get; set; }
    public string? ReviewerName { get; set; }
    public bool IsActive { get; set; }

    /// "Approved" (the seat is satisfied), "Returned" (it returned the version now with the
    /// student) or "Waiting".
    public string State { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public bool CanRemove { get; set; }
}

public class SubmissionReviewResponse
{
    public Guid Id { get; set; }
    public string ReviewerName { get; set; } = string.Empty;
    public string Seat { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
}
