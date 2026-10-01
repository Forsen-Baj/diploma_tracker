namespace DiplomaTracker.Api.DTOs.Topics;

public class ApprovalSeatResponse
{
    /// Administration, Direction or Supervision.
    public string Seat { get; set; } = string.Empty;

    /// The person who holds the seat; null for the administration seat.
    public string? HolderName { get; set; }
    public bool IsSatisfied { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTime? ApprovedAt { get; set; }
}
