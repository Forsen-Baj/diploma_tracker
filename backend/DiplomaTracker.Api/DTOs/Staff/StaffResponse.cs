namespace DiplomaTracker.Api.DTOs.Staff;

public class StaffResponse
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public IReadOnlyList<RoleAssignmentResponse> Assignments { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
