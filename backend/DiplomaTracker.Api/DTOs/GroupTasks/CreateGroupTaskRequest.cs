using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class CreateGroupTaskRequest
{
    public Guid GroupId { get; set; }
    public Guid TaskTemplateId { get; set; }
    public DateTime? StartDate { get; set; }

    [Required]
    public DateTime? Deadline { get; set; }
}
