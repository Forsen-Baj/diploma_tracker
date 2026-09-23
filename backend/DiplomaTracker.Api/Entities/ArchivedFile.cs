namespace DiplomaTracker.Api.Entities;

public class ArchivedFile
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;

    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }

    /// "Approved", "Returned" or null for a submission that was never decided.
    public string? Decision { get; set; }
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? DecidedAt { get; set; }

    /// "Main" or "Supporting".
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }

    /// The same key the live SubmissionFile uses. The archive does not copy bytes (§4.4); a
    /// stored file is deleted only when nothing points at it any more.
    public string StorageKey { get; set; } = string.Empty;

    public DateTime ArchivedAt { get; set; }
}
