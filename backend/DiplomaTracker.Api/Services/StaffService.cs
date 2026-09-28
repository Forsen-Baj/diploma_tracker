using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §6: staff accounts, and the roles an administrator assigns them for a
/// faculty, a department or a group.
public class StaffService : IStaffService
{
    private const int OptionLimit = 20;
    private const int SearchMaxLength = 100;

    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILogger<StaffService> _logger;

    public StaffService(AppDbContext dbContext, IPasswordHasher passwordHasher, ILogger<StaffService> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task<IReadOnlyList<StaffResponse>> GetStaffAsync(StaffListQuery query)
    {
        var users = _dbContext.Users.AsNoTracking().Where(u => u.Role == AccountRoles.Staff);

        // The student form's supervisor list: the teachers who cover the student's group (§4).
        if (StaffRoleName.TryParse(query.Role, out var parsed) && parsed is { } role)
        {
            var holders = HoldersOf(role, query.GroupId, query.DepartmentId);
            users = users.Where(u => holders.Contains(u.Id));
        }

        var rows = await users.OrderBy(u => u.LastName).ThenBy(u => u.FirstName).ToListAsync();
        var assignments = await RoleAssignmentReader.ReadAsync(_dbContext, rows.Select(u => u.Id).ToList());
        return rows.Select(u => Map(u, assignments)).ToList();
    }

    public async Task<StaffResponse?> GetStaffMemberAsync(Guid id)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return null;
        }

