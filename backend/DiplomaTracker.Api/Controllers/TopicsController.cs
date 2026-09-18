using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/topics")]
[Authorize]
public class TopicsController : ApiControllerBase
{
    private readonly ITopicService _topicService;

    public TopicsController(ITopicService topicService)
    {
        _topicService = topicService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] TopicQuery query)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topics, error) = await _topicService.GetTopicsAsync(user, query);
        return topics is null ? ErrorResult(error) : Ok(topics);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.GetTopicAsync(user, id);
        return topic is null ? ErrorResult(error) : Ok(topic);
    }

    [HttpGet("supervisors")]
    public async Task<IActionResult> GetSupervisors()
    {
        return Ok(await _topicService.GetSupervisorsAsync());
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTopicRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.CreateTopicAsync(user, request);
        return topic is null ? ErrorResult(error) : CreatedAtAction(nameof(GetById), new { id = topic.Id }, topic);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTopicRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.UpdateTopicAsync(user, id, request);
        return topic is null ? ErrorResult(error) : Ok(topic);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _topicService.DeleteTopicAsync(user, id);
        return success ? NoContent() : ErrorResult(error);
    }
}
