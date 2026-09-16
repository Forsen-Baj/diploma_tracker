using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public static class AdminBootstrapper
{
    public const int MinimumPasswordLength = 12;

    public static async Task<bool> EnsureAdminAsync(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        BootstrapSettings settings,
        DateTime now)
    {
        if (await dbContext.Users.AnyAsync(u => u.Role == "Admin"))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(settings.AdminEmail) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            throw new InvalidOperationException(
                "No administrator exists. Set Bootstrap__AdminEmail and Bootstrap__AdminPassword to create the first one.");
        }

        if (settings.AdminPassword.Length < MinimumPasswordLength)
        {
            throw new InvalidOperationException(
                $"Bootstrap__AdminPassword must be at least {MinimumPasswordLength} characters long.");
        }

        dbContext.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "System",
            LastName = "Administrator",
            Email = settings.AdminEmail.Trim().ToLowerInvariant(),
            PasswordHash = passwordHasher.HashPassword(settings.AdminPassword),
            Role = "Admin",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
        return true;
    }
}
