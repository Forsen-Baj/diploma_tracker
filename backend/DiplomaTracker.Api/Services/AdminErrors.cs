using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class AdminErrors
{
    public const string NotFound = "admin.notFound";
    public const string CannotDeactivateSelf = "admin.cannotDeactivateSelf";
    public const string LastActive = "admin.lastActive";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Administrator not found."),
        new(CannotDeactivateSelf, StatusCodes.Status400BadRequest, "You cannot deactivate your own account."),
        new(LastActive, StatusCodes.Status409Conflict, "Cannot deactivate the last active administrator.")
    ];
}
