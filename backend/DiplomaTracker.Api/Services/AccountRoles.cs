namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §3: the account role stored on AppUser.
public static class AccountRoles
{
    public const string Admin = "Admin";
    public const string Staff = "Staff";
    public const string Student = "Student";
}

/// Design 2026-09-27 (phase 12) §5: the role a token carries. An administrator's and a student's
/// token carry their account role; a staff member's carries the staff role they act in, or Staff
/// while they hold none. The three role names are StaffRole's.
public static class ActingRoles
{
    public const string Teacher = "Teacher";
    public const string DirectionManager = "DirectionManager";
    public const string StandardsController = "StandardsController";
    public const string None = AccountRoles.Staff;
}

/// Role lists for [Authorize(Roles = ...)], which takes constants.
public static class AuthRoles
{
    public const string Admin = AccountRoles.Admin;
    public const string AnyStaffRole = "Teacher,DirectionManager,StandardsController";
    public const string AdminOrAnyStaffRole = "Admin,Teacher,DirectionManager,StandardsController";

    /// A staff member acting in no role too: templates and documents are every staff member's.
    public const string AdminOrStaff = "Admin,Teacher,DirectionManager,StandardsController,Staff";

    public const string AdminOrTeacher = "Admin,Teacher";
    public const string AdminOrDirectionManager = "Admin,DirectionManager";

    /// Topic approvals and step panels: a supervisor acts as teacher, a direction manager as one.
    public const string AdminTeacherOrManager = "Admin,Teacher,DirectionManager";
}
