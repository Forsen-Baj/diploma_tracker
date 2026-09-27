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
            IsDirectionManager = request.IsDirectionManager,
            IsStandardsController = request.IsStandardsController,
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

        // §3: a capability in use cannot be taken away; the administrator reassigns first.
        if (user.IsDirectionManager && !request.IsDirectionManager
            && await _dbContext.Directions.AnyAsync(d => d.ManagerId == id))
        {
            return (null, StaffErrors.ManagesDirections);
        }

        if (user.IsStandardsController && !request.IsStandardsController
            && await _dbContext.GroupTasks.AnyAsync(g => g.StandardsControllerId == id))
        {
            return (null, StaffErrors.ControlsSteps);
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        user.Email = email;
        user.IsDirectionManager = request.IsDirectionManager;
        user.IsStandardsController = request.IsStandardsController;
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

        if (await _dbContext.Directions.AnyAsync(d => d.ManagerId == id))
        {
            return (false, StaffErrors.ManagesDirections);
        }

        if (await _dbContext.GroupTasks.AnyAsync(g => g.StandardsControllerId == id))
        {
            return (false, StaffErrors.ControlsSteps);
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

        SecurityLog.AdministratorAction(_logger, administratorId, "PasswordSet", "Teacher", user.Id);

        return (true, null);
    }

    private const int StaffOptionLimit = 20;
    private const int StaffSearchMaxLength = 100;

    /// Design 2026-09-24 §3.5: active teachers and administrators, for the extra-reviewer picker.
    public async Task<IReadOnlyList<StaffOptionResponse>> SearchStaffAsync(string? search, StaffCapability? capability)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == "Teacher" || u.Role == "Admin"));

        // Design 2026-09-27 §3: the direction-manager and standards-controller pickers.
        query = capability switch
        {
            StaffCapability.DirectionManager => query.Where(u => u.Role == "Teacher" && u.IsDirectionManager),
            StaffCapability.StandardsController => query.Where(u => u.Role == "Teacher" && u.IsStandardsController),
            _ => query
        };

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            if (trimmed.Length > StaffSearchMaxLength)
            {
                trimmed = trimmed[..StaffSearchMaxLength];
            }

            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = trimmed.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            query = query.Where(u => EF.Functions.Like(u.LastName, $"%{term}%")
                || EF.Functions.Like(u.FirstName, $"%{term}%")
                || EF.Functions.Like(u.Email, $"%{term}%"));
        }

        // M13: project to the fields the picker needs instead of loading the whole AppUser
        // (PasswordHash included) into memory on every keystroke.
        var users = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Take(StaffOptionLimit)
            .Select(u => new { u.Id, u.LastName, u.FirstName, u.Patronymic, u.Role, u.Email })
            .ToListAsync();

        return users
            .Select(u => new StaffOptionResponse(u.Id, PersonName.Full(u.LastName, u.FirstName, u.Patronymic), u.Role, u.Email))
            .ToList();
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
            IsDirectionManager = user.IsDirectionManager,
            IsStandardsController = user.IsStandardsController,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        };
    }
}
