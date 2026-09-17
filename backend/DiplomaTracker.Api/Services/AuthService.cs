using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using DiplomaTracker.Api.Data;
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
        var user = await _dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == email && u.IsActive);

        if (user?.PasswordHash is null)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            return null;
        }

        if (!_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return null;
        }

        var token = CreateToken(user);
        return new LoginResponse
        {
            Token = token,
            User = MapCurrentUser(user)
        };
    }

    public async Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        return user is null ? null : MapCurrentUser(user);
    }

    public async Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request)
    {
        if (!PasswordPolicy.IsSatisfiedBy(request.Password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var registrationOpen = await _registrationService.IsOpenAsync();

        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        var profile = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.StudentNumber == studentNumber
                && p.User.Email == email
                && p.User.Role == "Student"
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
                && u.Role == "Student"
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

        _logger.LogInformation(
            "Account claimed: UserId={UserId}, Reopened={Reopened}",
            profile.UserId,
            wasReopened);

        return (new LoginResponse
        {
            Token = CreateToken(profile.User),
            User = MapCurrentUser(profile.User)
        }, null);
    }

    private string RefuseClaim(bool registrationOpen, string email)
    {
        if (registrationOpen)
        {
            _logger.LogWarning(
                "Claim refused: Reason={Reason}, Email={Email}",
                "DetailsMismatch",
                email);
            return OnboardingErrors.ClaimDetailsMismatch;
        }

        _logger.LogWarning(
            "Claim refused: Reason={Reason}, Email={Email}",
            "RegistrationClosed",
            email);
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

        if (!PasswordPolicy.IsSatisfiedBy(request.NewPassword))
        {
            return (false, PasswordPolicy.Violation);
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

        _logger.LogInformation("Password changed: UserId={UserId}", userId);

        return (true, null);
    }

    private string CreateToken(AppUser user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.GivenName, user.FirstName),
            new(JwtRegisteredClaimNames.FamilyName, user.LastName),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Role, user.Role)
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

    private static CurrentUserResponse MapCurrentUser(AppUser user)
    {
        return new CurrentUserResponse
        {
            Id = user.Id.ToString(),
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email,
            Role = user.Role
        };
    }
}
