namespace DiplomaTracker.Api.Entities;

public class SubmissionFile
{
    public Guid Id { get; set; }
    public Guid SubmissionId { get; set; }
    public Submission Submission { get; set; } = null!;
    public SubmissionFileKind Kind { get; set; }
    public string OriginalName { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}
