namespace DiplomaTracker.Api.Entities;

public enum ReservationStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled,
    Released,

    /// Design 2026-09-27 §5.1: an approver returned the request for changes. It is still open -
    /// it holds its topic - and waits for the student to resubmit.
    Returned
}
