using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin,Teacher")]
public class GroupsController : ApiControllerBase
{
    private readonly IGroupService _groupService;

    public GroupsController(IGroupService groupService)
    {
        _groupService = groupService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var groups = await _groupService.GetGroupsAsync(user);
        return Ok(groups);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var group = await _groupService.GetGroupByIdAsync(user, id);
        return group is null ? ErrorResult(GroupErrors.NotFound) : Ok(group);
    }

    [HttpGet("{groupId:guid}/students")]
    public async Task<IActionResult> GetStudents(Guid groupId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (students, error) = await _groupService.GetGroupStudentsAsync(user, groupId);
        return students is null ? ErrorResult(error) : Ok(students);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (group, error) = await _groupService.CreateGroupAsync(request, administratorId);
        return group is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = group.Id }, group);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (group, error) = await _groupService.UpdateGroupAsync(id, request, administratorId);
        return group is null ? ErrorResult(error) : Ok(group);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _groupService.DeleteGroupAsync(id, user.UserId, HttpContext.RequestAborted);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("{groupId:guid}/students/archive")]
    public async Task<IActionResult> ArchiveStudents(Guid groupId)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (archived, error) = await _groupService.ArchiveGroupStudentsAsync(groupId, administratorId);
        return archived is null ? ErrorResult(error) : Ok(new ArchiveResultResponse { Archived = archived.Value });
    }

    [HttpGet("{groupId:guid}/reviewers")]
    public async Task<IActionResult> GetReviewers(Guid groupId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var reviewers = await _groupService.GetGroupReviewersAsync(user, groupId);
        return reviewers is null ? ErrorResult(GroupErrors.NotFound) : Ok(reviewers);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("{groupId:guid}/reviewers")]
    public async Task<IActionResult> AddReviewer(Guid groupId, [FromBody] AddGroupReviewerRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reviewer, error) = await _groupService.AddGroupReviewerAsync(groupId, request, administratorId);
        return reviewer is null ? ErrorResult(error) : Ok(reviewer);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{groupId:guid}/reviewers/{reviewerId:guid}")]
    public async Task<IActionResult> RemoveReviewer(Guid groupId, Guid reviewerId)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _groupService.RemoveGroupReviewerAsync(groupId, reviewerId, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }
}
