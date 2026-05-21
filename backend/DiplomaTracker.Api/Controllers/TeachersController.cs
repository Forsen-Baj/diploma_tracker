using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Interfaces;
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
        var teachers = await _teacherService.GetTeachersAsync();
        return Ok(teachers);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var teacher = await _teacherService.GetTeacherByIdAsync(id);
        if (teacher is null)
        {
            return NotFound();
        }

        return Ok(teacher);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.CreateTeacherAsync(request);
        if (teacher is null)
        {
            if (error == "Email already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = teacher.Id }, teacher);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.UpdateTeacherAsync(id, request);
        if (teacher is null)
        {
            if (error == "Teacher not found.")
            {
                return NotFound();
            }

            if (error == "Email already exists.")
            {
                return Conflict(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(teacher);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _teacherService.DeactivateTeacherAsync(id);
        if (!success)
        {
            if (error == "Teacher not found.")
            {
                return NotFound();
            }

            return BadRequest(new { message = error });
        }

        return NoContent();
    }
}
