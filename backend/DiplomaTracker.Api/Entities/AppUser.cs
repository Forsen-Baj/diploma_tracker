namespace DiplomaTracker.Api.Entities;

public class AppUser
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public bool ClaimReopened { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    /// Design 2026-09-27 §3: capabilities of a Teacher account. Read from the database on every
    /// request, never from the token.
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public StudentProfile? StudentProfile { get; set; }
    public ICollection<StudentProfile> SupervisedStudents { get; set; } = new List<StudentProfile>();
    public ICollection<GroupReviewer> GroupReviews { get; set; } = new List<GroupReviewer>();
    public ICollection<Topic> SupervisedTopics { get; set; } = new List<Topic>();
    public ICollection<Direction> ManagedDirections { get; set; } = new List<Direction>();
}
