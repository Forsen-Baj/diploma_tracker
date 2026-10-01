using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Directions;

public class UpdateDirectionRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// Administrators only. Null keeps the current manager.
    public Guid? ManagerId { get; set; }
}
