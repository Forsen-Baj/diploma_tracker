namespace DiplomaTracker.Api.Services.Documents;

public sealed record DocumentPerson(string LastName, string FirstName, string? Patronymic, string Email);

public sealed record DocumentContext(
    DocumentPerson? Student,
    string? StudentNumber,
    string? GroupCode,
    string? AcademicYear,
    string? DepartmentName,
    string? DepartmentShortName,
    string? FacultyName,
    string? FacultyShortName,
    string? TopicTitle,
    string? TopicDescription,
    DocumentPerson? Supervisor,
    DateTime NowUtc)
{
    public static DocumentContext Blank(DateTime nowUtc) =>
        new(null, null, null, null, null, null, null, null, null, null, null, nowUtc);
}
