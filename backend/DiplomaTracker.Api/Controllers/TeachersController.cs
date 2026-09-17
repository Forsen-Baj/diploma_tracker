using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class TeachersController : ControllerBase
{
    private readonly ITeacherService _teacherService;

    public TeachersController(ITeacherService teacherService)
    {
        _teacherService = teacherService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _teacherService.GetTeachersAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var teacher = await _teacherService.GetTeacherByIdAsync(id);
        return teacher is null ? NotFound() : Ok(teacher);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.CreateTeacherAsync(request);
        return teacher is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = teacher.Id }, teacher);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.UpdateTeacherAsync(id, request);
        return teacher is null ? ToErrorResult(error) : Ok(teacher);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _teacherService.DeactivateTeacherAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, [FromBody] SetTeacherPasswordRequest request)
    {
        var (success, error) = await _teacherService.SetPasswordAsync(id, request.Password);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        OnboardingErrors.TeacherNotFound => NotFound(new { message = error }),
        OnboardingErrors.EmailTaken => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
