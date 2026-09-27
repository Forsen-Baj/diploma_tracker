using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/staff")]
[Authorize(Roles = "Admin,Teacher")]
public class StaffController : ApiControllerBase
{
    private readonly ITeacherService _teachers;

    public StaffController(ITeacherService teachers)
    {
        _teachers = teachers;
    }

    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] string? search, [FromQuery] StaffCapability? capability)
    {
        return Ok(await _teachers.SearchStaffAsync(search, capability));
    }
}
