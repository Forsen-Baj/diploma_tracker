using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class AssignAllTaskTemplatesRequest
{
    [MaxLength(200)]
    public List<AssignTaskTemplateDeadlineRequest> Items { get; set; } = [];
}
