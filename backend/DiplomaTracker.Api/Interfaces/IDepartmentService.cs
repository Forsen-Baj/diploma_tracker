using DiplomaTracker.Api.DTOs.Departments;

namespace DiplomaTracker.Api.Interfaces;

public interface IDepartmentService
{
    Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId);
    Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id);
    Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request, Guid administratorId);
    Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request, Guid administratorId);
    Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id, Guid administratorId);
}
