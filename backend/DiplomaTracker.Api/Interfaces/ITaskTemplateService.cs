using DiplomaTracker.Api.DTOs.TaskTemplates;

namespace DiplomaTracker.Api.Interfaces;

public interface ITaskTemplateService
{
    Task<IReadOnlyList<TaskTemplateResponse>> GetTaskTemplatesAsync(Guid? facultyId);
    Task<TaskTemplateResponse?> GetTaskTemplateByIdAsync(Guid id);
    Task<(TaskTemplateResponse? template, string? error)> CreateTaskTemplateAsync(CreateTaskTemplateRequest request);
    Task<(TaskTemplateResponse? template, string? error)> UpdateTaskTemplateAsync(Guid id, UpdateTaskTemplateRequest request);
    Task<(TaskTemplateResponse? template, string? error)> ActivateTaskTemplateAsync(Guid id);
    Task<(TaskTemplateResponse? template, string? error)> DeactivateTaskTemplateAsync(Guid id);
}
