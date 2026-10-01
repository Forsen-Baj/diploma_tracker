using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace DiplomaTracker.Api.Services;

public class AuthService : IAuthService
{
    // Hashed once from a random value so a login attempt against a missing, inactive or
    // unclaimed account still runs a password verification, keeping the response time close to
    // the timing of a claimed account with a wrong password.
    private static readonly string DummyPasswordHash = new PasswordHasher().HashPassword(Guid.NewGuid().ToString("N"));

    private readonly AppDbContext _dbContext;
    private readonly JwtSettings _jwtSettings;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IRegistrationService _registrationService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        AppDbContext dbContext,
        IOptions<JwtSettings> jwtOptions,
        IPasswordHasher passwordHasher,
        IRegistrationService registrationService,
        ILogger<AuthService> logger)
    {
        _dbContext = dbContext;
        _jwtSettings = jwtOptions.Value;
        _passwordHasher = passwordHasher;
        _registrationService = registrationService;
        _logger = logger;
    }

    public async Task<LoginResponse?> LoginAsync(LoginRequest request)
    {
        var email = IdentityNormalizer.Email(request.Email);

        // The IsActive filter has moved out of the query so the refusal can be logged with a
        // reason. The RESPONSE is identical in every branch - null - and every branch that does
        // not verify a real hash still verifies the dummy one, so neither the answer nor the
        // time it takes reveals which branch ran.
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "UnknownAccount");
            return null;
        }

        if (!user.IsActive)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "Inactive");
            return null;
        }

        if (user.PasswordHash is null)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "Unclaimed");
            return null;
        }

        if (!_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            SecurityLog.SignInFailed(_logger, email, "WrongPassword");
            return null;
        }

        var actingRole = await DefaultActingRoleAsync(user);
        SecurityLog.SignInSucceeded(_logger, user.Id, actingRole);

        return new LoginResponse
        {
            Token = CreateToken(user, actingRole),
            User = await MapCurrentUserAsync(user, actingRole)
        };
    }

    public async Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, string actingRole)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        return user is null ? null : await MapCurrentUserAsync(user, actingRole);
    }

    /// Design 2026-09-27 (phase 12) §5: a new token in another role the staff member holds. The
    /// session check re-reads the role on every request, so the old token stays valid only while
    /// its own role is still held.
    public async Task<(LoginResponse? result, string? error)> SwitchActingRoleAsync(Guid userId, string role)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        if (user is null)
        {
            return (null, OnboardingErrors.UserNotFound);
        }

        if (user.Role != AccountRoles.Staff
            || !Enum.GetNames<StaffRole>().Contains(role)
            || !await _dbContext.HoldsRoleAsync(userId, Enum.Parse<StaffRole>(role)))
        {
            return (null, RoleErrors.RoleNotHeld);
        }

        SecurityLog.ActingRoleSwitched(_logger, userId, role);
        return (new LoginResponse
        {
            Token = CreateToken(user, role),
            User = await MapCurrentUserAsync(user, role)
        }, null);
    }

    public async Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request)
    {
        if (!PasswordPolicy.IsSatisfiedBy(request.Password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var registrationOpen = await _registrationService.IsOpenAsync();

        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumberCanonical(request.StudentNumber);

        var profile = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.StudentNumberCanonical == studentNumber
                && p.User.Email == email
                && p.User.Role == AccountRoles.Student
                && p.User.IsActive
                && p.User.PasswordHash == null);

        if (profile is null || (!registrationOpen && !profile.User.ClaimReopened))
        {
            return (null, RefuseClaim(registrationOpen, email));
        }

        var wasReopened = profile.User.ClaimReopened;
        var hash = _passwordHasher.HashPassword(request.Password);
        var now = DateTime.UtcNow;
        var rows = await _dbContext.Users
            .Where(u => u.Id == profile.UserId
                && u.PasswordHash == null
                && u.IsActive
                && u.Role == AccountRoles.Student
                && (registrationOpen || u.ClaimReopened))
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.PasswordHash, hash)
                .SetProperty(u => u.ClaimReopened, false)
                .SetProperty(u => u.UpdatedAt, now));

        if (rows == 0)
        {
            return (null, RefuseClaim(registrationOpen, email));
        }

        profile.User.PasswordHash = hash;
        profile.User.ClaimReopened = false;
        profile.User.UpdatedAt = now;

        SecurityLog.ClaimSucceeded(_logger, profile.UserId, wasReopened);

        return (new LoginResponse
        {
            Token = CreateToken(profile.User, AccountRoles.Student),
            User = await MapCurrentUserAsync(profile.User, AccountRoles.Student)
        }, null);
    }

    private string RefuseClaim(bool registrationOpen, string email)
    {
        if (registrationOpen)
        {
            SecurityLog.ClaimRefused(_logger, email, "DetailsMismatch");
            return OnboardingErrors.ClaimDetailsMismatch;
        }

        SecurityLog.ClaimRefused(_logger, email, "RegistrationClosed");
        return OnboardingErrors.RegistrationClosed;
    }

    public async Task<(bool success, string? error)> ChangePasswordAsync(Guid userId, ChangePasswordRequest request)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        if (user?.PasswordHash is null)
        {
            return (false, OnboardingErrors.UserNotFound);
        }

        if (!_passwordHasher.VerifyPassword(request.CurrentPassword, user.PasswordHash))
        {
            return (false, OnboardingErrors.CurrentPasswordIncorrect);
        }

        var satisfied = user.Role == AccountRoles.Admin
            ? PasswordPolicy.IsSatisfiedByElevated(request.NewPassword)
            : PasswordPolicy.IsSatisfiedBy(request.NewPassword);
        if (!satisfied)
        {
            return (false, user.Role == AccountRoles.Admin ? PasswordPolicy.ElevatedViolation : PasswordPolicy.Violation);
        }

        var verifiedHash = user.PasswordHash;
        var newHash = _passwordHasher.HashPassword(request.NewPassword);
        var now = DateTime.UtcNow;
        var rows = await _dbContext.Users
            .Where(u => u.Id == userId && u.PasswordHash == verifiedHash)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.PasswordHash, newHash).SetProperty(u => u.UpdatedAt, now));

        if (rows == 0)
        {
            return (false, OnboardingErrors.CurrentPasswordIncorrect);
        }

        SecurityLog.PasswordChanged(_logger, userId);

        return (true, null);
    }

    private string CreateToken(AppUser user, string actingRole)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.GivenName, user.FirstName),
            new(JwtRegisteredClaimNames.FamilyName, user.LastName),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Role, actingRole)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpiresInMinutes);

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// Design 2026-09-27 (phase 12) §5: a staff member starts in the first role they hold - teacher,
    /// direction manager, standards controller - or in none. Everyone else acts in their account role.
    private async Task<string> DefaultActingRoleAsync(AppUser user)
    {
        if (user.Role != AccountRoles.Staff)
        {
            return user.Role;
        }

        var held = await _dbContext.RoleAssignments.AsNoTracking()
            .Where(a => a.UserId == user.Id)
            .Select(a => a.Role)
            .Distinct()
            .ToListAsync();

        return held.Count == 0 ? ActingRoles.None : held.Min().ToString();
    }

    private async Task<CurrentUserResponse> MapCurrentUserAsync(AppUser user, string actingRole)
    {
        var assignments = user.Role == AccountRoles.Staff
            ? await RoleAssignmentReader.ReadAsync(_dbContext, [user.Id])
            : new Dictionary<Guid, List<RoleAssignmentResponse>>();

        return new CurrentUserResponse
        {
            Id = user.Id.ToString(),
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email,
            Role = actingRole,
            AccountRole = user.Role,
            Assignments = assignments.TryGetValue(user.Id, out var list) ? list : []
        };
    }
}
