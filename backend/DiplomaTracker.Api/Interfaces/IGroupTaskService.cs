using DiplomaTracker.Api.DTOs.GroupTasks;

namespace DiplomaTracker.Api.Interfaces;

public interface IGroupTaskService
{
    Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetGroupTasksAsync(string role, Guid userId);
    Task<(GroupTaskResponse? task, string? error)> GetGroupTaskByIdAsync(Guid id, string role, Guid userId);
    Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetTasksForGroupAsync(Guid groupId, string role, Guid userId);
    Task<(GroupTaskResponse? task, string? error)> CreateGroupTaskAsync(CreateGroupTaskRequest request, string role, Guid userId);
    Task<(AssignAllTaskTemplatesResponse? response, string? error)> AssignAllTaskTemplatesAsync(Guid groupId, AssignAllTaskTemplatesRequest request, string role, Guid userId);
    Task<(GroupTaskResponse? task, string? error)> UpdateGroupTaskAsync(Guid id, UpdateGroupTaskRequest request, string role, Guid userId);
    Task<(bool success, string? error)> DeleteGroupTaskAsync(Guid id);
}
