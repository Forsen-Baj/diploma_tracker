using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Students;

public class RestoreStudentsRequest
{
    [Required, MinLength(1), MaxLength(500)]
    public List<Guid> StudentIds { get; set; } = new();
}
