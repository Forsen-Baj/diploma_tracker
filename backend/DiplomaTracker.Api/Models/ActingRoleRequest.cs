using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.Models;

/// Design 2026-09-27 (phase 12) §5: Teacher, DirectionManager or StandardsController.
public class ActingRoleRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;
}
