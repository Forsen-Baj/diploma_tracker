using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/groups/{groupId:guid}/students/import")]
[Authorize(Roles = "Admin")]
public class StudentImportController : ApiControllerBase
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

        return ErrorResult(outcome.Error, outcome.RowErrors.Count > 0 ? outcome.RowErrors : null);
    }
}
