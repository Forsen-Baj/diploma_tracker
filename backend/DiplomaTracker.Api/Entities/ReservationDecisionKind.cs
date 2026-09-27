namespace DiplomaTracker.Api.Entities;

public enum ReservationDecisionKind
{
    Approved,
    Returned,
    Rejected,

    /// An approver changed the wording while the request waited. It counts as their approval and
    /// makes every earlier approval stop counting (design 2026-09-27 §5.3).
    Edited
}
