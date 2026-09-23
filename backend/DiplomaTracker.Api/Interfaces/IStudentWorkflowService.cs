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
    Task<(GroupProgressResponse? progress, string? error)> GetGroupProgressAsync(UserContext user, Guid groupId);
    Task<(StudentProgressResponse? progress, string? error)> GetStudentProgressAsync(UserContext user, Guid? studentProfileId);
}
