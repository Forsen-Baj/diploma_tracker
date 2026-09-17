using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class StudentsController : ControllerBase
{
    private readonly IStudentService _studentService;

    public StudentsController(IStudentService studentService)
    {
        _studentService = studentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _studentService.GetStudentsAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var student = await _studentService.GetStudentByIdAsync(id);
        return student is null ? NotFound() : Ok(student);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStudentRequest request)
    {
        var (student, error) = await _studentService.CreateStudentAsync(request);
        return student is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = student.Id }, student);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStudentRequest request)
    {
        var (student, error) = await _studentService.UpdateStudentAsync(id, request);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _studentService.DeactivateStudentAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPost("{id:guid}/reset-access")]
    public async Task<IActionResult> ResetAccess(Guid id)
    {
        var (success, error) = await _studentService.ResetAccessAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPut("{id:guid}/group")]
    public async Task<IActionResult> AssignGroup(Guid id, [FromBody] AssignStudentGroupRequest request)
    {
        var (student, error) = await _studentService.AssignGroupAsync(id, request.GroupId);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    [HttpPut("{id:guid}/supervisor")]
    public async Task<IActionResult> AssignSupervisor(Guid id, [FromBody] AssignStudentSupervisorRequest request)
    {
        var (student, error) = await _studentService.AssignSupervisorAsync(id, request.SupervisorId);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        OnboardingErrors.StudentNotFound => NotFound(new { message = error }),
        OnboardingErrors.EmailTaken or OnboardingErrors.StudentNumberTaken => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
