using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/document-versions")]
[Authorize]
public class DocumentVersionsController : ApiControllerBase
{
    private readonly IDocumentService _documents;

    public DocumentVersionsController(IDocumentService documents)
    {
        _documents = documents;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _documents.OpenVersionAsync(user, id, cancellationToken);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }
}
