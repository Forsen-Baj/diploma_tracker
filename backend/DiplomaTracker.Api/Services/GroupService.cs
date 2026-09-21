using System.Linq.Expressions;
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
    private readonly IAccessScope _accessScope;
    private readonly IArchiveService _archive;

    public GroupService(AppDbContext dbContext, ILogger<GroupService> logger, IAccessScope accessScope, IArchiveService archive)
    {
        _dbContext = dbContext;
        _logger = logger;
        _accessScope = accessScope;
        _archive = archive;
    }

    /// Phase 8 §8: the API returns exactly the columns it sends. This used to materialise a
    /// Group with its Department and Faculty and map afterwards.
    private static readonly Expression<Func<Group, GroupResponse>> GroupProjection = g => new GroupResponse
    {
        Id = g.Id,
        DepartmentId = g.DepartmentId,
        DepartmentName = g.Department.Name,
        FacultyId = g.Department.FacultyId,
        FacultyName = g.Department.Faculty.Name,
        Code = g.Code,
        Description = g.Description,
        AcademicYear = g.AcademicYear,
        CreatedAt = g.CreatedAt,
        UpdatedAt = g.UpdatedAt
    };

    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync(UserContext user)
    {
        return await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .OrderBy(g => g.Code)
            .ThenBy(g => g.AcademicYear)
            .Select(GroupProjection)
            .ToListAsync();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(UserContext user, Guid id)
    {
        return await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .Where(g => g.Id == id)
            .Select(GroupProjection)
            .FirstOrDefaultAsync();
    }

    public async Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request, Guid administratorId)
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Group", group.Id);
        return (MapGroup(group), null);
    }

    public async Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request, Guid administratorId)
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Group", group.Id);
        return (MapGroup(group), null);
    }

    public async Task<(bool success, string? error)> DeleteGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id, cancellationToken);
        if (group is null)
        {
            return (false, GroupErrors.NotFound);
        }

        // Phase 8 §4.7: an ACTIVE student still blocks deletion. Archived ones do not - their
        // work and their record go to the archive, and the empty accounts go with the group.
        var hasActiveStudents = await _dbContext.StudentProfiles
            .AnyAsync(s => s.GroupId == id && s.ArchivedAt == null, cancellationToken);
        if (hasActiveStudents)
        {
            return (false, GroupErrors.HasStudents);
        }

        var groupCode = group.Code;

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        // Archive BEFORE anything is deleted: a failure here leaves the group intact.
        var archivedFileCount = await _archive.ArchiveGroupAsync(id, cancellationToken);

        var profiles = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .Where(p => p.GroupId == id)
            .ToListAsync(cancellationToken);

        var heldTopicIds = profiles.Where(p => p.TopicId is not null).Select(p => p.TopicId!.Value).ToList();

        // Both links are Restrict, so they are cleared and saved before the profiles go.
        foreach (var profile in profiles)
        {
            profile.TopicId = null;
            profile.SupervisorId = null;
        }
        await _dbContext.SaveChangesAsync(cancellationToken);

        var heldTopics = await _dbContext.Topics
            .Where(t => heldTopicIds.Contains(t.Id))
            .ToListAsync(cancellationToken);

        foreach (var topic in heldTopics)
        {
            if (topic.Origin == TopicOrigin.StudentProposal)
            {
                // A proposal exists only for the student who proposed it.
                _dbContext.Topics.Remove(topic);
            }
            else
            {
                topic.Status = TopicStatus.Available;
                topic.UpdatedAt = DateTime.UtcNow;
            }
        }

        // Deleting the user cascades to the profile, its reservations and its student tasks;
        // student tasks cascade to submissions and submission files. The group's own cascade
        // takes its reviewers, group tasks and template links.
        _dbContext.Users.RemoveRange(profiles.Select(p => p.User));
        _dbContext.Groups.Remove(group);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            await transaction.RollbackAsync(cancellationToken);
            return (false, GroupErrors.HasStudents);
        }

        await transaction.CommitAsync(cancellationToken);

        SecurityLog.GroupDeleted(_logger, administratorId, id, groupCode, archivedFileCount, profiles.Count);
        return (true, null);
    }

    public async Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(UserContext user, Guid groupId)
    {
        if (!await _accessScope.CanSeeGroupAsync(user, groupId))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Group", groupId);
            return (null, GroupErrors.NotFound);
        }

        var groupCode = await _dbContext.Groups
            .Where(g => g.Id == groupId)
            .Select(g => g.Code)
            .FirstAsync();

        var students = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Where(s => s.GroupId == groupId && s.User.Role == "Student" && s.ArchivedAt == null)
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .Select(s => new GroupStudentResponse
            {
                StudentProfileId = s.Id,
                UserId = s.UserId,
                GroupCode = groupCode,
                FirstName = s.User.FirstName,
                LastName = s.User.LastName,
                Email = s.User.Email,
                StudentNumber = s.StudentNumber,
                IsActive = s.User.IsActive,
                IsClaimed = s.User.PasswordHash != null,
                TopicTitle = s.Topic != null ? s.Topic.Title : null,
                SupervisorId = s.SupervisorId,
                SupervisorFirstName = s.Supervisor != null ? s.Supervisor.FirstName : null,
                SupervisorLastName = s.Supervisor != null ? s.Supervisor.LastName : null,
                SupervisorEmail = s.Supervisor != null ? s.Supervisor.Email : null,
                CreatedAt = s.CreatedAt,
                UpdatedAt = s.UpdatedAt
            })
            .ToListAsync();

        return (students, null);
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
        await _archive.ArchiveStudentsAsync(archivedIds, CancellationToken.None);

        SecurityLog.StudentsArchived(_logger, administratorId, archivedIds.Count, archivedIds);

        return (archivedIds.Count, null);
    }

    public async Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(UserContext user, Guid groupId)
    {
        if (!await _accessScope.CanSeeGroupAsync(user, groupId))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Group", groupId);
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

    public async Task<(GroupReviewerResponse? reviewer, string? error)> AddGroupReviewerAsync(Guid groupId, AddGroupReviewerRequest request, Guid administratorId)
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
        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Group", groupId);
        return (MapReviewer(assignment), null);
    }

    public async Task<(bool success, string? error)> RemoveGroupReviewerAsync(Guid groupId, Guid reviewerId, Guid administratorId)
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
        SecurityLog.AdministratorAction(_logger, administratorId, "Deleted", "Group", groupId);
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
}
