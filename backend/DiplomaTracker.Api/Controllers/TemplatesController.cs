using DiplomaTracker.Api.DTOs.Templates;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/templates")]
[Authorize]
public class TemplatesController : ApiControllerBase
{
    private const long MaxTemplateRequestBytes = 12L * 1024 * 1024;
    private const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private readonly IDocumentTemplateService _templates;

    public TemplatesController(IDocumentTemplateService templates)
    {
        _templates = templates;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return TryGetCurrentUser(out var user)
            ? Ok(await _templates.GetTemplatesAsync(user))
            : ErrorResult(CommonErrors.Forbidden);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("markers")]
    public IActionResult Markers() => Ok(_templates.GetMarkers());

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("students")]
    public async Task<IActionResult> Students()
    {
        return TryGetCurrentUser(out var user)
            ? Ok(await _templates.GetEligibleStudentsAsync(user))
            : ErrorResult(CommonErrors.Forbidden);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error) = await _templates.GetTemplateAsync(user, id);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    [RequestSizeLimit(MaxTemplateRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxTemplateRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Create([FromForm] TemplateForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error, unknown) = await _templates.CreateAsync(user, form, cancellationToken);
        return template is null
            ? ErrorResult(error, unknown)
            : CreatedAtAction(nameof(Get), new { id = template.Id }, template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTemplateRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error) = await _templates.UpdateAsync(user, id, request);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}/file")]
    [RequestSizeLimit(MaxTemplateRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxTemplateRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> ReplaceFile(Guid id, IFormFile? file, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error, unknown) = await _templates.ReplaceFileAsync(user, id, file, cancellationToken);
        return template is null ? ErrorResult(error, unknown) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _templates.DeleteAsync(user, id, cancellationToken);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("{id:guid}/source")]
    public async Task<IActionResult> Source(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (source, error) = await _templates.OpenSourceAsync(user, id, cancellationToken);
        if (source is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(source.Content, DocxContentType, source.FileName);
    }

    [HttpPost("{id:guid}/generate")]
    public async Task<IActionResult> Generate(Guid id, [FromBody] GenerateDocumentRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (document, error) = await _templates.GenerateAsync(user, id, request, cancellationToken);
        if (document is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(document.Content, DocxContentType, document.FileName);
    }
}
