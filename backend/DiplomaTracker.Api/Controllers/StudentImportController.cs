using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/groups/{groupId:guid}/students/import")]
[Authorize(Roles = "Admin")]
public class StudentImportController : ControllerBase
{
    private readonly IStudentImportService _importService;

    public StudentImportController(IStudentImportService importService)
    {
        _importService = importService;
    }

    [HttpPost]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> Import(Guid groupId, IFormFile? file)
    {
        var outcome = await _importService.ImportAsync(groupId, file);
        if (outcome.Result is not null)
        {
            return Ok(outcome.Result);
        }

        return outcome.Error switch
        {
            OnboardingErrors.GroupNotFound => NotFound(new { message = outcome.Error }),
            OnboardingErrors.ImportConflict => Conflict(new { message = outcome.Error }),
            _ => BadRequest(new { message = outcome.Error, errors = outcome.RowErrors })
        };
    }
}
