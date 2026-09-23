using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/archive")]
[Authorize(Roles = "Admin,Teacher")]
public class ArchiveController : ApiControllerBase
{
    private readonly IArchiveService _archive;

    public ArchiveController(IArchiveService archive)
    {
        _archive = archive;
    }

    [HttpGet("groups")]
    public async Task<IActionResult> Groups([FromQuery] string? academicYear, [FromQuery] string? search)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _archive.GetGroupsAsync(user, academicYear, search));
    }

    [HttpGet("groups/{id:guid}")]
    public async Task<IActionResult> Group(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (details, error) = await _archive.GetGroupAsync(user, id);
        return details is null ? ErrorResult(error) : Ok(details);
    }

    [HttpGet("files/{id:guid}")]
    public async Task<IActionResult> File(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _archive.OpenFileAsync(user, id, HttpContext.RequestAborted);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("usage")]
    public async Task<IActionResult> Usage() => Ok(await _archive.GetUsageAsync());

    [Authorize(Roles = "Admin")]
    [HttpDelete("groups/{id:guid}")]
    public async Task<IActionResult> Purge(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _archive.PurgeGroupAsync(id, user.UserId, HttpContext.RequestAborted);
        return success ? NoContent() : ErrorResult(error);
    }
}
