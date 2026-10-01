using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class ReturnReservationRequest
{
    /// What the student should change. Required: a whitespace-only comment fails [Required] too.
    [Required, MaxLength(1000)]
    public string Comment { get; set; } = string.Empty;
}
