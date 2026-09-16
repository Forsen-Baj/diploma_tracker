using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/departments")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly IDepartmentService _departmentService;

    public DepartmentsController(IDepartmentService departmentService)
    {
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? facultyId)
    {
        var departments = await _departmentService.GetDepartmentsAsync(facultyId);
        return departments is null
            ? NotFound(new { message = AcademicStructureErrors.FacultyNotFound })
            : Ok(departments);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var department = await _departmentService.GetDepartmentByIdAsync(id);
        return department is null ? NotFound() : Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDepartmentRequest request)
    {
        var (department, error) = await _departmentService.CreateDepartmentAsync(request);
        return department is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = department.Id }, department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentRequest request)
    {
        var (department, error) = await _departmentService.UpdateDepartmentAsync(id, request);
        return department is null ? ToErrorResult(error) : Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _departmentService.DeleteDepartmentAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        AcademicStructureErrors.DepartmentNotFound => NotFound(new { message = error }),
        AcademicStructureErrors.DepartmentNameTaken
            or AcademicStructureErrors.DepartmentShortNameTaken
            or AcademicStructureErrors.DepartmentHasGroups => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
