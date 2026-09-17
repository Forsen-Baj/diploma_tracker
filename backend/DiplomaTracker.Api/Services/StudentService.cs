using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class StudentService : IStudentService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;

    public StudentService(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task<IReadOnlyList<StudentResponse>> GetStudentsAsync()
    {
        var students = await _dbContext.StudentProfiles.AsNoTracking()
            .Include(s => s.User)
            .Include(s => s.Group)
            .Include(s => s.Supervisor)
            .Where(s => s.User.Role == "Student")
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return students.Select(MapStudent).ToList();
    }

    public async Task<StudentResponse?> GetStudentByIdAsync(Guid id)
    {
        var student = await LoadStudentProfileAsync(id);
        return student is null ? null : MapStudent(student);
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
            DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic),
            GroupId = assignment.group!.Id,
            SupervisorId = assignment.supervisor?.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        _dbContext.StudentProfiles.Add(profile);

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

        var now = DateTime.UtcNow;
        profile.User.FirstName = request.FirstName.Trim();
        profile.User.LastName = request.LastName.Trim();
        profile.User.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        profile.User.Email = email;
        profile.User.UpdatedAt = now;
        profile.StudentNumber = studentNumber;
        profile.DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic);
        profile.GroupId = assignment.group!.Id;
        profile.SupervisorId = assignment.supervisor?.Id;
        profile.UpdatedAt = now;

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

        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, OnboardingErrors.GroupNotFound);
        }

        profile.GroupId = groupId;
        profile.UpdatedAt = DateTime.UtcNow;
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

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId);
        if (supervisor is null)
        {
            return (null, OnboardingErrors.SupervisorNotFound);
        }

        if (supervisor.Role != "Teacher" || !supervisor.IsActive)
        {
            return (null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }

        profile.SupervisorId = supervisorId;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        profile.Supervisor = supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(bool success, string? error)> DeactivateStudentAsync(Guid id)
    {
        var profile = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");

        if (profile is null)
        {
            return (false, OnboardingErrors.StudentNotFound);
        }

        profile.User.IsActive = false;
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    public async Task<(bool success, string? error)> ResetAccessAsync(Guid id)
    {
        var profile = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");

        if (profile is null)
        {
            return (false, OnboardingErrors.StudentNotFound);
        }

        profile.User.PasswordHash = null;
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    private async Task<StudentProfile?> LoadStudentProfileAsync(Guid id)
    {
        return await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Include(s => s.Group)
            .Include(s => s.Supervisor)
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

    private static StudentResponse MapStudent(StudentProfile profile)
    {
        return new StudentResponse
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
            IsClaimed = profile.User.PasswordHash is not null,
            DiplomaTopic = profile.DiplomaTopic,
            GroupId = profile.GroupId,
            GroupName = profile.Group?.Name,
            SupervisorId = profile.SupervisorId,
            SupervisorFirstName = profile.Supervisor?.FirstName,
            SupervisorLastName = profile.Supervisor?.LastName,
            SupervisorEmail = profile.Supervisor?.Email,
            CreatedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        };
    }
}
