namespace DiplomaTracker.Api.Entities;

/// The panel seat a decision fills (design 2026-09-24 §3.1): the student's supervisor, or one of
/// the extra reviewers added to that step.
public enum ReviewSeat
{
    Supervisor,
    Extra
}
