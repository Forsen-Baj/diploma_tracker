namespace DiplomaTracker.Api.DTOs.Staff;

public class RoleAssignmentResponse
{
    public Guid Id { get; set; }
    public string Role { get; set; } = string.Empty;
    public string ScopeKind { get; set; } = string.Empty;
    public Guid ScopeId { get; set; }

    /// The faculty's or department's name, or the group's code.
    public string ScopeName { get; set; } = string.Empty;

    /// Short names from the faculty down, e.g. "ФІОТ / ІПЗ / ІП-21".
    public string ScopePath { get; set; } = string.Empty;

    /// The place's faculty, and its department and group where it has them, so the interface can
    /// tell what the assignment covers without another request.
    public Guid FacultyId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? GroupId { get; set; }
    public DateTime CreatedAt { get; set; }
}
