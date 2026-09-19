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
}
