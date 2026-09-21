using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/settings")]
[Authorize]
public class SettingsController : ApiControllerBase
{
    private readonly ITopicSettingsService _topicSettingsService;

    public SettingsController(ITopicSettingsService topicSettingsService)
    {
        _topicSettingsService = topicSettingsService;
    }

    [HttpGet("topic-selection")]
    public async Task<IActionResult> GetTopicSelection()
    {
        return Ok(new TopicSelectionSettingsDto { Deadline = await _topicSettingsService.GetDeadlineAsync() });
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("topic-selection")]
    public async Task<IActionResult> UpdateTopicSelection([FromBody] TopicSelectionSettingsDto request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        await _topicSettingsService.SetDeadlineAsync(request.Deadline, user.UserId);
        return NoContent();
    }
}
