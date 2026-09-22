using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class AdminBootstrapperTests
{
    private static readonly DateTime Now = new(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
    private readonly PasswordHasher _passwordHasher = new();

    [Fact]
    public async Task EnsureAdminAsync_WhenNoAdminExists_CreatesActiveAdminWithNormalizedEmail()
    {
        await using var context = TestDbContextFactory.Create();
        var settings = new BootstrapSettings { AdminEmail = "  Head.Admin@KPI.ua ", AdminPassword = "Correct-Horse-42" };

        var created = await AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now);

        Assert.True(created);
        var admin = await context.Users.SingleAsync();
        Assert.Equal("head.admin@kpi.ua", admin.Email);
        Assert.Equal("Admin", admin.Role);
        Assert.True(admin.IsActive);
        Assert.Equal(Now, admin.CreatedAt);
        Assert.False(string.IsNullOrWhiteSpace(admin.PasswordHash));
        Assert.NotEqual(settings.AdminPassword, admin.PasswordHash);
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenAdminAlreadyExists_ChangesNothing()
    {
        await using var context = TestDbContextFactory.Create();
        context.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "Existing",
            LastName = "Admin",
            Email = "existing@kpi.ua",
            PasswordHash = "existing-hash",
            Role = "Admin",
            IsActive = true,
            CreatedAt = Now,
            UpdatedAt = Now
        });
        await context.SaveChangesAsync();
        var settings = new BootstrapSettings { AdminEmail = "other@kpi.ua", AdminPassword = "Another-Password-99" };

        var created = await AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now);

        Assert.False(created);
        var admin = await context.Users.SingleAsync();
        Assert.Equal("existing@kpi.ua", admin.Email);
        Assert.Equal("existing-hash", admin.PasswordHash);
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenNoAdminAndSettingsMissing_Throws()
    {
        await using var context = TestDbContextFactory.Create();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, new BootstrapSettings(), Now));

        Assert.Contains("Bootstrap__AdminEmail", exception.Message);
        Assert.False(await context.Users.AnyAsync());
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenPasswordTooShort_Throws()
    {
        await using var context = TestDbContextFactory.Create();
        var settings = new BootstrapSettings { AdminEmail = "admin@kpi.ua", AdminPassword = "short-pw" };

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now));

        Assert.Contains("Bootstrap__AdminPassword", exception.Message);
        Assert.Contains("between 12 and 128", exception.Message);
        Assert.False(await context.Users.AnyAsync());
    }
}
