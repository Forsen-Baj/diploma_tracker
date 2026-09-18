using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class DecisionRequest
{
    [MaxLength(1000)]
    public string? Comment { get; set; }
}
