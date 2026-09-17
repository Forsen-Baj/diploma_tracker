namespace DiplomaTracker.Api.Entities;

public class StudentProfile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string StudentNumber { get; set; } = string.Empty;
    public string? DiplomaTopic { get; set; }
    public Guid GroupId { get; set; }
    public Guid? SupervisorId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public AppUser User { get; set; } = null!;
    public Group Group { get; set; } = null!;
    public AppUser? Supervisor { get; set; }
    public ICollection<StudentTask> StudentTasks { get; set; } = new List<StudentTask>();
}
