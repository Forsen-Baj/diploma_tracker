using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/student")]
[Authorize(Roles = "Student")]
public class StudentTasksController : ApiControllerBase
{
    private readonly IGroupTaskService _groupTaskService;

    public StudentTasksController(IGroupTaskService groupTaskService)
    {
        _groupTaskService = groupTaskService;
    }

    [HttpGet("my-tasks")]
    public async Task<IActionResult> GetMyTasks()
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (tasks, error) = await _groupTaskService.GetMyTasksAsync(userId, role);
        return tasks is null ? ErrorResult(error) : Ok(tasks);
    }

    [HttpGet("my-tasks/{id:guid}")]
    public async Task<IActionResult> GetMyTaskById(Guid id)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (task, error) = await _groupTaskService.GetMyTaskByIdAsync(id, userId, role);
        return task is null ? ErrorResult(error) : Ok(task);
    }
}
