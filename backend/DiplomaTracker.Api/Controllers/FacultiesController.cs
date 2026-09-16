using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/faculties")]
[Authorize]
public class FacultiesController : ControllerBase
{
    private readonly IFacultyService _facultyService;
    private readonly IDepartmentService _departmentService;

    public FacultiesController(IFacultyService facultyService, IDepartmentService departmentService)
    {
        _facultyService = facultyService;
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _facultyService.GetFacultiesAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var faculty = await _facultyService.GetFacultyByIdAsync(id);
        return faculty is null ? NotFound() : Ok(faculty);
    }

    [HttpGet("{id:guid}/departments")]
    public async Task<IActionResult> GetDepartments(Guid id)
    {
        var departments = await _departmentService.GetDepartmentsAsync(id);
        return departments is null
            ? NotFound(new { message = AcademicStructureErrors.FacultyNotFound })
            : Ok(departments);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFacultyRequest request)
    {
        var (faculty, error) = await _facultyService.CreateFacultyAsync(request);
        return faculty is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = faculty.Id }, faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFacultyRequest request)
    {
        var (faculty, error) = await _facultyService.UpdateFacultyAsync(id, request);
        return faculty is null ? ToErrorResult(error) : Ok(faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _facultyService.DeleteFacultyAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        AcademicStructureErrors.FacultyNotFound => NotFound(new { message = error }),
        AcademicStructureErrors.FacultyNameTaken
            or AcademicStructureErrors.FacultyShortNameTaken
            or AcademicStructureErrors.FacultyHasDepartments => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
