using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IGroupService
{
    Task<IReadOnlyList<GroupResponse>> GetGroupsAsync(UserContext user);
    Task<GroupResponse?> GetGroupByIdAsync(UserContext user, Guid id);
    Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request, Guid administratorId);
    Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request, Guid administratorId);
    Task<(bool success, string? error)> DeleteGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken);
    Task<(GroupDeletionPreviewResponse? preview, string? error)> GetDeletionPreviewAsync(Guid groupId, CancellationToken cancellationToken);
    Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(UserContext user, Guid groupId);
    Task<(int? archived, string? error)> ArchiveGroupStudentsAsync(Guid groupId, Guid administratorId);
}
