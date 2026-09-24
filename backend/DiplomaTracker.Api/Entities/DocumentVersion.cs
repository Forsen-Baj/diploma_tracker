namespace DiplomaTracker.Api.Entities;

public class DocumentVersion
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int Number { get; set; }

    /// Set to null when the uploader's account is deleted (§4.5); the name stays as text.
    public Guid? UploadedById { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
    public RoutedDocument Document { get; set; } = null!;
}
