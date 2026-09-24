using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.DTOs.Documents;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/documents")]
[Authorize]
public class DocumentsController : ApiControllerBase
{
    // One file of at most 20 MB plus a few short fields.
    private const long MaxDocumentRequestBytes = SubmissionFileRules.MaxFileBytes + 1024 * 1024;

    private readonly IDocumentService _documents;

    public DocumentsController(IDocumentService documents)
    {
        _documents = documents;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? box)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (items, error) = await _documents.ListAsync(user, box);
        return items is null ? ErrorResult(error) : Ok(items);
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts()
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        return Ok(await _documents.CountsAsync(user));
    }

    [HttpGet("recipients")]
    public async Task<IActionResult> Recipients([FromQuery] string? search)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        return Ok(await _documents.SearchRecipientsAsync(user, search));
    }

    [HttpPost]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Create([FromForm] CreateDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.CreateAsync(user, form.Title!, form.Description, form.File, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.GetAsync(user, id);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.UpdateAsync(user, id, request.Title!, request.Description, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery][Required] int? expectedSequence)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (success, error) = await _documents.DeleteAsync(user, id, expectedSequence!.Value);
        return success ? NoContent() : ErrorResult(error);
    }

    [HttpPost("{id:guid}/versions")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> AddVersion(Guid id, [FromForm] AddVersionForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.AddVersionAsync(user, id, form.File, form.Comment, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/send")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.SendAsync(user, id, request.RecipientId!.Value, request.Purpose!, request.Comment, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/forward")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Forward(Guid id, [FromForm] ForwardDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.ForwardAsync(user, id, form.RecipientId!.Value, form.Purpose!, form.Comment, form.File, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.RejectAsync(user, id, request.TargetId, request.Comment!, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/done")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Done(Guid id, [FromForm] DoneDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.DoneAsync(user, id, form.Comment, form.File, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/recall")]
    public async Task<IActionResult> Recall(Guid id, [FromBody] RecallDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.RecallAsync(user, id, request.Comment, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }
}
