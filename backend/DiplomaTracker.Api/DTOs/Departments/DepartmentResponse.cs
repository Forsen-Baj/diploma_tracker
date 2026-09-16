namespace DiplomaTracker.Api.DTOs.Departments;

public class DepartmentResponse
{
    public Guid Id { get; set; }
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
