using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentImportService
{
    Task<StudentImportOutcome> ImportAsync(Guid groupId, IFormFile? file);
}
