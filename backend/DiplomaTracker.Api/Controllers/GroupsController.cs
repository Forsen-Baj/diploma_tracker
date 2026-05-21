using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin,Teacher")]
public class GroupsController : ControllerBase
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
        if (group is null)
        {
            return NotFound();
        }

        return Ok(group);
    }

    [HttpGet("{groupId:guid}/students")]
    public async Task<IActionResult> GetStudents(Guid groupId)
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(role) || string.IsNullOrWhiteSpace(userIdValue) || !Guid.TryParse(userIdValue, out var userId))
        {
            return Forbid();
        }

        var (students, error) = await _groupService.GetGroupStudentsAsync(groupId, role, userId);
        if (students is null)
        {
            if (error == "Group not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return BadRequest(new { message = error });
        }

        return Ok(students);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupRequest request)
    {
        var (group, error) = await _groupService.CreateGroupAsync(request);
        if (group is null)
        {
            if (error == "Group with the same name and academic year already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = group.Id }, group);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupRequest request)
    {
        var (group, error) = await _groupService.UpdateGroupAsync(id, request);
        if (group is null)
        {
            if (error == "Group not found.")
            {
                return NotFound();
            }

            if (error == "Group with the same name and academic year already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(group);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _groupService.DeleteGroupAsync(id);
        if (!success)
        {
            if (error == "Group not found.")
            {
                return NotFound();
            }

            if (error == "Cannot delete group because students are assigned.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return NoContent();
    }

    [HttpGet("{groupId:guid}/reviewers")]
    public async Task<IActionResult> GetReviewers(Guid groupId)
    {
        var reviewers = await _groupService.GetGroupReviewersAsync(groupId);
        if (reviewers is null)
        {
            return NotFound();
        }

        return Ok(reviewers);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost("{groupId:guid}/reviewers")]
    public async Task<IActionResult> AddReviewer(Guid groupId, [FromBody] AddGroupReviewerRequest request)
    {
        var (reviewer, error) = await _groupService.AddGroupReviewerAsync(groupId, request);
        if (reviewer is null)
        {
            if (error == "Group not found." || error == "Reviewer not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Reviewer is already assigned to this group.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(reviewer);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{groupId:guid}/reviewers/{reviewerId:guid}")]
    public async Task<IActionResult> RemoveReviewer(Guid groupId, Guid reviewerId)
    {
        var (success, error) = await _groupService.RemoveGroupReviewerAsync(groupId, reviewerId);
        if (!success)
        {
            if (error == "Group not found." || error == "Reviewer assignment not found.")
            {
                return NotFound(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return NoContent();
    }
}
