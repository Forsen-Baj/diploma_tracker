using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class TeacherService : ITeacherService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILogger<TeacherService> _logger;

    public TeacherService(AppDbContext dbContext, IPasswordHasher passwordHasher, ILogger<TeacherService> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _logger = logger;
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

    public async Task<(TeacherResponse? teacher, string? error)> CreateTeacherAsync(CreateTeacherRequest request, Guid administratorId)
    {
        var email = IdentityNormalizer.Email(request.Email);
        if (await _dbContext.Users.AnyAsync(u => u.Email == email))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (!PasswordPolicy.IsSatisfiedBy(request.Password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Patronymic = IdentityNormalizer.Optional(request.Patronymic),
            Email = email,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            Role = "Teacher",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Teacher", user.Id);
        return (MapTeacher(user), null);
    }

    public async Task<(TeacherResponse? teacher, string? error)> UpdateTeacherAsync(Guid id, UpdateTeacherRequest request, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (null, OnboardingErrors.TeacherNotFound);
        }

        var email = IdentityNormalizer.Email(request.Email);
        if (await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != id))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        user.Email = email;
        user.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Teacher", user.Id);
        return (MapTeacher(user), null);
    }

    public async Task<(bool success, string? error)> DeactivateTeacherAsync(Guid id, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (false, OnboardingErrors.TeacherNotFound);
        }

        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        SecurityLog.AdministratorAction(_logger, administratorId, "Deactivated", "Teacher", user.Id);
        return (true, null);
    }

    public async Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (false, OnboardingErrors.TeacherNotFound);
        }

        if (!PasswordPolicy.IsSatisfiedBy(password))
        {
            return (false, PasswordPolicy.Violation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Teacher", user.Id);

        return (true, null);
    }

    private static TeacherResponse MapTeacher(AppUser user)
    {
        return new TeacherResponse
        {
            Id = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Patronymic = user.Patronymic,
            Email = user.Email,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        };
    }
}
