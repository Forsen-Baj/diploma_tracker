using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Staff;

/// `role` is Teacher, DirectionManager or StandardsController; `scopeKind` Faculty, Department or
/// Group. Both by name.
public class AddRoleAssignmentRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;

    [Required]
    public string ScopeKind { get; set; } = string.Empty;

    [Required]
    public Guid? ScopeId { get; set; }
}
