using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Filters;

/// Runs before model binding so a foreign or unknown studentTaskId is rejected before MVC
/// buffers the multipart submission body (up to 90 MB of temp disk / managed memory per request).
public class StudentTaskOwnershipFilter : IAsyncResourceFilter
{
    private readonly AppDbContext _dbContext;

    public StudentTaskOwnershipFilter(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        if (!context.RouteData.Values.TryGetValue("id", out var idValue)
            || !Guid.TryParse(idValue?.ToString(), out var studentTaskId))
        {
            await next();
            return;
        }

        var role = context.HttpContext.User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var userIdValue = context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.HttpContext.User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (role.Length == 0 || !Guid.TryParse(userIdValue, out var userId))
        {
            await next();
            return;
        }

        var ownerUserId = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.Id == studentTaskId)
            .Select(t => (Guid?)t.StudentProfile.UserId)
            .FirstOrDefaultAsync();

        if (ownerUserId is null)
        {
            context.Result = ToActionResult(TaskErrors.StudentTaskNotFound);
            return;
        }

        if (ownerUserId != userId)
        {
            context.Result = ToActionResult(WorkflowErrors.StudentTaskNotYours);
            return;
        }

        await next();
    }

    private static IActionResult ToActionResult(string code)
    {
        var definition = ErrorCatalog.Get(code);
        return new ObjectResult(ApiErrorResponse.From(definition)) { StatusCode = definition.Status };
    }
}
