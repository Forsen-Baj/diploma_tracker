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

    /// Admin, Staff or Student (design 2026-09-27, phase 12, §3). A staff member's roles are their
    /// RoleAssignments; the role a session acts in is the token's role claim.
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public StudentProfile? StudentProfile { get; set; }
    public ICollection<StudentProfile> SupervisedStudents { get; set; } = new List<StudentProfile>();
    public ICollection<Topic> SupervisedTopics { get; set; } = new List<Topic>();
    public ICollection<Direction> ManagedDirections { get; set; } = new List<Direction>();
    public ICollection<RoleAssignment> RoleAssignments { get; set; } = new List<RoleAssignment>();
}
