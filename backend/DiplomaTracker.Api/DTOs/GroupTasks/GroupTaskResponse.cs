namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class GroupTaskResponse
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string? GroupName { get; set; }
    public Guid TaskTemplateId { get; set; }
    public string TaskTitle { get; set; } = string.Empty;
    public string? TaskDescription { get; set; }
    public int TaskOrder { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime Deadline { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int StudentTaskCount { get; set; }
}
