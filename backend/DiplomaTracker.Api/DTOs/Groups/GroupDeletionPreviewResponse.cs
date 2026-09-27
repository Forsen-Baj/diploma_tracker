namespace DiplomaTracker.Api.DTOs.Groups;

public class GroupDeletionPreviewResponse
{
    public int ActiveStudentCount { get; set; }
    public int ArchivedStudentCount { get; set; }
    public int FileCount { get; set; }

    /// Documents owned by the archived students whose accounts the deletion removes (design 2026-09-24 §4.5).
    public int DocumentCount { get; set; }
}
