using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TeacherService : ITeacherService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;

    public TeacherService(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task<IReadOnlyList<TeacherResponse>> GetTeachersAsync()
    {
        var users = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Teacher")
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return users.Select(MapTeacher).ToList();
    }

    public async Task<TeacherResponse?> GetTeacherByIdAsync(Guid id)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        return user is null ? null : MapTeacher(user);
    }

    public async Task<(TeacherResponse? teacher, string? error)> CreateTeacherAsync(CreateTeacherRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var emailExists = await _dbContext.Users.AnyAsync(u => u.Email == normalizedEmail);
        if (emailExists)
        {
            return (null, "Email already exists.");
        }

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Email = normalizedEmail,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            Role = "Teacher",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync();

        return (MapTeacher(user), null);
    }

    public async Task<(TeacherResponse? teacher, string? error)> UpdateTeacherAsync(Guid id, UpdateTeacherRequest request)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (null, "Teacher not found.");
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var emailExists = await _dbContext.Users.AnyAsync(u => u.Email == normalizedEmail && u.Id != id);
        if (emailExists)
        {
            return (null, "Email already exists.");
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.Email = normalizedEmail;
        user.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return (MapTeacher(user), null);
    }

    public async Task<(bool success, string? error)> DeactivateTeacherAsync(Guid id)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (false, "Teacher not found.");
        }

        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private static TeacherResponse MapTeacher(AppUser user)
    {
        return new TeacherResponse
        {
            Id = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        };
    }
}
