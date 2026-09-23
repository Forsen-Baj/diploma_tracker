namespace DiplomaTracker.Api.Entities;

/// Who, besides an administrator, may read this archive. The live GroupReviewers rows are
/// deleted with the group, so the ids are copied in here at archive time (§4.5).
public class ArchivedGroupReviewer
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;
    public Guid ReviewerId { get; set; }
    public string ReviewerName { get; set; } = string.Empty;
}
