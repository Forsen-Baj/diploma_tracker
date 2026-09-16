namespace DiplomaTracker.Api.DTOs.Groups;

public class UpdateGroupRequest
{
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
}
