using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDirectionService
{
    Task<(IReadOnlyList<DirectionResponse>? directions, string? error)> GetDirectionsAsync(UserContext user, DirectionQuery query);
    Task<(DirectionResponse? direction, string? error)> GetDirectionAsync(UserContext user, Guid id);
    Task<(DirectionResponse? direction, string? error)> CreateDirectionAsync(UserContext user, CreateDirectionRequest request);
    Task<(DirectionResponse? direction, string? error)> UpdateDirectionAsync(UserContext user, Guid id, UpdateDirectionRequest request);
    Task<(bool success, string? error)> DeleteDirectionAsync(UserContext user, Guid id);
}
