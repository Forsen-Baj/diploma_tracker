using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class UpdateTopicRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public Guid DepartmentId { get; set; }

    public Guid? SupervisorId { get; set; }
}
