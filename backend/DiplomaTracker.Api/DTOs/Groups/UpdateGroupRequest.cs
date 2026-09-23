using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.Validation;

namespace DiplomaTracker.Api.DTOs.Groups;

public class UpdateGroupRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(32)]
    public string Code { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Required, MaxLength(20), ValidAcademicYear]
    public string AcademicYear { get; set; } = string.Empty;
}
