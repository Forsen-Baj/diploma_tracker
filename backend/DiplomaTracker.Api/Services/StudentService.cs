using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class StudentService : IStudentService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IReservationService _reservationService;
    private readonly ILogger<StudentService> _logger;

    public StudentService(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        IReservationService reservationService,
        ILogger<StudentService> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _reservationService = reservationService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<StudentResponse>> GetStudentsAsync(bool archived)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(s => s.User.Role == "Student" && (archived ? s.ArchivedAt != null : s.ArchivedAt == null))
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .Select(ProjectStudent)
            .ToListAsync();
    }

    public async Task<StudentResponse?> GetStudentByIdAsync(Guid id)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(s => s.Id == id && s.User.Role == "Student")
            .Select(ProjectStudent)
            .FirstOrDefaultAsync();
    }

    public async Task<(StudentResponse? student, string? error)> CreateStudentAsync(CreateStudentRequest request)
    {
        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        if (await _dbContext.Users.AnyAsync(u => u.Email == email))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumber == studentNumber))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }

        var password = string.IsNullOrEmpty(request.Password) ? null : request.Password;
        if (password is not null && !PasswordPolicy.IsSatisfiedBy(password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var assignment = await ResolveAssignmentAsync(request.GroupId, request.SupervisorId);
        if (assignment.error is not null)
        {
            return (null, assignment.error);
        }

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Patronymic = IdentityNormalizer.Optional(request.Patronymic),
            Email = email,
            PasswordHash = password is null ? null : _passwordHasher.HashPassword(password),
            Role = "Student",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            StudentNumber = studentNumber,
            GroupId = assignment.group!.Id,
            SupervisorId = assignment.supervisor?.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        _dbContext.StudentProfiles.Add(profile);

        await LateJoinerTaskAssigner.AssignMissingGroupTasksAsync(_dbContext, [(profile.Id, profile.GroupId)]);

        var conflict = await SaveWithConflictMappingAsync(email, studentNumber, user.Id);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        profile.User = user;
        profile.Group = assignment.group;
        profile.Supervisor = assignment.supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> UpdateStudentAsync(Guid id, UpdateStudentRequest request)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        if (profile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        if (await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != profile.UserId))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumber == studentNumber && p.Id != profile.Id))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }

        var assignment = await ResolveAssignmentAsync(request.GroupId, request.SupervisorId, profile.SupervisorId);
        if (assignment.error is not null)
        {
            return (null, assignment.error);
        }

        // A student who holds a topic gets their supervisor from it (TopicService.UpdateTopicAsync
        // moves both together); the student form is not a second, competing way to set it, or the
        // two could disagree about who supervises the work.
        if (profile.TopicId is not null && assignment.supervisor?.Id != profile.SupervisorId)
        {
            return (null, OnboardingErrors.SupervisorLockedByTopic);
        }

        var groupChanged = profile.GroupId != assignment.group!.Id;

        var now = DateTime.UtcNow;
        profile.User.FirstName = request.FirstName.Trim();
        profile.User.LastName = request.LastName.Trim();
        profile.User.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        profile.User.Email = email;
        profile.User.UpdatedAt = now;
        profile.StudentNumber = studentNumber;
        profile.GroupId = assignment.group.Id;
        profile.SupervisorId = assignment.supervisor?.Id;
        profile.UpdatedAt = now;

        if (groupChanged)
        {
            await LateJoinerTaskAssigner.AssignMissingGroupTasksAsync(_dbContext, [(profile.Id, profile.GroupId)]);
        }

        var conflict = await SaveWithConflictMappingAsync(email, studentNumber, profile.UserId);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        profile.Group = assignment.group;
        profile.Supervisor = assignment.supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> AssignGroupAsync(Guid id, Guid groupId)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        if (profile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, OnboardingErrors.GroupNotFound);
        }

        var groupChanged = profile.GroupId != groupId;

        profile.GroupId = groupId;
        profile.UpdatedAt = DateTime.UtcNow;

        if (groupChanged)
        {
            await LateJoinerTaskAssigner.AssignMissingGroupTasksAsync(_dbContext, [(profile.Id, groupId)]);
        }

        await _dbContext.SaveChangesAsync();

        profile.Group = group;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> AssignSupervisorAsync(Guid id, Guid supervisorId)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        if (profile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId);
        if (supervisor is null)
        {
            return (null, OnboardingErrors.SupervisorNotFound);
        }

        if (supervisor.Role != "Teacher" || !supervisor.IsActive)
        {
            return (null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }

        // Same rule as UpdateStudentAsync: a student holding a topic gets their supervisor from
        // it, so this endpoint cannot move it out from under the topic.
        if (profile.TopicId is not null && supervisorId != profile.SupervisorId)
        {
            return (null, OnboardingErrors.SupervisorLockedByTopic);
        }

        profile.SupervisorId = supervisorId;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        profile.Supervisor = supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(bool success, string? error)> ResetAccessAsync(Guid id, Guid administratorId)
    {
        var profile = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");

        if (profile is null)
        {
            return (false, OnboardingErrors.StudentNotFound);
        }

        if (profile.ArchivedAt is not null)
        {
            return (false, OnboardingErrors.StudentArchived);
        }

        profile.User.PasswordHash = null;
        profile.User.ClaimReopened = true;
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation(
            "Access reset: StudentUserId={StudentUserId}, AdministratorId={AdministratorId}",
            profile.UserId,
            administratorId);

        return (true, null);
    }

    public async Task<(int archived, string? error)> ArchiveStudentsAsync(IReadOnlyList<Guid> studentIds, Guid administratorId)
    {
        var uniqueIds = studentIds.Distinct().ToList();
        var profiles = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Where(s => uniqueIds.Contains(s.Id) && s.User.Role == "Student")
            .ToListAsync();

        if (profiles.Count != uniqueIds.Count)
        {
            return (0, OnboardingErrors.StudentNotFound);
        }

        var now = DateTime.UtcNow;
        var archivedIds = StudentArchiver.Archive(profiles, now);

        // An archived student's live reservations must not linger: a topic's supervisor would
        // otherwise still see and could approve a pending request, or hold a topic permanently
        // approved for an account that can no longer act on it.
        foreach (var archivedId in archivedIds)
        {
            await _reservationService.SettleReservationsForArchiveAsync(archivedId, now);
        }

        await _dbContext.SaveChangesAsync();

        _logger.LogInformation(
            "Students archived: Count={Count}, StudentProfileIds={StudentProfileIds}, AdministratorId={AdministratorId}",
            archivedIds.Count,
            archivedIds,
            administratorId);

        return (archivedIds.Count, null);
    }

    public async Task<(int restored, string? error)> RestoreStudentsAsync(IReadOnlyList<Guid> studentIds, Guid administratorId)
    {
        var uniqueIds = studentIds.Distinct().ToList();
        var profiles = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Where(s => uniqueIds.Contains(s.Id) && s.User.Role == "Student")
            .ToListAsync();

        if (profiles.Count != uniqueIds.Count)
        {
            return (0, OnboardingErrors.StudentNotFound);
        }

        var toRestore = profiles.Where(p => p.ArchivedAt is not null).ToList();
        if (toRestore.Count > 0)
        {
            await LateJoinerTaskAssigner.AssignMissingGroupTasksAsync(
                _dbContext,
                toRestore.Select(p => (p.Id, p.GroupId)).ToList());
        }

        var now = DateTime.UtcNow;
        var restoredIds = StudentArchiver.Restore(toRestore, now);
        await _dbContext.SaveChangesAsync();

        _logger.LogInformation(
            "Students restored: Count={Count}, StudentProfileIds={StudentProfileIds}, AdministratorId={AdministratorId}",
            restoredIds.Count,
            restoredIds,
            administratorId);

        return (restoredIds.Count, null);
    }

    private async Task<StudentProfile?> LoadStudentProfileAsync(Guid id)
    {
        return await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Include(s => s.Group)
            .Include(s => s.Supervisor)
            .Include(s => s.Topic)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");
    }

    private async Task<(Group? group, AppUser? supervisor, string? error)> ResolveAssignmentAsync(
        Guid groupId,
        Guid? supervisorId,
        Guid? currentSupervisorId = null)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, null, OnboardingErrors.GroupNotFound);
        }

        if (supervisorId is null)
        {
            return (group, null, null);
        }

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId.Value);
        if (supervisor is null)
        {
            return (null, null, OnboardingErrors.SupervisorNotFound);
        }

        var isUnchangedSupervisor = currentSupervisorId is not null && supervisorId == currentSupervisorId;
        if (supervisor.Role != "Teacher" || (!supervisor.IsActive && !isUnchangedSupervisor))
        {
            return (null, null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }

        return (group, supervisor, null);
    }

    private async Task<string?> SaveWithConflictMappingAsync(string email, string studentNumber, Guid userId)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            var emailTaken = await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != userId);
            return emailTaken ? OnboardingErrors.EmailTaken : OnboardingErrors.StudentNumberTaken;
        }
    }

    private static readonly Expression<Func<StudentProfile, StudentResponse>> ProjectStudent = profile => new StudentResponse
    {
        Id = profile.Id,
        UserId = profile.UserId,
        FirstName = profile.User.FirstName,
        LastName = profile.User.LastName,
        Patronymic = profile.User.Patronymic,
        Email = profile.User.Email,
        StudentNumber = profile.StudentNumber,
        Role = profile.User.Role,
        IsActive = profile.User.IsActive,
        IsClaimed = profile.User.PasswordHash != null,
        ClaimReopened = profile.User.ClaimReopened,
        ArchivedAt = profile.ArchivedAt,
        TopicId = profile.TopicId,
        TopicTitle = profile.Topic != null ? profile.Topic.Title : null,
        GroupId = profile.GroupId,
        GroupCode = profile.Group != null ? profile.Group.Code : null,
        SupervisorId = profile.SupervisorId,
        SupervisorFirstName = profile.Supervisor != null ? profile.Supervisor.FirstName : null,
        SupervisorLastName = profile.Supervisor != null ? profile.Supervisor.LastName : null,
        SupervisorEmail = profile.Supervisor != null ? profile.Supervisor.Email : null,
        CreatedAt = profile.CreatedAt,
        UpdatedAt = profile.UpdatedAt
    };

    private static StudentResponse MapStudent(StudentProfile profile) => ProjectStudent.Compile()(profile);
}
