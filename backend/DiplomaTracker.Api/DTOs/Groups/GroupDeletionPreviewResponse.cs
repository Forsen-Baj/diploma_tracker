namespace DiplomaTracker.Api.DTOs.Groups;

public class GroupDeletionPreviewResponse
{
    public int ActiveStudentCount { get; set; }
    public int ArchivedStudentCount { get; set; }
    public int FileCount { get; set; }
}
