namespace DiplomaTracker.Api.DTOs.Workflow;

public class ReviewQueueItem
{
    public Guid SubmissionId { get; set; }
    public Guid StudentTaskId { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
}
