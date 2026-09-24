namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-24 §4.1. A document is with one person at a time: the owner while WithOwner, the
/// recipient while InCirculation (with a purpose), nobody once Completed.
public class RoutedDocument
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DocumentState State { get; set; }
    public Guid? HolderId { get; set; }
    public DocumentPurpose? Purpose { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public AppUser Owner { get; set; } = null!;
    public AppUser? Holder { get; set; }
    public ICollection<DocumentVersion> Versions { get; set; } = new List<DocumentVersion>();
    public ICollection<DocumentEvent> Events { get; set; } = new List<DocumentEvent>();
}
