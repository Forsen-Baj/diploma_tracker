using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Errors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult ErrorResult(string? code, object? errors = null)
    {
        var definition = ErrorCatalog.Get(code);
        if (definition.Code != code)
        {
            var logger = HttpContext.RequestServices.GetRequiredService<ILogger<ApiControllerBase>>();
            logger.LogError("Unmapped error code {Code} fell back to {FallbackCode}", code, definition.Code);
        }

        return StatusCode(definition.Status, ApiErrorResponse.From(definition) with { Errors = errors });
    }

    protected bool TryGetUserContext(out string role, out Guid userId)
    {
        role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(userIdValue, out userId) && role.Length > 0;
    }
}
