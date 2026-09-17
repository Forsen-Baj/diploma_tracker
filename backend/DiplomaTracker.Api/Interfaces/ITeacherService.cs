using DiplomaTracker.Api.DTOs.Teachers;

namespace DiplomaTracker.Api.Interfaces;

public interface ITeacherService
{
    Task<IReadOnlyList<TeacherResponse>> GetTeachersAsync();
    Task<TeacherResponse?> GetTeacherByIdAsync(Guid id);
    Task<(TeacherResponse? teacher, string? error)> CreateTeacherAsync(CreateTeacherRequest request);
    Task<(TeacherResponse? teacher, string? error)> UpdateTeacherAsync(Guid id, UpdateTeacherRequest request);
    Task<(bool success, string? error)> DeactivateTeacherAsync(Guid id);
    Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId);
}
