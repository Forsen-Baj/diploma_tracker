using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §6.2: a direction manager is treated as a supervisor for the students whose
/// topic is in their direction; a standards controller as an extra reviewer on the steps they
/// control, and nothing more.
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.Groups.Where(g =>
                g.Reviewers.Any(r => r.ReviewerId == me)
                || g.Students.Any(s => s.ArchivedAt == null
                    && (s.SupervisorId == me || (s.Topic != null && s.Topic.Direction.ManagerId == me))));
        }

        return _dbContext.Groups.Where(_ => false);
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.StudentProfiles.Where(s =>
                s.ArchivedAt == null
                && (s.SupervisorId == me
                    || (s.Topic != null && s.Topic.Direction.ManagerId == me)
                    || s.Group.Reviewers.Any(r => r.ReviewerId == me)));
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.StudentProfiles.Where(s =>
                s.ArchivedAt == null
                && (s.SupervisorId == me
                    || (s.Topic != null && s.Topic.Direction.ManagerId == me)
                    || s.Group.Reviewers.Any(r => r.ReviewerId == me)
                    || s.StudentTasks.Any(t => t.Reviewers.Any(r => r.ReviewerId == me)
                        || (t.GroupTask.StandardsControllerId == me && t.GroupTask.GroupId == s.GroupId))));
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

        if (!user.IsTeacher)
        {
            return Task.FromResult(false);
        }

        var me = user.UserId;
        var reviewable = ReviewableStudents(user).Select(s => s.Id);
        return task.AnyAsync(t =>
            reviewable.Contains(t.StudentProfileId)
            || (t.StudentProfile.ArchivedAt == null
                && (t.Reviewers.Any(r => r.ReviewerId == me) || t.GroupTask.StandardsControllerId == me)));
    }
}
