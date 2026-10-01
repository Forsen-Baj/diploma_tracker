using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §5-§6.
public static class RoleErrors
{
    public const string ScopeInvalid = "roleAssignment.scopeInvalid";
    public const string ScopeNotAllowed = "roleAssignment.scopeNotAllowed";
    public const string Exists = "roleAssignment.exists";
    public const string NotFound = "roleAssignment.notFound";
    public const string InUse = "roleAssignment.inUse";
    public const string RoleNotHeld = "actingRole.notHeld";
    public const string NotCovered = "scope.notCovered";

    public static readonly ErrorDefinition[] All =
    [
        new(ScopeInvalid, StatusCodes.Status400BadRequest, "The selected faculty, department or group does not exist."),
        new(ScopeNotAllowed, StatusCodes.Status400BadRequest, "A direction manager is assigned to a faculty or a department."),
        new(Exists, StatusCodes.Status409Conflict, "This person already holds this role there."),
        new(NotFound, StatusCodes.Status404NotFound, "Role assignment not found."),
        new(InUse, StatusCodes.Status409Conflict, "The role is in use there. Reassign the work listed first."),
        new(RoleNotHeld, StatusCodes.Status403Forbidden, "You do not hold this role."),
        new(NotCovered, StatusCodes.Status403Forbidden, "This is outside the faculty, department or group your role covers.")
    ];
}
