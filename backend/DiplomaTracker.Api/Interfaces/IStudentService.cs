using DiplomaTracker.Api.DTOs.Students;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentService
{
    Task<IReadOnlyList<StudentResponse>> GetStudentsAsync();
    Task<StudentResponse?> GetStudentByIdAsync(Guid id);
    Task<(StudentResponse? student, string? error)> CreateStudentAsync(CreateStudentRequest request);
    Task<(StudentResponse? student, string? error)> UpdateStudentAsync(Guid id, UpdateStudentRequest request);
    Task<(StudentResponse? student, string? error)> AssignGroupAsync(Guid id, Guid groupId);
    Task<(StudentResponse? student, string? error)> AssignSupervisorAsync(Guid id, Guid supervisorId);
    Task<(bool success, string? error)> DeactivateStudentAsync(Guid id);
    Task<(bool success, string? error)> ResetAccessAsync(Guid id);
}
