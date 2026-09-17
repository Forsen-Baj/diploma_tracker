using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class UpdateGroupTaskRequest
{
    public DateTime? StartDate { get; set; }

    [Required]
    public DateTime? Deadline { get; set; }
}
