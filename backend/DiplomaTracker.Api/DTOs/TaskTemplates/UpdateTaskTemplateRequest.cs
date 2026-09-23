using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class UpdateTaskTemplateRequest
{
    public Guid FacultyId { get; set; }

    [Required, MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Range(1, int.MaxValue)]
    public int Order { get; set; }

    public bool IsActive { get; set; }
}
