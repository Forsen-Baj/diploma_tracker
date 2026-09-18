using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.Validation;

namespace DiplomaTracker.Api.DTOs.Teachers;

public class UpdateTeacherRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, ValidEmail, MaxLength(256)]
    public string Email { get; set; } = string.Empty;
}
