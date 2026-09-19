using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api")]
[Authorize]
public class ProgressController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public ProgressController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("groups/{groupId:guid}/progress")]
    public async Task<IActionResult> Group(Guid groupId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetGroupProgressAsync(user, groupId);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }

    [Authorize(Roles = "Student")]
    [HttpGet("students/me/progress")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetStudentProgressAsync(user, null);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("students/{studentProfileId:guid}/progress")]
    public async Task<IActionResult> Student(Guid studentProfileId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetStudentProgressAsync(user, studentProfileId);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }
}
