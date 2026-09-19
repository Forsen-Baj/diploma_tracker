using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

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
            return _dbContext.Groups.Where(g =>
                g.Reviewers.Any(r => r.ReviewerId == user.UserId)
                || g.Students.Any(s => s.SupervisorId == user.UserId && s.ArchivedAt == null));
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
            return _dbContext.StudentProfiles.Where(s =>
                s.ArchivedAt == null
                && (s.SupervisorId == user.UserId || s.Group.Reviewers.Any(r => r.ReviewerId == user.UserId)));
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId)
    {
        return ReviewableStudents(user).AnyAsync(s => s.Id == studentProfileId);
    }
}
