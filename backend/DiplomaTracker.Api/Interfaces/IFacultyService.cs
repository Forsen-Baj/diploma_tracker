using DiplomaTracker.Api.DTOs.Faculties;

namespace DiplomaTracker.Api.Interfaces;

public interface IFacultyService
{
    Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync();
    Task<FacultyResponse?> GetFacultyByIdAsync(Guid id);
    Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request, Guid administratorId);
    Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request, Guid administratorId);
    Task<(bool success, string? error)> DeleteFacultyAsync(Guid id, Guid administratorId);
}
