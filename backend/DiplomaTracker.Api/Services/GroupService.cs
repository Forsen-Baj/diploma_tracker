using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class GroupService : IGroupService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<GroupService> _logger;

    public GroupService(AppDbContext dbContext, ILogger<GroupService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync()
    {
        var groups = await _dbContext.Groups
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .OrderBy(g => g.Code)
            .ThenBy(g => g.AcademicYear)
            .ToListAsync();

        return groups.Select(MapGroup).ToList();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(Guid id)
    {
        var group = await _dbContext.Groups
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .FirstOrDefaultAsync(g => g.Id == id);

        return group is null ? null : MapGroup(group);
    }

    public async Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request)
    {
        var department = await FindDepartmentAsync(request.DepartmentId);
        if (department is null)
        {
            return (null, GroupErrors.DepartmentNotFound);
        }

        var normalizedCode = request.Code.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        if (string.IsNullOrWhiteSpace(normalizedCode) || string.IsNullOrWhiteSpace(normalizedAcademicYear))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var exists = await _dbContext.Groups.AnyAsync(g => g.Code == normalizedCode && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, GroupErrors.CodeTaken);
        }

        var now = DateTime.UtcNow;
        var group = new Group
        {
            Id = Guid.NewGuid(),
            DepartmentId = department.Id,
            Department = department,
            Code = normalizedCode,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            AcademicYear = normalizedAcademicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Groups.Add(group);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, GroupErrors.CodeTaken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, GroupErrors.DepartmentNotFound);
        }

        return (MapGroup(group), null);
    }

    public async Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (null, GroupErrors.NotFound);
        }

        var department = await FindDepartmentAsync(request.DepartmentId);
        if (department is null)
        {
            return (null, GroupErrors.DepartmentNotFound);
        }

        var normalizedCode = request.Code.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        if (string.IsNullOrWhiteSpace(normalizedCode) || string.IsNullOrWhiteSpace(normalizedAcademicYear))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var exists = await _dbContext.Groups.AnyAsync(g => g.Id != id && g.Code == normalizedCode && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, GroupErrors.CodeTaken);
        }

        group.DepartmentId = department.Id;
        group.Department = department;
        group.Code = normalizedCode;
        group.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        group.AcademicYear = normalizedAcademicYear;
        group.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, GroupErrors.CodeTaken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, GroupErrors.DepartmentNotFound);
        }

        return (MapGroup(group), null);
    }

    public async Task<(bool success, string? error)> DeleteGroupAsync(Guid id)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (false, GroupErrors.NotFound);
        }

        var hasAssignedStudents = await _dbContext.StudentProfiles.AnyAsync(s => s.GroupId == id);
        if (hasAssignedStudents)
        {
            return (false, GroupErrors.HasStudents);
        }

        _dbContext.Groups.Remove(group);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (false, GroupErrors.HasStudents);
        }

        return (true, null);
    }

    public async Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(Guid groupId, string role, Guid userId)
    {
        var groupCode = await _dbContext.Groups
            .Where(g => g.Id == groupId)
            .Select(g => (string?)g.Code)
            .FirstOrDefaultAsync();
        if (groupCode is null)
        {
            return (null, GroupErrors.NotFound);
        }

        if (role == "Teacher")
        {
            var isReviewer = await _dbContext.GroupReviewers.AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == userId);
            if (!isReviewer)
            {
                return (null, CommonErrors.Forbidden);
            }
        }

        var students = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(s => s.User)
            .Include(s => s.Supervisor)
            .Include(s => s.Topic)
            .Where(s => s.GroupId == groupId && s.User.Role == "Student" && s.ArchivedAt == null)
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return (students.Select(s => MapGroupStudent(s, groupCode)).ToList(), null);
    }

    public async Task<(int? archived, string? error)> ArchiveGroupStudentsAsync(Guid groupId, Guid administratorId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, GroupErrors.NotFound);
        }

        var profiles = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Where(s => s.GroupId == groupId && s.User.Role == "Student" && s.ArchivedAt == null)
            .ToListAsync();

        var now = DateTime.UtcNow;
        var archivedIds = StudentArchiver.Archive(profiles, now);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation(
            "Group students archived: GroupId={GroupId}, Count={Count}, StudentProfileIds={StudentProfileIds}, AdministratorId={AdministratorId}",
            groupId,
            archivedIds.Count,
            archivedIds,
            administratorId);

        return (archivedIds.Count, null);
    }

    public async Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(Guid groupId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return null;
        }

        var reviewers = await _dbContext.GroupReviewers
            .AsNoTracking()
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
            return (null, GroupErrors.NotFound);
        }

        var reviewer = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == request.ReviewerId);
        if (reviewer is null)
        {
            return (null, GroupErrors.ReviewerNotFound);
        }

        if (reviewer.Role != "Teacher")
        {
            return (null, GroupErrors.ReviewerMustBeActiveTeacher);
        }

        if (!reviewer.IsActive)
        {
            return (null, GroupErrors.ReviewerMustBeActiveTeacher);
        }

        var alreadyAssigned = await _dbContext.GroupReviewers
            .AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == request.ReviewerId);
        if (alreadyAssigned)
        {
            return (null, GroupErrors.ReviewerAlreadyAssigned);
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
            return (false, GroupErrors.NotFound);
        }

        var assignment = await _dbContext.GroupReviewers
            .FirstOrDefaultAsync(gr => gr.GroupId == groupId && gr.ReviewerId == reviewerId);
        if (assignment is null)
        {
            return (false, GroupErrors.ReviewerAssignmentNotFound);
        }

        _dbContext.GroupReviewers.Remove(assignment);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private Task<Department?> FindDepartmentAsync(Guid departmentId)
    {
        return _dbContext.Departments
            .Include(d => d.Faculty)
            .FirstOrDefaultAsync(d => d.Id == departmentId);
    }

    private static GroupResponse MapGroup(Group group) => new()
    {
        Id = group.Id,
        DepartmentId = group.DepartmentId,
        DepartmentName = group.Department.Name,
        FacultyId = group.Department.FacultyId,
        FacultyName = group.Department.Faculty.Name,
        Code = group.Code,
        Description = group.Description,
        AcademicYear = group.AcademicYear,
        CreatedAt = group.CreatedAt,
        UpdatedAt = group.UpdatedAt
    };

    private static GroupReviewerResponse MapReviewer(GroupReviewer groupReviewer) => new()
    {
        Id = groupReviewer.Id,
        GroupId = groupReviewer.GroupId,
        ReviewerId = groupReviewer.ReviewerId,
        FirstName = groupReviewer.Reviewer.FirstName,
        LastName = groupReviewer.Reviewer.LastName,
        Email = groupReviewer.Reviewer.Email,
        CreatedAt = groupReviewer.CreatedAt
    };

    private static GroupStudentResponse MapGroupStudent(StudentProfile profile, string groupCode) => new()
    {
        StudentProfileId = profile.Id,
        UserId = profile.UserId,
        GroupCode = groupCode,
        FirstName = profile.User.FirstName,
        LastName = profile.User.LastName,
        Email = profile.User.Email,
        StudentNumber = profile.StudentNumber,
        IsActive = profile.User.IsActive,
        IsClaimed = profile.User.PasswordHash is not null,
        TopicTitle = profile.Topic?.Title,
        SupervisorId = profile.SupervisorId,
        SupervisorFirstName = profile.Supervisor?.FirstName,
        SupervisorLastName = profile.Supervisor?.LastName,
        SupervisorEmail = profile.Supervisor?.Email,
        CreatedAt = profile.CreatedAt,
        UpdatedAt = profile.UpdatedAt
    };
}
