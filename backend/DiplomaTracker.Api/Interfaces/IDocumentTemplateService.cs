using DiplomaTracker.Api.DTOs.Templates;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDocumentTemplateService
{
    Task<IReadOnlyList<TemplateResponse>> GetTemplatesAsync(UserContext user);
    Task<(TemplateResponse? template, string? error)> GetTemplateAsync(UserContext user, Guid id);
    Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> CreateAsync(UserContext user, TemplateForm form, CancellationToken cancellationToken);
    Task<(TemplateResponse? template, string? error)> UpdateAsync(UserContext user, Guid id, UpdateTemplateRequest request);
    Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> ReplaceFileAsync(UserContext user, Guid id, IFormFile? file, CancellationToken cancellationToken);
    Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id, CancellationToken cancellationToken);
    Task<(TemplateSource? source, string? error)> OpenSourceAsync(UserContext user, Guid id, CancellationToken cancellationToken);
    Task<(GeneratedDocument? document, string? error)> GenerateAsync(UserContext user, Guid id, GenerateDocumentRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<EligibleStudent>> GetEligibleStudentsAsync(UserContext user);
    IReadOnlyList<MarkerInfo> GetMarkers();
}
