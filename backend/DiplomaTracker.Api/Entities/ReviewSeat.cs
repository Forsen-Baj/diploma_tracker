namespace DiplomaTracker.Api.Entities;

/// The panel seat a decision fills (design 2026-09-24 §3.1, 2026-09-27 §6). One person holds one
/// seat on a step: the first they qualify for, in this order.
public enum ReviewSeat
{
    Supervisor,
    DirectionManager,
    Extra,
    StandardsControl
}
