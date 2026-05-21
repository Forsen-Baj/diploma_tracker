namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class AssignAllTaskTemplatesResponse
{
    public Guid GroupId { get; set; }
    public int CreatedGroupTaskCount { get; set; }
    public int SkippedExistingGroupTaskCount { get; set; }
    public int CreatedStudentTaskCount { get; set; }
    public List<GroupTaskResponse> GroupTasks { get; set; } = [];
}
