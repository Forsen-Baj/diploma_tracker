using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class AcademicStructureErrors
{
    public const string FacultyNotFound = "faculty.notFound";
    public const string FacultyNameTaken = "faculty.nameTaken";
    public const string FacultyShortNameTaken = "faculty.shortNameTaken";
    public const string FacultyHasDepartments = "faculty.hasDepartments";
    public const string FacultyHasTaskTemplates = "faculty.hasTaskTemplates";

    public const string DepartmentNotFound = "department.notFound";
    public const string DepartmentNameTaken = "department.nameTaken";
    public const string DepartmentShortNameTaken = "department.shortNameTaken";
    public const string DepartmentHasGroups = "department.hasGroups";
    public const string DepartmentFacultyNotFound = "department.facultyNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(FacultyNotFound, StatusCodes.Status404NotFound, "Faculty not found."),
        new(FacultyNameTaken, StatusCodes.Status409Conflict, "Faculty with the same name already exists."),
        new(FacultyShortNameTaken, StatusCodes.Status409Conflict, "Faculty with the same short name already exists."),
        new(FacultyHasDepartments, StatusCodes.Status409Conflict, "Cannot delete faculty because departments are assigned."),
        new(FacultyHasTaskTemplates, StatusCodes.Status409Conflict, "Cannot delete faculty because task templates are assigned."),
        new(DepartmentNotFound, StatusCodes.Status404NotFound, "Department not found."),
        new(DepartmentNameTaken, StatusCodes.Status409Conflict, "Department with the same name already exists in this faculty."),
        new(DepartmentShortNameTaken, StatusCodes.Status409Conflict, "Department with the same short name already exists in this faculty."),
        new(DepartmentHasGroups, StatusCodes.Status409Conflict, "Cannot delete department because groups are assigned."),
        new(DepartmentFacultyNotFound, StatusCodes.Status400BadRequest, "The selected faculty does not exist.")
    ];
}
