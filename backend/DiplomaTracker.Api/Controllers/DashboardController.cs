using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    [Authorize(Roles = "Admin")]
    [HttpGet("admin")]
    public IActionResult Admin()
    {
        return Ok(new { message = "Admin dashboard endpoint" });
    }

    [Authorize(Roles = "Teacher")]
    [HttpGet("teacher")]
    public IActionResult Teacher()
    {
        return Ok(new { message = "Teacher dashboard endpoint" });
    }

    [Authorize(Roles = "Student")]
    [HttpGet("student")]
    public IActionResult Student()
    {
        return Ok(new { message = "Student dashboard endpoint" });
    }
}
