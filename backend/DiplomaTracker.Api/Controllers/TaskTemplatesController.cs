using DiplomaTracker.Api.DTOs.TaskTemplates;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/task-templates")]
[Authorize(Roles = "Admin,Teacher")]
public class TaskTemplatesController : ControllerBase
{
    private readonly ITaskTemplateService _taskTemplateService;

    public TaskTemplatesController(ITaskTemplateService taskTemplateService)
    {
        _taskTemplateService = taskTemplateService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await _taskTemplateService.GetTaskTemplatesAsync();
        return Ok(templates);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var template = await _taskTemplateService.GetTaskTemplateByIdAsync(id);
        if (template is null)
        {
            return NotFound();
        }

        return Ok(template);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTaskTemplateRequest request)
    {
        var (template, error) = await _taskTemplateService.CreateTaskTemplateAsync(request);
        if (template is null)
        {
            if (error == "Active template with this title already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = template.Id }, template);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTaskTemplateRequest request)
    {
        var (template, error) = await _taskTemplateService.UpdateTaskTemplateAsync(id, request);
        if (template is null)
        {
            if (error == "Task template not found.")
            {
                return NotFound();
            }

            if (error == "Active template with this title already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(template);
    }

    [HttpPatch("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id)
    {
        var (template, error) = await _taskTemplateService.ActivateTaskTemplateAsync(id);
        if (template is null)
        {
            if (error == "Task template not found.")
            {
                return NotFound();
            }

            if (error == "Active template with this title already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(template);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (template, error) = await _taskTemplateService.DeactivateTaskTemplateAsync(id);
        if (template is null)
        {
            if (error == "Task template not found.")
            {
                return NotFound();
            }

            return BadRequest(new { message = error });
        }

        return Ok(template);
    }
}
