namespace DiplomaTracker.Api.DTOs.Workflow;

public class StepDetailsResponse : StudentStepResponse
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public bool CanReview { get; set; }
    public Guid? PendingSubmissionId { get; set; }
    public IReadOnlyList<SubmissionResponse> Timeline { get; set; } = [];
}
