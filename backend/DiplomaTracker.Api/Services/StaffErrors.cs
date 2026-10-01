using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class StaffErrors
{
    public const string NotFound = "staff.notFound";
    public const string ManagesDirections = "staff.managesDirections";
    public const string ControlsSteps = "staff.controlsSteps";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Staff member not found."),
        new(ManagesDirections, StatusCodes.Status409Conflict, "This staff member manages a direction. Hand it to another manager first."),
        new(ControlsSteps, StatusCodes.Status409Conflict, "This staff member is the standards controller of a group step. Assign someone else first.")
    ];
}
