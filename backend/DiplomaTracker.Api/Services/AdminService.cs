using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Admins;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class AdminService : IAdminService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILogger<AdminService> _logger;

    public AdminService(AppDbContext dbContext, IPasswordHasher passwordHasher, ILogger<AdminService> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AdminResponse>> GetAdminsAsync()
    {
        return await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Admin")
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Select(ProjectAdmin)
            .ToListAsync();
    }

    public async Task<AdminResponse?> GetAdminByIdAsync(Guid id)
    {
        return await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Admin" && u.Id == id)
            .Select(ProjectAdmin)
            .FirstOrDefaultAsync();
    }

    public async Task<(AdminResponse? admin, string? error)> CreateAdminAsync(CreateAdminRequest request, Guid administratorId)
    {
        var email = IdentityNormalizer.Email(request.Email);
        if (await _dbContext.Users.AnyAsync(u => u.Email == email))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (!PasswordPolicy.IsSatisfiedByElevated(request.Password))
        {
            return (null, PasswordPolicy.ElevatedViolation);
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
            Role = "Admin",
            IsActive = true,
            ClaimReopened = false,
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Administrator", user.Id);

        return (MapAdmin(user), null);
    }

    public async Task<(AdminResponse? admin, string? error)> UpdateAdminAsync(Guid id, UpdateAdminRequest request, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Admin" && u.Id == id);
        if (user is null)
        {
            return (null, AdminErrors.NotFound);
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Administrator", user.Id);
        return (MapAdmin(user), null);
    }

    public async Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Admin" && u.Id == id);
        if (user is null)
        {
            return (false, AdminErrors.NotFound);
        }

        if (!PasswordPolicy.IsSatisfiedByElevated(password))
        {
            return (false, PasswordPolicy.ElevatedViolation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Administrator", user.Id);

        return (true, null);
    }

    public async Task<(bool success, string? error)> DeactivateAdminAsync(Guid id, Guid administratorId)
    {
        if (id == administratorId)
        {
            return (false, AdminErrors.CannotDeactivateSelf);
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Admin" && u.Id == id);
        if (user is null)
        {
            return (false, AdminErrors.NotFound);
        }

        var now = DateTime.UtcNow;
        var rows = await _dbContext.Users
            .Where(u => u.Id == id
                && u.Role == "Admin"
                && (!u.IsActive || _dbContext.Users.Count(o => o.Role == "Admin" && o.IsActive) > 1))
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.IsActive, false)
                .SetProperty(u => u.UpdatedAt, now));

        if (rows == 0)
        {
            return (false, AdminErrors.LastActive);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Deactivated", "Administrator", id);

        return (true, null);
    }

    public async Task<(bool success, string? error)> ActivateAdminAsync(Guid id, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Admin" && u.Id == id);
        if (user is null)
        {
            return (false, AdminErrors.NotFound);
        }

        user.IsActive = true;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "Activated", "Administrator", user.Id);

        return (true, null);
    }

    private static readonly Expression<Func<AppUser, AdminResponse>> ProjectAdmin = user => new AdminResponse
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

    private static AdminResponse MapAdmin(AppUser user) => ProjectAdmin.Compile()(user);
}
