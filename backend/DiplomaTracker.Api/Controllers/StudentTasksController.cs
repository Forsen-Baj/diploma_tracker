using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/student")]
[Authorize(Roles = "Student")]
public class StudentTasksController : ControllerBase
{
    private readonly IGroupTaskService _groupTaskService;

    public StudentTasksController(IGroupTaskService groupTaskService)
    {
        _groupTaskService = groupTaskService;
    }

    [HttpGet("my-tasks")]
    public async Task<IActionResult> GetMyTasks()
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var (tasks, error) = await _groupTaskService.GetMyTasksAsync(context.Value.UserId, context.Value.Role);
        if (tasks is null)
        {
            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return NotFound(new { message = error });
        }

        return Ok(tasks);
    }

    [HttpGet("my-tasks/{id:guid}")]
    public async Task<IActionResult> GetMyTaskById(Guid id)
    {
        var context = GetUserContext();
        if (context is null)
        {
            return Forbid();
        }

        var (task, error) = await _groupTaskService.GetMyTaskByIdAsync(id, context.Value.UserId, context.Value.Role);
        if (task is null)
        {
            if (error == "Forbidden.")
            {
                return Forbid();
            }

            return NotFound(new { message = error });
        }

        return Ok(task);
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
