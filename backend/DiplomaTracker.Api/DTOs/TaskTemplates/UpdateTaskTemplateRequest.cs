namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class UpdateTaskTemplateRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public bool IsActive { get; set; }
}
