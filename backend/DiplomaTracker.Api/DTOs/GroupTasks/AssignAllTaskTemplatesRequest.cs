namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class AssignAllTaskTemplatesRequest
{
    public List<AssignTaskTemplateDeadlineRequest> Items { get; set; } = [];
}
