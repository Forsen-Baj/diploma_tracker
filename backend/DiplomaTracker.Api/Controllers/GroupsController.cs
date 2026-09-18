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
        var groups = await _groupService.GetGroupsAsync();
        return Ok(groups);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var group = await _groupService.GetGroupByIdAsync(id);
        return group is null ? ErrorResult(GroupErrors.NotFound) : Ok(group);
    }

    [HttpGet("{groupId:guid}/students")]
    public async Task<IActionResult> GetStudents(Guid groupId)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (students, error) = await _groupService.GetGroupStudentsAsync(groupId, role, userId);
        return students is null ? ErrorResult(error) : Ok(students);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request)
    {
        var (group, error) = await _groupService.CreateGroupAsync(request);
        return group is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = group.Id }, group);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupRequest request)
    {
        var (group, error) = await _groupService.UpdateGroupAsync(id, request);
        return group is null ? ErrorResult(error) : Ok(group);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _groupService.DeleteGroupAsync(id);
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
        var reviewers = await _groupService.GetGroupReviewersAsync(groupId);
        return reviewers is null ? ErrorResult(GroupErrors.NotFound) : Ok(reviewers);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("{groupId:guid}/reviewers")]
    public async Task<IActionResult> AddReviewer(Guid groupId, [FromBody] AddGroupReviewerRequest request)
    {
        var (reviewer, error) = await _groupService.AddGroupReviewerAsync(groupId, request);
        return reviewer is null ? ErrorResult(error) : Ok(reviewer);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{groupId:guid}/reviewers/{reviewerId:guid}")]
    public async Task<IActionResult> RemoveReviewer(Guid groupId, Guid reviewerId)
    {
        var (success, error) = await _groupService.RemoveGroupReviewerAsync(groupId, reviewerId);
        return success ? NoContent() : ErrorResult(error);
    }
}
