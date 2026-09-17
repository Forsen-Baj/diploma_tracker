namespace DiplomaTracker.Api.Entities;

public class Group
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Department Department { get; set; } = null!;
    public ICollection<StudentProfile> Students { get; set; } = new List<StudentProfile>();
    public ICollection<GroupReviewer> Reviewers { get; set; } = new List<GroupReviewer>();
    public ICollection<GroupTask> GroupTasks { get; set; } = new List<GroupTask>();
}
