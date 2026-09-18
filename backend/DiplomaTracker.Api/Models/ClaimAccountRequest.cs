using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.Models;

public class ClaimAccountRequest
{
    [Required, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(32)]
    public string StudentNumber { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
