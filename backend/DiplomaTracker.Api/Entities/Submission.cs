namespace DiplomaTracker.Api.Entities;

public class Submission
{
    public Guid Id { get; set; }
    public Guid StudentTaskId { get; set; }
    public StudentTask StudentTask { get; set; } = null!;
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }

    /// The outcome of this version (design 2026-09-24 §3.1): empty while the panel is deciding,
    /// Returned when a reviewer returned it, Approved when it completed the panel.
    public SubmissionDecision? Decision { get; set; }
    public DateTime? DecidedAt { get; set; }
    public ICollection<SubmissionReview> Reviews { get; set; } = new List<SubmissionReview>();
    public ICollection<SubmissionFile> Files { get; set; } = new List<SubmissionFile>();
}
