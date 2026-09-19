using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/review")]
[Authorize(Roles = "Admin,Teacher")]
public class ReviewController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public ReviewController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] Guid? groupId, [FromQuery] bool? late)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _workflow.GetReviewQueueAsync(user, groupId, late));
    }
}
