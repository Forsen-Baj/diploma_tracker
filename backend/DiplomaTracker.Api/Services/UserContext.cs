using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// The caller: their id and the role their token carries (design 2026-09-27, phase 12, §5).
public sealed record UserContext(Guid UserId, string Role)
{
    public bool IsAdmin => Role == AccountRoles.Admin;
    public bool IsStudent => Role == AccountRoles.Student;

    /// A staff member acts in one role at a time; these name it.
    public bool IsTeacher => Role == ActingRoles.Teacher;
    public bool IsDirectionManager => Role == ActingRoles.DirectionManager;
    public bool IsStandardsController => Role == ActingRoles.StandardsController;

    /// A staff account, whatever role it acts in, or none.
    public bool IsStaff => IsTeacher || IsDirectionManager || IsStandardsController || Role == ActingRoles.None;

    public StaffRole? ActingRole =>
        IsTeacher ? StaffRole.Teacher
        : IsDirectionManager ? StaffRole.DirectionManager
        : IsStandardsController ? StaffRole.StandardsController
        : null;
}
