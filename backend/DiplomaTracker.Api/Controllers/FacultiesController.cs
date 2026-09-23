using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/faculties")]
[Authorize]
public class FacultiesController : ApiControllerBase
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
        return faculty is null ? ErrorResult(AcademicStructureErrors.FacultyNotFound) : Ok(faculty);
    }

    [HttpGet("{id:guid}/departments")]
    public async Task<IActionResult> GetDepartments(Guid id)
    {
        var departments = await _departmentService.GetDepartmentsAsync(id);
        return departments is null
            ? ErrorResult(AcademicStructureErrors.FacultyNotFound)
            : Ok(departments);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFacultyRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (faculty, error) = await _facultyService.CreateFacultyAsync(request, administratorId);
        return faculty is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = faculty.Id }, faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFacultyRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (faculty, error) = await _facultyService.UpdateFacultyAsync(id, request, administratorId);
        return faculty is null ? ErrorResult(error) : Ok(faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _facultyService.DeleteFacultyAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }
}
