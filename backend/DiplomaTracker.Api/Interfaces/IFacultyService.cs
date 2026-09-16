using DiplomaTracker.Api.DTOs.Faculties;

namespace DiplomaTracker.Api.Interfaces;

public interface IFacultyService
{
    Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync();
    Task<FacultyResponse?> GetFacultyByIdAsync(Guid id);
    Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request);
    Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request);
    Task<(bool success, string? error)> DeleteFacultyAsync(Guid id);
}
