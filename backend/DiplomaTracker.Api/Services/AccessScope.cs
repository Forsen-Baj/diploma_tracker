using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27, phase 12 §4.1-§4.2. What a caller sees follows the role they act in. A
/// student's supervisor (acting as teacher) and the manager of their topic's direction (acting as
/// direction manager) open the student in full. An extra reviewer (acting as teacher) and a
/// standards controller open only the steps they sit on. A staff member's groups are the groups of
/// the students they work with; nothing grants a whole group.
public class AccessScope : IAccessScope
{
    private readonly AppDbContext _dbContext;

    public AccessScope(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public IQueryable<Group> VisibleGroups(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.Groups;
        }

        var working = ReviewOverviewStudents(user);
        return _dbContext.Groups.Where(g => working.Any(s => s.GroupId == g.Id));
    }

    public Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId)
    {
        return VisibleGroups(user).AnyAsync(g => g.Id == groupId);
    }

    public IQueryable<StudentProfile> ReviewableStudents(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.StudentProfiles;
        }

        var me = user.UserId;

        if (user.IsTeacher)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null && s.SupervisorId == me);
        }

        if (user.IsDirectionManager)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && s.Topic != null && s.Topic.Direction.ManagerId == me);
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId)
    {
        return ReviewableStudents(user).AnyAsync(s => s.Id == studentProfileId);
    }

    public IQueryable<StudentProfile> ReviewOverviewStudents(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null);
        }

        var me = user.UserId;

        if (user.IsTeacher)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && (s.SupervisorId == me || s.StudentTasks.Any(t => t.Reviewers.Any(r => r.ReviewerId == me))));
        }

        if (user.IsDirectionManager)
        {
            return ReviewableStudents(user);
        }

        if (user.IsStandardsController)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && s.StudentTasks.Any(t => t.GroupTask.StandardsControllerId == me && t.GroupTask.GroupId == s.GroupId));
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId)
    {
        var task = _dbContext.StudentTasks.Where(t => t.Id == studentTaskId);

        if (user.IsAdmin)
        {
            return task.AnyAsync();
        }

        var me = user.UserId;
        var reviewable = ReviewableStudents(user).Select(s => s.Id);

        if (user.IsTeacher)
        {
            return task.AnyAsync(t => reviewable.Contains(t.StudentProfileId)
                || (t.StudentProfile.ArchivedAt == null && t.Reviewers.Any(r => r.ReviewerId == me)));
        }

        if (user.IsDirectionManager)
        {
            return task.AnyAsync(t => reviewable.Contains(t.StudentProfileId));
        }

        if (user.IsStandardsController)
        {
            return task.AnyAsync(t => t.StudentProfile.ArchivedAt == null && t.GroupTask.StandardsControllerId == me);
        }

        return Task.FromResult(false);
    }
}
