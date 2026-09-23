namespace DiplomaTracker.Api.Entities;

public class Topic
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SupervisorId { get; set; }
    public AppUser Supervisor { get; set; } = null!;
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
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
