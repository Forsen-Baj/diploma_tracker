namespace DiplomaTracker.Api.DTOs.Teachers;

/// Narrows the staff picker to teachers holding one capability (design 2026-09-27 §3). Bound from
/// the query string by name, case-insensitively: `?capability=directionManager`.
public enum StaffCapability
{
    DirectionManager,
    StandardsController
}
