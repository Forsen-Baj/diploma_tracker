using DiplomaTracker.Api.DTOs.Admins;

namespace DiplomaTracker.Api.Interfaces;

public interface IAdminService
{
    Task<IReadOnlyList<AdminResponse>> GetAdminsAsync();
    Task<AdminResponse?> GetAdminByIdAsync(Guid id);
    Task<(AdminResponse? admin, string? error)> CreateAdminAsync(CreateAdminRequest request, Guid administratorId);
    Task<(AdminResponse? admin, string? error)> UpdateAdminAsync(Guid id, UpdateAdminRequest request);
    Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId);
    Task<(bool success, string? error)> DeactivateAdminAsync(Guid id, Guid administratorId);
    Task<(bool success, string? error)> ActivateAdminAsync(Guid id, Guid administratorId);
}
