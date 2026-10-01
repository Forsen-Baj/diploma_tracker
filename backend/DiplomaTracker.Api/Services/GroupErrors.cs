using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class GroupErrors
{
    public const string NotFound = "group.notFound";
    public const string CodeTaken = "group.codeTaken";
    public const string HasStudents = "group.hasStudents";
    public const string DepartmentNotFound = "group.departmentNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Group not found."),
        new(CodeTaken, StatusCodes.Status409Conflict, "Group with the same code already exists in this academic year."),
        new(HasStudents, StatusCodes.Status409Conflict, "Cannot delete group because students are assigned."),
        new(DepartmentNotFound, StatusCodes.Status400BadRequest, "The selected department does not exist.")
    ];
}
