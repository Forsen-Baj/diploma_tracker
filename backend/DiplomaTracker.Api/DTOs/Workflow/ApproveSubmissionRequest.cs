using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class ApproveSubmissionRequest
{
    // decimal, not int: an int model-binding failure short-circuits to validation.failed before
    // the service layer ever sees a fractional mark, so review.markOutOfRange (spec §7) never
    // fires. Binding as decimal lets ApproveAsync reject a non-whole number itself.
    public decimal? Mark { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }
}
