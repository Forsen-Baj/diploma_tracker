namespace DiplomaTracker.Api.Entities;

/// One approver's action on a topic request (design 2026-09-27 §5.1). Rows are never changed or
/// deleted while the request exists; together they are its timeline, and TopicApprovalPanel reads
/// the seats from them.
public class ReservationDecision
{
    public Guid Id { get; set; }
    public Guid ReservationId { get; set; }
    public Guid DeciderId { get; set; }

    /// Whether the decider was an administrator when deciding - the administration seat is filled
    /// by any administrator, so the role at that moment is what counts.
    public bool DeciderWasAdministrator { get; set; }
    public ReservationDecisionKind Kind { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public TopicReservation Reservation { get; set; } = null!;
    public AppUser Decider { get; set; } = null!;
}
