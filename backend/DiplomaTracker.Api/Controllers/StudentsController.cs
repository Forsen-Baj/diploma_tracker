using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Interfaces;
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
        var students = await _studentService.GetStudentsAsync();
        return Ok(students);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var student = await _studentService.GetStudentByIdAsync(id);
        if (student is null)
        {
            return NotFound();
        }

        return Ok(student);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStudentRequest request)
    {
        var (student, error) = await _studentService.CreateStudentAsync(request);
        if (student is null)
        {
            if (error == "Email already exists.")
            {
                return Conflict(new { message = error });
            }

            if (error == "Group not found." || error == "Supervisor not found.")
            {
                return NotFound(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return CreatedAtAction(nameof(GetById), new { id = student.Id }, student);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStudentRequest request)
    {
        var (student, error) = await _studentService.UpdateStudentAsync(id, request);
        if (student is null)
        {
            if (error == "Student not found.")
            {
                return NotFound();
            }

            if (error == "Email already exists.")
            {
                return Conflict(new { message = error });
            }

            if (error == "Group not found." || error == "Supervisor not found.")
            {
                return NotFound(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(student);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _studentService.DeactivateStudentAsync(id);
        if (!success)
        {
            if (error == "Student not found.")
            {
                return NotFound();
            }

            return BadRequest(new { message = error });
        }

        return NoContent();
    }

    [HttpPut("{id:guid}/group")]
    public async Task<IActionResult> AssignGroup(Guid id, [FromBody] AssignStudentGroupRequest request)
    {
        var (student, error) = await _studentService.AssignGroupAsync(id, request.GroupId);
        if (student is null)
        {
            if (error == "Student not found." || error == "Group not found.")
            {
                return NotFound(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(student);
    }

    [HttpPut("{id:guid}/supervisor")]
    public async Task<IActionResult> AssignSupervisor(Guid id, [FromBody] AssignStudentSupervisorRequest request)
    {
        var (student, error) = await _studentService.AssignSupervisorAsync(id, request.SupervisorId);
        if (student is null)
        {
            if (error == "Student not found." || error == "Supervisor not found.")
            {
                return NotFound(new { message = error });
            }

            return BadRequest(new { message = error });
        }

        return Ok(student);
    }
}
