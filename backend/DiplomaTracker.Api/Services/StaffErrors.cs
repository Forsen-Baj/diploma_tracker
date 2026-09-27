using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class StaffErrors
{
    public const string ManagesDirections = "staff.managesDirections";
    public const string ControlsSteps = "staff.controlsSteps";

    public static readonly ErrorDefinition[] All =
    [
        new(ManagesDirections, StatusCodes.Status409Conflict, "This teacher manages a direction. Hand it to another manager first."),
        new(ControlsSteps, StatusCodes.Status409Conflict, "This teacher is the standards controller of a group step. Assign someone else first.")
    ];
}
