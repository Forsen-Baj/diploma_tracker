using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class AssignTaskTemplateDeadlineRequest
{
    public Guid TaskTemplateId { get; set; }
    public DateTime? StartDate { get; set; }

    [Required]
    public DateTime? Deadline { get; set; }
}
