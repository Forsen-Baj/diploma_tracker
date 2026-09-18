using DiplomaTracker.Api.DTOs.Groups;

namespace DiplomaTracker.Api.Interfaces;

public interface IGroupService
{
    Task<IReadOnlyList<GroupResponse>> GetGroupsAsync();
    Task<GroupResponse?> GetGroupByIdAsync(Guid id);
    Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request);
    Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request);
    Task<(bool success, string? error)> DeleteGroupAsync(Guid id);
    Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(Guid groupId, string role, Guid userId);
    Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(Guid groupId);
    Task<(GroupReviewerResponse? reviewer, string? error)> AddGroupReviewerAsync(Guid groupId, AddGroupReviewerRequest request);
    Task<(bool success, string? error)> RemoveGroupReviewerAsync(Guid groupId, Guid reviewerId);
    Task<(int? archived, string? error)> ArchiveGroupStudentsAsync(Guid groupId, Guid administratorId);
}
