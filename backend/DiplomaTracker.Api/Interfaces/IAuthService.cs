using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
    Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, string actingRole);
    Task<(LoginResponse? result, string? error)> SwitchActingRoleAsync(Guid userId, string role);
    Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request);
    Task<(bool success, string? error)> ChangePasswordAsync(Guid userId, ChangePasswordRequest request);
}
