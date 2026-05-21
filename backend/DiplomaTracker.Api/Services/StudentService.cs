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
        var students = await _dbContext.StudentProfiles
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
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var emailExists = await _dbContext.Users.AnyAsync(u => u.Email == normalizedEmail);
        if (emailExists)
        {
            return (null, "Email already exists.");
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
            Email = normalizedEmail,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            Role = "Student",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            DiplomaTopic = request.DiplomaTopic.Trim(),
            GroupId = assignment.group!.Id,
            SupervisorId = assignment.supervisor!.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        _dbContext.StudentProfiles.Add(profile);
        await _dbContext.SaveChangesAsync();

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
            return (null, "Student not found.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var emailExists = await _dbContext.Users.AnyAsync(u => u.Email == normalizedEmail && u.Id != profile.UserId);
        if (emailExists)
        {
            return (null, "Email already exists.");
        }

        var assignment = await ResolveAssignmentAsync(request.GroupId, request.SupervisorId, profile.GroupId, profile.SupervisorId);
        if (assignment.error is not null)
        {
            return (null, assignment.error);
        }

        profile.User.FirstName = request.FirstName.Trim();
        profile.User.LastName = request.LastName.Trim();
        profile.User.Email = normalizedEmail;
        profile.User.UpdatedAt = DateTime.UtcNow;
        profile.DiplomaTopic = request.DiplomaTopic.Trim();
        profile.GroupId = assignment.group!.Id;
        profile.SupervisorId = assignment.supervisor!.Id;
        profile.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        profile.Group = assignment.group;
        profile.Supervisor = assignment.supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> AssignGroupAsync(Guid id, Guid groupId)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, "Student not found.");
        }

        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, "Group not found.");
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
            return (null, "Student not found.");
        }

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId);
        if (supervisor is null)
        {
            return (null, "Supervisor not found.");
        }

        if (supervisor.Role != "Teacher")
        {
            return (null, "Supervisor must be a teacher.");
        }

        if (!supervisor.IsActive)
        {
            return (null, "Supervisor must be active.");
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
            return (false, "Student not found.");
        }

        profile.User.IsActive = false;
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

    private async Task<(Group? group, AppUser? supervisor, string? error)> ResolveAssignmentAsync(Guid? requestedGroupId, Guid? requestedSupervisorId, Guid? fallbackGroupId = null, Guid? fallbackSupervisorId = null)
    {
        var groupId = requestedGroupId ?? fallbackGroupId;
        var supervisorId = requestedSupervisorId ?? fallbackSupervisorId;

        Group? group = null;
        if (groupId.HasValue)
        {
            group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId.Value);
            if (group is null)
            {
                return (null, null, "Group not found.");
            }
        }
        else
        {
            group = await _dbContext.Groups.OrderBy(g => g.CreatedAt).FirstOrDefaultAsync();
            if (group is null)
            {
                return (null, null, "Group not found.");
            }
        }

        AppUser? supervisor = null;
        if (supervisorId.HasValue)
        {
            supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId.Value);
            if (supervisor is null)
            {
                return (null, null, "Supervisor not found.");
            }
        }
        else
        {
            supervisor = await _dbContext.Users
                .Where(u => u.Role == "Teacher" && u.IsActive)
                .OrderBy(u => u.CreatedAt)
                .FirstOrDefaultAsync();
            if (supervisor is null)
            {
                return (null, null, "Supervisor not found.");
            }
        }

        if (supervisor.Role != "Teacher")
        {
            return (null, null, "Supervisor must be a teacher.");
        }

        if (!supervisor.IsActive)
        {
            return (null, null, "Supervisor must be active.");
        }

        return (group, supervisor, null);
    }

    private static StudentResponse MapStudent(StudentProfile profile)
    {
        return new StudentResponse
        {
            Id = profile.Id,
            UserId = profile.UserId,
            FirstName = profile.User.FirstName,
            LastName = profile.User.LastName,
            Email = profile.User.Email,
            Role = profile.User.Role,
            IsActive = profile.User.IsActive,
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
