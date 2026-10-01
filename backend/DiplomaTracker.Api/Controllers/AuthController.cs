using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ApiControllerBase
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
            return ErrorResult(OnboardingErrors.InvalidCredentials);
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

        return ErrorResult(error);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var user = await _authService.GetCurrentUserAsync(userId, role);
        if (user is null)
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        return Ok(user);
    }

    /// Design 2026-09-27 (phase 12) §5: a new token acting in another role the caller holds.
    [Authorize]
    [HttpPost("acting-role")]
    public async Task<IActionResult> SwitchActingRole([FromBody] ActingRoleRequest request)
    {
        if (!TryGetUserContext(out _, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var (result, error) = await _authService.SwitchActingRoleAsync(userId, request.Role);
        return result is null ? ErrorResult(error) : Ok(result);
    }

    [Authorize]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (!TryGetUserContext(out _, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var (success, error) = await _authService.ChangePasswordAsync(userId, request);
        if (success)
        {
            return NoContent();
        }

        return ErrorResult(error);
    }
}
