namespace DiplomaTracker.Api.DTOs.Workflow;

public class SubmissionFileResponse
{
    public Guid Id { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}

public class SubmissionResponse
{
    public Guid Id { get; set; }
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public string? Decision { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public int? Mark { get; set; }
    public DateTime? DecidedAt { get; set; }
    public IReadOnlyList<SubmissionFileResponse> Files { get; set; } = [];
}
