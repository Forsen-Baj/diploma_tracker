using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IAccessScope
{
    IQueryable<Group> VisibleGroups(UserContext user);
    Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId);
    IQueryable<StudentProfile> ReviewableStudents(UserContext user);
    Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId);

    /// Design 2026-09-24 §3.4: who may open one student step. Today's rule (the student's
    /// supervisor, a reviewer of their group, an administrator), or an extra seat on that very step.
    /// An extra seat grants nothing else - not the group, not the student's other steps.
    Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId);
}
