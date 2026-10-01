using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Directions;

public class CreateDirectionRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// Administrators only: the direction manager. A direction manager always manages what they create.
    public Guid? ManagerId { get; set; }
}
