using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/group-tasks")]
[Authorize(Roles = "Admin,Teacher")]
public class GroupTasksController : ApiControllerBase
{
    private readonly IGroupTaskService _groupTaskService;

    public GroupTasksController(IGroupTaskService groupTaskService)
    {
        _groupTaskService = groupTaskService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (tasks, error) = await _groupTaskService.GetGroupTasksAsync(role, userId);
        return tasks is null ? ErrorResult(error) : Ok(tasks);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (task, error) = await _groupTaskService.GetGroupTaskByIdAsync(id, role, userId);
        return task is null ? ErrorResult(error) : Ok(task);
    }

    [HttpGet("/api/groups/{groupId:guid}/tasks")]
    public async Task<IActionResult> GetForGroup(Guid groupId)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (tasks, error) = await _groupTaskService.GetTasksForGroupAsync(groupId, role, userId);
        return tasks is null ? ErrorResult(error) : Ok(tasks);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateGroupTaskRequest request)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (task, error) = await _groupTaskService.CreateGroupTaskAsync(request, role, userId);
        return task is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = task.Id }, task);
    }

    [HttpPost("/api/groups/{groupId:guid}/assign-all-task-templates")]
    public async Task<IActionResult> AssignAll(Guid groupId, [FromBody] AssignAllTaskTemplatesRequest request)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (response, error) = await _groupTaskService.AssignAllTaskTemplatesAsync(groupId, request, role, userId);
        return response is null ? ErrorResult(error) : Ok(response);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGroupTaskRequest request)
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (task, error) = await _groupTaskService.UpdateGroupTaskAsync(id, request, role, userId);
        return task is null ? ErrorResult(error) : Ok(task);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _groupTaskService.DeleteGroupTaskAsync(id);
        return success ? NoContent() : ErrorResult(error);
    }
}
