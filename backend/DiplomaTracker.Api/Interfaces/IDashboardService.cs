using DiplomaTracker.Api.DTOs.Dashboard;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDashboardService
{
    Task<(StudentDashboardResponse? dashboard, string? error)> GetStudentAsync(UserContext user);
    Task<TeacherDashboardResponse> GetTeacherAsync(UserContext user);
    Task<AdminDashboardResponse> GetAdminAsync(UserContext user);
}
