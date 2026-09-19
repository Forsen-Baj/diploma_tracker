using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class ReturnSubmissionRequest
{
    [MaxLength(2000)]
    public string? Comment { get; set; }
}
