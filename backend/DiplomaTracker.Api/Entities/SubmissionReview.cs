namespace DiplomaTracker.Api.Entities;

/// One reviewer's decision on one submitted version (design 2026-09-24 §3.1). A reviewer decides
/// once per version; an approval keeps counting for later versions of the same step.
public class SubmissionReview
{
    public Guid Id { get; set; }
    public Guid SubmissionId { get; set; }
    public Guid ReviewerId { get; set; }
    public ReviewSeat Seat { get; set; }
    public SubmissionDecision Decision { get; set; }
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public Submission Submission { get; set; } = null!;
    public AppUser Reviewer { get; set; } = null!;
}
