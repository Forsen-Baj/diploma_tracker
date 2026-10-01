using DiplomaTracker.Api.DTOs.Staff;

namespace DiplomaTracker.Api.Interfaces;

public interface IStaffService
{
    Task<IReadOnlyList<StaffResponse>> GetStaffAsync(StaffListQuery query);
    Task<StaffResponse?> GetStaffMemberAsync(Guid id);
    Task<(StaffResponse? staff, string? error)> CreateStaffAsync(CreateStaffRequest request, Guid administratorId);
    Task<(StaffResponse? staff, string? error)> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid administratorId);
    Task<(bool success, string? error)> DeactivateStaffAsync(Guid id, Guid administratorId);
    Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId);
    Task<IReadOnlyList<StaffOptionResponse>> SearchOptionsAsync(StaffOptionsQuery query);
    Task<(RoleAssignmentResponse? assignment, string? error)> AddAssignmentAsync(Guid staffId, AddRoleAssignmentRequest request, Guid administratorId);
    Task<(bool success, string? error, IReadOnlyList<RoleAssignmentBlocker>? blockers)> RemoveAssignmentAsync(Guid staffId, Guid assignmentId, Guid administratorId);
}
