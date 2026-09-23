using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.1: a bearer token carries claims, not facts. The account it names may have been
/// archived, deactivated, given a different role or had its access reset since the token was
/// issued, and the token would otherwise keep working for up to sixty minutes. Every
/// authenticated request re-reads four columns of that account. There is no revocation list and
/// no cache: the database is the only authority, and it is consulted every time.
public sealed class SessionStateValidator
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<SessionStateValidator> _logger;

    public SessionStateValidator(AppDbContext dbContext, ILogger<SessionStateValidator> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<bool> IsSessionValidAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var role = principal.FindFirstValue(ClaimTypes.Role);

        if (!Guid.TryParse(idValue, out var userId) || string.IsNullOrEmpty(role))
        {
            SecurityLog.SessionRejected(_logger, Guid.Empty, "Malformed");
            return false;
        }

        var state = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.IsActive, u.Role, HasPassword = u.PasswordHash != null })
            .FirstOrDefaultAsync(cancellationToken);

        if (state is null)
        {
            SecurityLog.SessionRejected(_logger, userId, "Missing");
            return false;
        }

        // An access reset clears the password hash and leaves the account active, so this is the
        // condition that ends a reset student's session at once and keeps them out until they
        // have claimed the account again.
        if (!state.IsActive)
        {
            SecurityLog.SessionRejected(_logger, userId, "Inactive");
            return false;
        }

        if (!state.HasPassword)
        {
            SecurityLog.SessionRejected(_logger, userId, "Unclaimed");
            return false;
        }

        if (!string.Equals(state.Role, role, StringComparison.Ordinal))
        {
            SecurityLog.SessionRejected(_logger, userId, "RoleChanged");
            return false;
        }

        return true;
    }
}
