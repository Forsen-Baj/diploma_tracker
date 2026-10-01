namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-27 (phase 12) §3: the roles an administrator assigns to a staff account, each for
/// one faculty, department or group. Stored as its name. The order is the sign-in order (§5): a
/// staff member starts in the first role they hold.
public enum StaffRole
{
    Teacher,
    DirectionManager,
    StandardsController
}
