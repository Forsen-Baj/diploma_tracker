using DiplomaTracker.Api.DTOs.Dashboard;
using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentWorkflowService
{
    Task<(IReadOnlyList<StudentStepResponse>? steps, string? error)> GetMyStepsAsync(UserContext user);
    Task<(StepDetailsResponse? step, string? error)> GetStepAsync(UserContext user, Guid studentTaskId);
    Task<(StepDetailsResponse? step, string? error)> SubmitAsync(UserContext user, Guid studentTaskId, IFormFile? mainFile, IReadOnlyList<IFormFile> supportingFiles, string? message, CancellationToken cancellationToken);
    Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request);
    Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request);
    Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken);
    Task<PagedResponse<ReviewQueueItem>> GetReviewQueueAsync(UserContext user, Guid? groupId, bool? late, int page, int pageSize);
    Task<IReadOnlyList<LateAwaitingReviewRow>> GetLateAwaitingReviewAsync(UserContext user, int take);
    Task<(PagedResponse<ReviewStudentItem>? result, string? error)> GetReviewStudentsAsync(UserContext user, Guid? groupId, bool? late, string? state, int page, int pageSize);
    Task<(GroupProgressResponse? progress, string? error)> GetGroupProgressAsync(UserContext user, Guid groupId);
    Task<(StudentProgressResponse? progress, string? error)> GetStudentProgressAsync(UserContext user, Guid? studentProfileId);
    Task<(IReadOnlyList<PanelSeatResponse>? panel, string? error)> GetPanelAsync(UserContext user, Guid studentTaskId);
    Task<(StepDetailsResponse? step, string? error)> AddReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId);
    Task<(StepDetailsResponse? step, string? error)> RemoveReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId);
    Task<(StandardsControllerChangeResponse? result, string? error)> SetStandardsControllerAsync(UserContext user, Guid groupTaskId, Guid? controllerId);

    /// Design 2026-09-27 §4.2 and §5.2: a change of a student's supervisor or direction manager moves
    /// a seat on every step they have not finished. Touches each such step and approves a Submitted
    /// one whose panel, after `adjust` applies the unsaved change, is now satisfied. Stages the
    /// changes only; the caller saves them with its own change. Returns whether any step was touched.
    Task<bool> RefreshStudentPanelsAsync(IReadOnlyCollection<Guid> studentProfileIds, DateTime now, Func<ReviewPanel.Facts, ReviewPanel.Facts> adjust);
}
