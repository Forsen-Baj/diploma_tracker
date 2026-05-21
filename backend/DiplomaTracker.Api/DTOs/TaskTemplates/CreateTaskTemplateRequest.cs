namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class CreateTaskTemplateRequest
{
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
}
