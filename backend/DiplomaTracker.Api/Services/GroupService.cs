using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class GroupService : IGroupService
{
    private readonly AppDbContext _dbContext;

    public GroupService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync()
    {
        var groups = await _dbContext.Groups
            .OrderBy(g => g.Name)
            .ThenBy(g => g.AcademicYear)
            .ToListAsync();

        return groups.Select(MapGroup).ToList();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(Guid id)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        return group is null ? null : MapGroup(group);
    }

    public async Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request)
    {
        var normalizedName = request.Name.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        var exists = await _dbContext.Groups.AnyAsync(g => g.Name == normalizedName && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, "Group with the same name and academic year already exists.");
        }

        var now = DateTime.UtcNow;
        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = normalizedName,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            AcademicYear = normalizedAcademicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Groups.Add(group);
        await _dbContext.SaveChangesAsync();

        return (MapGroup(group), null);
    }

    public async Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (null, "Group not found.");
        }

        var normalizedName = request.Name.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        var exists = await _dbContext.Groups.AnyAsync(g => g.Id != id && g.Name == normalizedName && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, "Group with the same name and academic year already exists.");
        }

        group.Name = normalizedName;
        group.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        group.AcademicYear = normalizedAcademicYear;
        group.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return (MapGroup(group), null);
    }

    public async Task<(bool success, string? error)> DeleteGroupAsync(Guid id)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (false, "Group not found.");
        }

        var hasAssignedStudents = await _dbContext.StudentProfiles.AnyAsync(s => s.GroupId == id);
        if (hasAssignedStudents)
        {
            return (false, "Cannot delete group because students are assigned.");
        }

        _dbContext.Groups.Remove(group);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(Guid groupId, string role, Guid userId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, "Group not found.");
        }

        if (role == "Teacher")
        {
            var isReviewer = await _dbContext.GroupReviewers.AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == userId);
            if (!isReviewer)
            {
                return (null, "Forbidden.");
            }
        }

        var students = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Include(s => s.Supervisor)
            .Where(s => s.GroupId == groupId && s.User.Role == "Student")
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return (students.Select(MapGroupStudent).ToList(), null);
    }

    public async Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(Guid groupId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return null;
        }

        var reviewers = await _dbContext.GroupReviewers
            .Include(gr => gr.Reviewer)
            .Where(gr => gr.GroupId == groupId)
            .OrderBy(gr => gr.Reviewer.LastName)
            .ThenBy(gr => gr.Reviewer.FirstName)
            .ToListAsync();

        return reviewers.Select(MapReviewer).ToList();
    }

    public async Task<(GroupReviewerResponse? reviewer, string? error)> AddGroupReviewerAsync(Guid groupId, AddGroupReviewerRequest request)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, "Group not found.");
        }

        var reviewer = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == request.ReviewerId);
        if (reviewer is null)
        {
            return (null, "Reviewer not found.");
        }

        if (reviewer.Role != "Teacher")
        {
            return (null, "Reviewer must be a teacher.");
        }

        if (!reviewer.IsActive)
        {
            return (null, "Reviewer must be active.");
        }

        var alreadyAssigned = await _dbContext.GroupReviewers
            .AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == request.ReviewerId);
        if (alreadyAssigned)
        {
            return (null, "Reviewer is already assigned to this group.");
        }

        var assignment = new GroupReviewer
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            ReviewerId = request.ReviewerId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.GroupReviewers.Add(assignment);
        await _dbContext.SaveChangesAsync();

        assignment.Reviewer = reviewer;
        return (MapReviewer(assignment), null);
    }

    public async Task<(bool success, string? error)> RemoveGroupReviewerAsync(Guid groupId, Guid reviewerId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (false, "Group not found.");
        }

        var assignment = await _dbContext.GroupReviewers
            .FirstOrDefaultAsync(gr => gr.GroupId == groupId && gr.ReviewerId == reviewerId);
        if (assignment is null)
        {
            return (false, "Reviewer assignment not found.");
        }

        _dbContext.GroupReviewers.Remove(assignment);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private static GroupResponse MapGroup(Group group)
    {
        return new GroupResponse
        {
            Id = group.Id,
            Name = group.Name,
            Description = group.Description,
            AcademicYear = group.AcademicYear,
            CreatedAt = group.CreatedAt,
            UpdatedAt = group.UpdatedAt
        };
    }

    private static GroupReviewerResponse MapReviewer(GroupReviewer groupReviewer)
    {
        return new GroupReviewerResponse
        {
            Id = groupReviewer.Id,
            GroupId = groupReviewer.GroupId,
            ReviewerId = groupReviewer.ReviewerId,
            FirstName = groupReviewer.Reviewer.FirstName,
            LastName = groupReviewer.Reviewer.LastName,
            Email = groupReviewer.Reviewer.Email,
            CreatedAt = groupReviewer.CreatedAt
        };
    }

    private static GroupStudentResponse MapGroupStudent(StudentProfile profile)
    {
        return new GroupStudentResponse
        {
            StudentProfileId = profile.Id,
            UserId = profile.UserId,
            FirstName = profile.User.FirstName,
            LastName = profile.User.LastName,
            Email = profile.User.Email,
            IsActive = profile.User.IsActive,
            DiplomaTopic = profile.DiplomaTopic,
            SupervisorId = profile.SupervisorId,
            SupervisorFirstName = profile.Supervisor?.FirstName,
            SupervisorLastName = profile.Supervisor?.LastName,
            SupervisorEmail = profile.Supervisor?.Email,
            CreatedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        };
    }
}
