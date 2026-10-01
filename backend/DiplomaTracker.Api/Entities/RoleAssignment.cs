namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-27 (phase 12) §3: one role for one place. A person may hold several - a teacher in
/// one group and a direction manager in another department.
public class RoleAssignment
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public StaffRole Role { get; set; }
    public RoleScopeKind ScopeKind { get; set; }

    /// The faculty, department or group. Not a foreign key, because it names a row in one of three
    /// tables; deleting the place deletes the assignments scoped to it (§3).
    public Guid ScopeId { get; set; }

    public Guid CreatedById { get; set; }
    public DateTime CreatedAt { get; set; }
    public AppUser User { get; set; } = null!;
    public AppUser CreatedBy { get; set; } = null!;
}
