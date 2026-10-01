using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class ProposeTopicRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public Guid SupervisorId { get; set; }

    /// Design 2026-09-27 §4.3: a direction of the student's own department.
    public Guid DirectionId { get; set; }
}
