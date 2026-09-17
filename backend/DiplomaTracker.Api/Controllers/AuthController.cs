using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [EnableRateLimiting(RateLimitPolicies.Authentication)]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await _authService.LoginAsync(request);
        if (result is null)
        {
            return Unauthorized();
        }

        return Ok(result);
    }

    [EnableRateLimiting(RateLimitPolicies.Authentication)]
    [HttpPost("claim")]
    public async Task<IActionResult> Claim([FromBody] ClaimAccountRequest request)
    {
        var (result, error) = await _authService.ClaimAccountAsync(request);
        if (result is not null)
        {
            return Ok(result);
        }

        return error == OnboardingErrors.RegistrationClosed
            ? StatusCode(StatusCodes.Status403Forbidden, new { message = error })
            : BadRequest(new { message = error });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var user = await _authService.GetCurrentUserAsync(userId);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(user);
    }

    [Authorize]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var (success, error) = await _authService.ChangePasswordAsync(userId, request);
        if (success)
        {
            return NoContent();
        }

        return error == OnboardingErrors.UserNotFound
            ? Unauthorized()
            : BadRequest(new { message = error });
    }

    private bool TryGetUserId(out Guid userId)
    {
        var userIdValue = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return Guid.TryParse(userIdValue, out userId);
    }
}
