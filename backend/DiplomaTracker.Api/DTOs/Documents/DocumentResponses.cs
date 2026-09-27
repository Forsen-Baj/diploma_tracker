namespace DiplomaTracker.Api.DTOs.Documents;

public class DocumentListItem
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HolderName { get; set; }

    /// Who made the latest hand-off, what they wrote and when.
    public string? FromName { get; set; }
    public string? Comment { get; set; }
    public DateTime? Since { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// The latest hand-off sent it back to the caller.
    public bool IsRejected { get; set; }
}

public class DocumentCountsResponse
{
    public int Review { get; set; }
    public int Signing { get; set; }
}

public class DocumentVersionResponse
{
    public Guid Id { get; set; }
    public int Number { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
}

public class DocumentEventResponse
{
    public int Sequence { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;

    /// The actor's account no longer exists (a document handed back when it was deleted).
    public bool ActorRemoved { get; set; }
    public string? RecipientName { get; set; }
    public string? Purpose { get; set; }
    public string? Comment { get; set; }
    public int? VersionNumber { get; set; }
    public DateTime At { get; set; }
}

public class DocumentPersonResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
}

public class DocumentRejectionResponse
{
    public string FromName { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public DateTime At { get; set; }
}

public class DocumentDetailsResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public bool IsOwner { get; set; }
    public string State { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HolderName { get; set; }
    public bool IsHolder { get; set; }

    /// The last timeline sequence; every write sends it back as expectedSequence.
    public int Sequence { get; set; }

    /// §4.2 "Completed - done by {name}"; set only while the document is Completed.
    public string? CompletedByName { get; set; }

    /// Set when the document was sent back to the caller and they hold it now.
    public DocumentRejectionResponse? Rejection { get; set; }
    public IReadOnlyList<DocumentVersionResponse> Versions { get; set; } = [];
    public IReadOnlyList<DocumentEventResponse> Events { get; set; } = [];
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanSend { get; set; }
    public bool CanAddVersion { get; set; }
    public bool CanForward { get; set; }
    public bool CanReject { get; set; }
    public bool CanDone { get; set; }
    public bool CanRecall { get; set; }
    public bool SignedCopyRequired { get; set; }
    public IReadOnlyList<DocumentPersonResponse> RejectTargets { get; set; } = [];
}

public class DocumentRecipientResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? GroupCode { get; set; }
}
