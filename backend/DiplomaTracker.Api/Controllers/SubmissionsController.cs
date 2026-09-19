using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api")]
[Authorize]
public class SubmissionsController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public SubmissionsController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("submissions/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveSubmissionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.ApproveAsync(user, id, request);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("submissions/{id:guid}/return")]
    public async Task<IActionResult> Return(Guid id, [FromBody] ReturnSubmissionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.ReturnAsync(user, id, request);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [HttpGet("submission-files/{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _workflow.OpenFileAsync(user, id, cancellationToken);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }
}
