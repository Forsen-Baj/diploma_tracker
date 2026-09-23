using System.Security.Claims;
using DiplomaTracker.Api.DTOs.Admins;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _adminService.GetAdminsAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var admin = await _adminService.GetAdminByIdAsync(id);
        return admin is null ? ErrorResult(AdminErrors.NotFound) : Ok(admin);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAdminRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (admin, error) = await _adminService.CreateAdminAsync(request, administratorId);
        return admin is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = admin.Id }, admin);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAdminRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (admin, error) = await _adminService.UpdateAdminAsync(id, request, administratorId);
        return admin is null ? ErrorResult(error) : NoContent();
    }

    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, [FromBody] SetAdminPasswordRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _adminService.SetPasswordAsync(id, request.Password, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _adminService.DeactivateAdminAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _adminService.ActivateAdminAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(userIdValue, out userId);
    }
}
