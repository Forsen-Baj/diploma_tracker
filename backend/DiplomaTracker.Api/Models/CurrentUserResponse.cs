using DiplomaTracker.Api.DTOs.Staff;

namespace DiplomaTracker.Api.Models;

public class CurrentUserResponse
{
    public string Id { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// The role this session acts in: Admin, Student, Teacher, DirectionManager,
    /// StandardsController, or Staff for a staff member acting in none (design 2026-09-27, phase 12, §5).
    public string Role { get; set; } = string.Empty;

    /// Admin, Staff or Student.
    public string AccountRole { get; set; } = string.Empty;

    /// A staff member's roles and where they hold them; empty for everyone else.
    public IReadOnlyList<RoleAssignmentResponse> Assignments { get; set; } = [];
}
