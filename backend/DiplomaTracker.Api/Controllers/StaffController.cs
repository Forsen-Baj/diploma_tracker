using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

/// Design 2026-09-27 (phase 12) §6: staff accounts and their roles are the administrators'; the
/// picker is every staff role's. Roles are set per action because the two rules differ.
[Route("api/staff")]
[Authorize]
public class StaffController : ApiControllerBase
{
    private readonly IStaffService _staff;

    public StaffController(IStaffService staff)
    {
        _staff = staff;
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] StaffListQuery query)
    {
        if (!StaffRoleName.TryParse(query.Role, out _))
        {
            return ErrorResult(CommonErrors.ValidationFailed);
        }

        return Ok(await _staff.GetStaffAsync(query));
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var staff = await _staff.GetStaffMemberAsync(id);
        return staff is null ? ErrorResult(StaffErrors.NotFound) : Ok(staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStaffRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (staff, error) = await _staff.CreateStaffAsync(request, administratorId);
        return staff is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = staff.Id }, staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStaffRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (staff, error) = await _staff.UpdateStaffAsync(id, request, administratorId);
        return staff is null ? ErrorResult(error) : Ok(staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _staff.DeactivateStaffAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, [FromBody] SetStaffPasswordRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _staff.SetPasswordAsync(id, request.Password, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPost("{id:guid}/roles")]
    public async Task<IActionResult> AddRole(Guid id, [FromBody] AddRoleAssignmentRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (assignment, error) = await _staff.AddAssignmentAsync(id, request, administratorId);
        return assignment is null ? ErrorResult(error) : StatusCode(StatusCodes.Status201Created, assignment);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpDelete("{id:guid}/roles/{assignmentId:guid}")]
    public async Task<IActionResult> RemoveRole(Guid id, Guid assignmentId)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error, blockers) = await _staff.RemoveAssignmentAsync(id, assignmentId, administratorId);
        return success ? NoContent() : ErrorResult(error, blockers);
    }

    [Authorize(Roles = AuthRoles.AdminOrAnyStaffRole)]
    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] StaffOptionsQuery query)
    {
        if (!StaffRoleName.TryParse(query.Role, out _))
        {
            return ErrorResult(CommonErrors.ValidationFailed);
        }

        return Ok(await _staff.SearchOptionsAsync(query));
    }
}
