using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class GroupErrors
{
    public const string NotFound = "group.notFound";
    public const string CodeTaken = "group.codeTaken";
    public const string HasStudents = "group.hasStudents";
    public const string DepartmentNotFound = "group.departmentNotFound";
    public const string ReviewerNotFound = "reviewer.notFound";
    public const string ReviewerMustBeActiveTeacher = "reviewer.mustBeActiveTeacher";
    public const string ReviewerAlreadyAssigned = "reviewer.alreadyAssigned";
    public const string ReviewerAssignmentNotFound = "reviewer.assignmentNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Group not found."),
        new(CodeTaken, StatusCodes.Status409Conflict, "Group with the same code already exists in this academic year."),
        new(HasStudents, StatusCodes.Status409Conflict, "Cannot delete group because students are assigned."),
        new(DepartmentNotFound, StatusCodes.Status400BadRequest, "The selected department does not exist."),
        new(ReviewerNotFound, StatusCodes.Status400BadRequest, "The selected reviewer does not exist."),
        new(ReviewerMustBeActiveTeacher, StatusCodes.Status400BadRequest, "Reviewer must be an active teacher."),
        new(ReviewerAlreadyAssigned, StatusCodes.Status409Conflict, "Reviewer is already assigned to this group."),
        new(ReviewerAssignmentNotFound, StatusCodes.Status404NotFound, "Reviewer assignment not found.")
    ];
}
