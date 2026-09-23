using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/dashboard")]
[Authorize]
public class DashboardController : ApiControllerBase
{
    private readonly IDashboardService _dashboard;

    public DashboardController(IDashboardService dashboard)
    {
        _dashboard = dashboard;
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin")]
    public async Task<IActionResult> Admin()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _dashboard.GetAdminAsync(user));
    }

    [Authorize(Roles = "Teacher")]
    [HttpGet("teacher")]
    public async Task<IActionResult> Teacher()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _dashboard.GetTeacherAsync(user));
    }

    [Authorize(Roles = "Student")]
    [HttpGet("student")]
    public async Task<IActionResult> Student()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (dashboard, error) = await _dashboard.GetStudentAsync(user);
        return dashboard is null ? ErrorResult(error) : Ok(dashboard);
    }
}
