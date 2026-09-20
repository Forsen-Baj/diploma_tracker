using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Templates;

public class UpdateTemplateRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }

    [MaxLength(500)]
    public List<Guid> GroupIds { get; set; } = [];

    [MaxLength(500)]
    public List<Guid> TeacherIds { get; set; } = [];
}
