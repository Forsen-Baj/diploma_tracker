namespace DiplomaTracker.Api.DTOs.Workflow;

public class StudentStepResponse
{
    public Guid Id { get; set; }
    public Guid GroupTaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public DateTime Deadline { get; set; }
    public string Status { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsLate { get; set; }
    public DateTime? LatestSubmittedAt { get; set; }
    public bool CanSubmit { get; set; }
    public string? BlockReason { get; set; }

    /// Seats on the step's review panel: the supervisor plus every extra reviewer (design 2026-09-24 §3.2).
    public int PanelSize { get; set; }

    /// Seats whose approval is recorded on some version of the step.
    public int PanelApproved { get; set; }
}