        return Map(user, await RoleAssignmentReader.ReadAsync(_dbContext, [user.Id]));
    }

    public async Task<(StaffResponse? staff, string? error)> CreateStaffAsync(CreateStaffRequest request, Guid administratorId)
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
            Role = AccountRoles.Staff,
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Staff", user.Id);
        return (Map(user, new Dictionary<Guid, List<RoleAssignmentResponse>>()), null);
    }

    public async Task<(StaffResponse? staff, string? error)> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (null, StaffErrors.NotFound);
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

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Staff", user.Id);
        return (await GetStaffMemberAsync(id), null);
    }

    public async Task<(bool success, string? error)> DeactivateStaffAsync(Guid id, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (false, StaffErrors.NotFound);
        }

        // Phase 11 §3, kept: a deactivated manager or controller would hold a seat nobody can fill.
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
        SecurityLog.AdministratorAction(_logger, administratorId, "Deactivated", "Staff", user.Id);
        return (true, null);
    }

    public async Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (false, StaffErrors.NotFound);
        }

        if (!PasswordPolicy.IsSatisfiedBy(password))
        {
            return (false, PasswordPolicy.Violation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "PasswordSet", "Staff", user.Id);
        return (true, null);
    }

    /// Design 2026-09-24 §3.5 and 2026-09-27 (phase 12) §4: the pickers. Active staff and
    /// administrators, narrowed by what the picker is for.
    public async Task<IReadOnlyList<StaffOptionResponse>> SearchOptionsAsync(StaffOptionsQuery query)
    {
        var users = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == AccountRoles.Staff || u.Role == AccountRoles.Admin));

        if (query.StudentTaskId is { } studentTaskId)
        {
            // The extra-reviewer picker: administrators, and teachers who cover the student's group.
            var groupId = await _dbContext.StudentTasks.AsNoTracking()
                .Where(t => t.Id == studentTaskId)
                .Select(t => (Guid?)t.StudentProfile.GroupId)
                .FirstOrDefaultAsync();
            if (groupId is null)
            {
                return [];
            }

            var teachers = _dbContext.CoveringGroup(StaffRole.Teacher, groupId.Value).Select(a => a.UserId);
            users = users.Where(u => u.Role == AccountRoles.Admin || teachers.Contains(u.Id));
        }
        else if (StaffRoleName.TryParse(query.Role, out var parsed) && parsed is { } role)
        {
            var holders = HoldersOf(role, query.GroupId, query.DepartmentId);
            users = users.Where(u => u.Role == AccountRoles.Staff && holders.Contains(u.Id));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var trimmed = query.Search.Trim();
            if (trimmed.Length > SearchMaxLength)
            {
                trimmed = trimmed[..SearchMaxLength];
            }

            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = trimmed.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            users = users.Where(u => EF.Functions.Like(u.LastName, $"%{term}%")
                || EF.Functions.Like(u.FirstName, $"%{term}%")
                || EF.Functions.Like(u.Email, $"%{term}%"));
        }

        var rows = await users
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Take(OptionLimit)
            .Select(u => new { u.Id, u.LastName, u.FirstName, u.Patronymic, u.Role, u.Email })
            .ToListAsync();

        return rows
            .Select(u => new StaffOptionResponse(u.Id, PersonName.Full(u.LastName, u.FirstName, u.Patronymic), u.Role, u.Email))
            .ToList();
    }

    public async Task<(RoleAssignmentResponse? assignment, string? error)> AddAssignmentAsync(Guid staffId, AddRoleAssignmentRequest request, Guid administratorId)
    {
        if (!await _dbContext.Users.AnyAsync(u => u.Id == staffId && u.Role == AccountRoles.Staff))
        {
            return (null, StaffErrors.NotFound);
        }

        // By name only: Enum.TryParse would also take "1".
        if (!Enum.GetNames<StaffRole>().Contains(request.Role) || !Enum.GetNames<RoleScopeKind>().Contains(request.ScopeKind))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var role = Enum.Parse<StaffRole>(request.Role);
        var kind = Enum.Parse<RoleScopeKind>(request.ScopeKind);
        var scopeId = request.ScopeId!.Value;

        // §3: a direction lives in a department, so its manager covers a department or a faculty.
        if (role == StaffRole.DirectionManager && kind == RoleScopeKind.Group)
        {
            return (null, RoleErrors.ScopeNotAllowed);
        }

        var scopeExists = kind switch
        {
            RoleScopeKind.Faculty => await _dbContext.Faculties.AnyAsync(f => f.Id == scopeId),
            RoleScopeKind.Department => await _dbContext.Departments.AnyAsync(d => d.Id == scopeId),
            _ => await _dbContext.Groups.AnyAsync(g => g.Id == scopeId)
        };
        if (!scopeExists)
        {
            return (null, RoleErrors.ScopeInvalid);
        }

        if (await _dbContext.RoleAssignments.AnyAsync(a => a.UserId == staffId && a.Role == role && a.ScopeKind == kind && a.ScopeId == scopeId))
        {
            return (null, RoleErrors.Exists);
        }

        var assignment = new RoleAssignment
        {
            Id = Guid.NewGuid(),
            UserId = staffId,
            Role = role,
            ScopeKind = kind,
            ScopeId = scopeId,
            CreatedById = administratorId,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleAssignments.Add(assignment);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, RoleErrors.Exists);
        }

        SecurityLog.RoleAssignmentChanged(_logger, administratorId, "Added", staffId, role.ToString(), kind.ToString(), scopeId);

        var read = await RoleAssignmentReader.ReadAsync(_dbContext, [staffId]);
        return (read[staffId].First(a => a.Id == assignment.Id), null);
    }

    public async Task<(bool success, string? error, IReadOnlyList<RoleAssignmentBlocker>? blockers)> RemoveAssignmentAsync(Guid staffId, Guid assignmentId, Guid administratorId)
    {
        var assignment = await _dbContext.RoleAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId && a.UserId == staffId);
        if (assignment is null)
        {
            return (false, RoleErrors.NotFound, null);
        }

        // §6: refused while work in its scope depends on it; the refusal names that work.
        var blockers = await RoleAssignmentUsage.FindBlockersAsync(_dbContext, assignment);
        if (blockers.Count > 0)
        {
            return (false, RoleErrors.InUse, blockers);
        }

        _dbContext.RoleAssignments.Remove(assignment);
        await _dbContext.SaveChangesAsync();

        SecurityLog.RoleAssignmentChanged(_logger, administratorId, "Removed", staffId, assignment.Role.ToString(), assignment.ScopeKind.ToString(), assignment.ScopeId);
        return (true, null, null);
    }

    private IQueryable<Guid> HoldersOf(StaffRole role, Guid? groupId, Guid? departmentId) =>
        groupId is { } group ? _dbContext.CoveringGroup(role, group).Select(a => a.UserId)
        : departmentId is { } department ? _dbContext.CoveringDepartment(role, department).Select(a => a.UserId)
        : _dbContext.RoleAssignments.Where(a => a.Role == role).Select(a => a.UserId);

    private static StaffResponse Map(AppUser user, IReadOnlyDictionary<Guid, List<RoleAssignmentResponse>> assignments) => new()
    {
        Id = user.Id,
        FirstName = user.FirstName,
        LastName = user.LastName,
        Patronymic = user.Patronymic,
        Email = user.Email,
        IsActive = user.IsActive,
        Assignments = assignments.TryGetValue(user.Id, out var list) ? list : [],
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt
    };
}
