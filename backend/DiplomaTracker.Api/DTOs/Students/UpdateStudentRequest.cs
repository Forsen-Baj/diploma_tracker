using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.Validation;

namespace DiplomaTracker.Api.DTOs.Students;

public class UpdateStudentRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, ValidEmail, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(32)]
    public string StudentNumber { get; set; } = string.Empty;

    public Guid GroupId { get; set; }

    public Guid? SupervisorId { get; set; }
}
