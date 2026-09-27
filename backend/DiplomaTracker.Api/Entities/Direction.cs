namespace DiplomaTracker.Api.Entities;

/// A named research area inside one department (design 2026-09-27 §4.1). Every topic belongs to
/// one direction, and a topic's department is its direction's.
public class Direction
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// An active teacher with IsDirectionManager. They approve every topic request in this
    /// direction and sit on the review panel of every step of its students (§5.2, §6).
    public Guid ManagerId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Department Department { get; set; } = null!;
    public AppUser Manager { get; set; } = null!;
    public ICollection<Topic> Topics { get; set; } = new List<Topic>();
}
