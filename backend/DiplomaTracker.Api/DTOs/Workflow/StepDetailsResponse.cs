namespace DiplomaTracker.Api.DTOs.Workflow;

public class StepDetailsResponse : StudentStepResponse
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;

    /// The caller holds an open seat on this step's panel and the latest version awaits
    /// decisions (design 2026-09-24 §3.3).
    public bool CanDecide { get; set; }
    public Guid? PendingSubmissionId { get; set; }

    /// The caller may add or remove extra reviewers: the supervisor, a group reviewer or an
    /// administrator, while the step is not approved and the student is not archived.
    public bool CanManagePanel { get; set; }
    public IReadOnlyList<PanelSeatResponse> Panel { get; set; } = [];
    public IReadOnlyList<SubmissionResponse> Timeline { get; set; } = [];
}
