using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IAccessScope
{
    IQueryable<Group> VisibleGroups(UserContext user);
    Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId);
    IQueryable<StudentProfile> ReviewableStudents(UserContext user);
    Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId);
}
