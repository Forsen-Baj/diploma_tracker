namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationDecisionResponse
{
    /// Approved, Returned, Rejected or Edited.
    public string Kind { get; set; } = string.Empty;
    public string DeciderName { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
}
