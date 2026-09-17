using DiplomaTracker.Api.DTOs.TaskTemplates;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/task-templates")]
[Authorize(Roles = "Admin,Teacher")]
public class TaskTemplatesController : ApiControllerBase
{
    private readonly ITaskTemplateService _taskTemplateService;

    public TaskTemplatesController(ITaskTemplateService taskTemplateService)
    {
        _taskTemplateService = taskTemplateService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? facultyId)
    {
        var templates = await _taskTemplateService.GetTaskTemplatesAsync(facultyId);
        return Ok(templates);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var template = await _taskTemplateService.GetTaskTemplateByIdAsync(id);
        return template is null ? ErrorResult(TaskErrors.TemplateNotFound) : Ok(template);
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create([FromBody] CreateTaskTemplateRequest request)
    {
        var (template, error) = await _taskTemplateService.CreateTaskTemplateAsync(request);
        return template is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = template.Id }, template);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTaskTemplateRequest request)
    {
        var (template, error) = await _taskTemplateService.UpdateTaskTemplateAsync(id, request);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [HttpPatch("{id:guid}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Activate(Guid id)
    {
        var (template, error) = await _taskTemplateService.ActivateTaskTemplateAsync(id);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [HttpPatch("{id:guid}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (template, error) = await _taskTemplateService.DeactivateTaskTemplateAsync(id);
        return template is null ? ErrorResult(error) : Ok(template);
    }
}
