using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/group-tasks")]
[Authorize(Roles = "Admin,Teacher")]
public class GroupTasksController : ControllerBase
{
    private readonly IGroupTaskService _groupTaskService;

    public GroupTasksController(IGroupTaskService groupTaskService)
    {
        _groupTaskService = groupTaskService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (tasks, _) = await _groupTaskService.GetGroupTasksAsync(userContext.Role, userContext.UserId);
        return Ok(tasks);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (task, error) = await _groupTaskService.GetGroupTaskByIdAsync(id, userContext.Role, userContext.UserId);
        if (task is null)
        {
            if (error == "Group task not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return BadRequest(new { message = error });
        }

        return Ok(task);
    }

    [HttpGet("/api/groups/{groupId:guid}/tasks")]
    public async Task<IActionResult> GetForGroup(Guid groupId)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (tasks, error) = await _groupTaskService.GetTasksForGroupAsync(groupId, userContext.Role, userContext.UserId);
        if (tasks is null)
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

        return Ok(tasks);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupTaskRequest request)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (task, error) = await _groupTaskService.CreateGroupTaskAsync(request, userContext.Role, userContext.UserId);
        if (task is null)
        {
            if (error is "Group not found." or "Task template not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Task template is already assigned to this group.")
            {
                return Conflict(new { message = error });
            }

            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return BadRequest(new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = task.Id }, task);
    }

    [HttpPost("/api/groups/{groupId:guid}/assign-all-task-templates")]
    public async Task<IActionResult> AssignAll(Guid groupId, [FromBody] AssignAllTaskTemplatesRequest request)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (response, error) = await _groupTaskService.AssignAllTaskTemplatesAsync(groupId, request, userContext.Role, userContext.UserId);
        if (response is null)
        {
            if (error == "Group not found." || error == "One or more task templates were not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return BadRequest(new { message = error });
        }

        return Ok(response);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupTaskRequest request)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var userContext = context.Value;
        var (task, error) = await _groupTaskService.UpdateGroupTaskAsync(id, request, userContext.Role, userContext.UserId);
        if (task is null)
        {
            if (error == "Group task not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return BadRequest(new { message = error });
        }

        return Ok(task);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _groupTaskService.DeleteGroupTaskAsync(id);
        if (!success)
        {
            if (error == "Group task not found.")
            {
                return NotFound(new { message = error });
            }

            if (error == "Cannot delete group task because related student tasks are no longer pending.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return NoContent();
    }

    private (Guid UserId, string Role)? GetUserContext()
    {
        var role = User.FindFirstValue(ClaimTypes.Role);
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(role) || string.IsNullOrWhiteSpace(userIdValue) || !Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return (userId, role);
    }
}
