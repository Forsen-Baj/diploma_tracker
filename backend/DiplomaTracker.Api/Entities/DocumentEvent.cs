namespace DiplomaTracker.Api.Entities;

/// One line of a document's timeline (§4.1). The ids are set to null when that account is deleted;
/// the names are kept as text, so the timeline still reads the same.
public class DocumentEvent
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int Sequence { get; set; }
    public DocumentEventKind Kind { get; set; }
    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public Guid? RecipientId { get; set; }
    public string? RecipientName { get; set; }
    public DocumentPurpose? Purpose { get; set; }
    public string? Comment { get; set; }
    public int? VersionNumber { get; set; }
    public DateTime At { get; set; }
    public RoutedDocument Document { get; set; } = null!;
}
