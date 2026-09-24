using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class AddPanelReviewerRequest
{
    [Required]
    public Guid? ReviewerId { get; set; }
}
