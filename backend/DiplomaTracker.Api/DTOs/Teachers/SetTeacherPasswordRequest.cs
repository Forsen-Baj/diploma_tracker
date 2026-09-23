using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Teachers;

public class SetTeacherPasswordRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}
