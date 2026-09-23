using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Filters;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/student-tasks")]
[Authorize]
public class StudentTasksController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public StudentTasksController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (steps, error) = await _workflow.GetMyStepsAsync(user);
        return steps is null ? ErrorResult(error) : Ok(steps);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.GetStepAsync(user, id);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/submissions")]
    [ServiceFilter(typeof(StudentTaskOwnershipFilter))]
    [RequestSizeLimit(SubmissionFileRules.MaxRequestBytes)]
    [RequestFormLimits(
        ValueCountLimit = 8,
        MemoryBufferThreshold = 64 * 1024,
        MultipartBodyLengthLimit = SubmissionFileRules.MaxRequestBytes)]
    public async Task<IActionResult> Submit(
        Guid id,
        [FromForm] IFormFile? mainFile,
        [FromForm] List<IFormFile>? supportingFiles,
        [FromForm] string? message,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.SubmitAsync(user, id, mainFile, supportingFiles ?? [], message, cancellationToken);
        return step is null ? ErrorResult(error) : Ok(step);
    }
}
