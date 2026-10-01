using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/group-tasks")]
[Authorize(Roles = AuthRoles.AdminOrAnyStaffRole)]
public class GroupTasksController : ApiControllerBase
{
    private readonly IGroupTaskService _groupTaskService;
    private readonly IStudentWorkflowService _workflow;

    public GroupTasksController(IGroupTaskService groupTaskService, IStudentWorkflowService workflow)
    {
        _groupTaskService = groupTaskService;
        _workflow = workflow;
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

    [Authorize(Roles = AuthRoles.Admin)]
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

    [Authorize(Roles = AuthRoles.Admin)]
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

    [Authorize(Roles = AuthRoles.Admin)]
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

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _groupTaskService.DeleteGroupTaskAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPut("{id:guid}/standards-controller")]
    public async Task<IActionResult> SetStandardsController(Guid id, [FromBody] SetStandardsControllerRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (result, error) = await _workflow.SetStandardsControllerAsync(user, id, request.UserId);
        return result is null ? ErrorResult(error) : Ok(result);
    }
}
