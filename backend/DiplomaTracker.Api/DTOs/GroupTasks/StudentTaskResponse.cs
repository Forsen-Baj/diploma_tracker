namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class StudentTaskResponse
{
    public Guid Id { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentFirstName { get; set; } = string.Empty;
    public string StudentLastName { get; set; } = string.Empty;
    public string StudentEmail { get; set; } = string.Empty;
    public Guid GroupTaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal? CurrentMark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
