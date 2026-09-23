using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Registration;

public class UpdateRegistrationStatusRequest
{
    [Required]
    public bool? Open { get; set; }
}
