namespace DiplomaTracker.Api.Entities;

public class Topic
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SupervisorId { get; set; }
    public AppUser Supervisor { get; set; } = null!;
    /// Design 2026-09-27 §4.1: every topic belongs to one direction; its department is the
    /// direction's, and that is what decides which students may discover it.
    public Guid DirectionId { get; set; }
    public Direction Direction { get; set; } = null!;

    /// The staff member who created the topic; their seats on a request start approved (§5.2).
    /// Null for a student's proposal - a student holds no seat, and student accounts are deleted
    /// with their group.
    public Guid? CreatedById { get; set; }
    public AppUser? CreatedBy { get; set; }
    public TopicOrigin Origin { get; set; }
    public TopicStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<TopicReservation> Reservations { get; set; } = new List<TopicReservation>();

    /// The student who holds this topic, as a collection because EF cannot model the
    /// relationship one-to-one: StudentProfile.TopicId is guarded by a FILTERED unique index
    /// (SQL Server allows only one NULL in a plain unique index, and most students have none).
    /// It contains at most one profile, and the filtered index is what guarantees that.
    public ICollection<StudentProfile> Holders { get; set; } = new List<StudentProfile>();
}
