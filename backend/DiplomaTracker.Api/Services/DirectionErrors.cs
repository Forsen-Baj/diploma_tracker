using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class DirectionErrors
{
    public const string NotFound = "direction.notFound";
    public const string Invalid = "direction.invalid";
    public const string NameTaken = "direction.nameTaken";
    public const string HasTopics = "direction.hasTopics";
    public const string NotManager = "direction.notManager";
    public const string ManagerInvalid = "direction.managerInvalid";
    public const string DepartmentInvalid = "direction.departmentInvalid";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Direction not found."),
        new(Invalid, StatusCodes.Status400BadRequest, "Choose a direction of your department."),
        new(NameTaken, StatusCodes.Status409Conflict, "A direction with this name already exists in the department."),
        new(HasTopics, StatusCodes.Status409Conflict, "The direction still has topics."),
        new(NotManager, StatusCodes.Status403Forbidden, "You do not manage this direction."),
        new(ManagerInvalid, StatusCodes.Status400BadRequest, "Choose an active direction manager whose role covers the department."),
        new(DepartmentInvalid, StatusCodes.Status400BadRequest, "The selected department does not exist.")
    ];
}
