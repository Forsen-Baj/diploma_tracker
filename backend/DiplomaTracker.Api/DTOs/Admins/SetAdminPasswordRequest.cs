using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Admins;

public class SetAdminPasswordRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}
