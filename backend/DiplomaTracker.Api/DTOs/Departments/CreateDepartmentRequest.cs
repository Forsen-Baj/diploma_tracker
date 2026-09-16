using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Departments;

public class CreateDepartmentRequest
{
    public Guid FacultyId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string ShortName { get; set; } = string.Empty;
}
