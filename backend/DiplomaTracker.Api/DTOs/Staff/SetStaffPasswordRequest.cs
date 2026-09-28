using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Staff;

public class SetStaffPasswordRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}
