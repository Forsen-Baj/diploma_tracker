using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Groups;

public class CreateGroupRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Required, MaxLength(50)]
    public string AcademicYear { get; set; } = string.Empty;
}
