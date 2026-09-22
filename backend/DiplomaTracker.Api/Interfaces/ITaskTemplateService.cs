using DiplomaTracker.Api.DTOs.TaskTemplates;

namespace DiplomaTracker.Api.Interfaces;

public interface ITaskTemplateService
{
    Task<IReadOnlyList<TaskTemplateResponse>> GetTaskTemplatesAsync(Guid? facultyId);
    Task<TaskTemplateResponse?> GetTaskTemplateByIdAsync(Guid id);
    Task<(TaskTemplateResponse? template, string? error)> CreateTaskTemplateAsync(CreateTaskTemplateRequest request, Guid administratorId);
    Task<(TaskTemplateResponse? template, string? error)> UpdateTaskTemplateAsync(Guid id, UpdateTaskTemplateRequest request, Guid administratorId);
    Task<(TaskTemplateResponse? template, string? error)> ActivateTaskTemplateAsync(Guid id, Guid administratorId);
    Task<(TaskTemplateResponse? template, string? error)> DeactivateTaskTemplateAsync(Guid id, Guid administratorId);
    Task<(bool success, string? error)> DeleteTaskTemplateAsync(Guid id, Guid administratorId);
    Task<(IReadOnlyList<TaskTemplateResponse>? templates, string? error)> ReorderAsync(ReorderTaskTemplatesRequest request, Guid administratorId);
}
