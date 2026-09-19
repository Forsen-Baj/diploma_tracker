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
    public SubmissionDecision? Decision { get; set; }
    public Guid? ReviewerId { get; set; }
    public AppUser? Reviewer { get; set; }
    public string? ReviewerComment { get; set; }
    public int? Mark { get; set; }
    public DateTime? DecidedAt { get; set; }
    public ICollection<SubmissionFile> Files { get; set; } = new List<SubmissionFile>();
}
