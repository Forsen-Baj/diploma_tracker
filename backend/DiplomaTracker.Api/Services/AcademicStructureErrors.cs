namespace DiplomaTracker.Api.Services;

public static class AcademicStructureErrors
{
    public const string FacultyNotFound = "Faculty not found.";
    public const string FacultyNameTaken = "Faculty with the same name already exists.";
    public const string FacultyShortNameTaken = "Faculty with the same short name already exists.";
    public const string FacultyHasDepartments = "Cannot delete faculty because departments are assigned.";

    public const string DepartmentNotFound = "Department not found.";
    public const string DepartmentNameTaken = "Department with the same name already exists in this faculty.";
    public const string DepartmentShortNameTaken = "Department with the same short name already exists in this faculty.";
    public const string DepartmentHasGroups = "Cannot delete department because groups are assigned.";
}
