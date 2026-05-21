namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class AssignTaskTemplateDeadlineRequest
{
    public Guid TaskTemplateId { get; set; }
    public DateTime Deadline { get; set; }
}
