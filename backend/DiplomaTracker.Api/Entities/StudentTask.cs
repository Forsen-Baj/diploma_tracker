namespace DiplomaTracker.Api.Entities;

public class StudentTask
{
    public Guid Id { get; set; }
    public Guid StudentProfileId { get; set; }
    public Guid GroupTaskId { get; set; }
    public StudentTaskStatus Status { get; set; } = StudentTaskStatus.Pending;
    public int? Mark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public StudentProfile StudentProfile { get; set; } = null!;
    public GroupTask GroupTask { get; set; } = null!;
    public ICollection<Submission> Submissions { get; set; } = new List<Submission>();
}
