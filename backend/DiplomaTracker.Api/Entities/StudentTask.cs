namespace DiplomaTracker.Api.Entities;

public class StudentTask
{
    public Guid Id { get; set; }
    public Guid StudentProfileId { get; set; }
    public Guid GroupTaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal? CurrentMark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public StudentProfile StudentProfile { get; set; } = null!;
    public GroupTask GroupTask { get; set; } = null!;
}
