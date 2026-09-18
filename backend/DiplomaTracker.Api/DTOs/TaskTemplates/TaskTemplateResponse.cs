namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class TaskTemplateResponse
{
    public Guid Id { get; set; }
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
