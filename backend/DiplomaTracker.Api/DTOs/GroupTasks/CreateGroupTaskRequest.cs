namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class CreateGroupTaskRequest
{
    public Guid GroupId { get; set; }
    public Guid TaskTemplateId { get; set; }
    public DateTime Deadline { get; set; }
}
