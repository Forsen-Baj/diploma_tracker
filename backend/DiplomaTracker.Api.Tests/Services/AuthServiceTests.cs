using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace DiplomaTracker.Api.Tests.Services;

public class AuthServiceTests
{
    [Fact]
    public async Task LoginAsync_WithValidCredentials_ReturnsTokenAndUser()
    {
        var passwordHasher = new PasswordHasher();
        var context = CreateDbContext();
        var userId = Guid.NewGuid();

        context.Users.Add(new AppUser
        {
            Id = userId,
            FirstName = "Admin",
            LastName = "User",
            Email = "admin@test.local",
            PasswordHash = passwordHasher.HashPassword("Admin123!"),
            Role = "Admin",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var service = CreateAuthService(context, passwordHasher);

        var result = await service.LoginAsync(new LoginRequest
        {
            Email = "admin@test.local",
            Password = "Admin123!"
        });

        Assert.NotNull(result);
        Assert.False(string.IsNullOrWhiteSpace(result!.Token));
        Assert.Equal("admin@test.local", result.User.Email);
        Assert.Equal("Admin", result.User.Role);
    }

    [Fact]
    public async Task LoginAsync_WithWrongPassword_ReturnsNull()
    {
        var passwordHasher = new PasswordHasher();
        var context = CreateDbContext();

        context.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "Teacher",
            LastName = "User",
            Email = "teacher@test.local",
            PasswordHash = passwordHasher.HashPassword("Teacher123!"),
            Role = "Teacher",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var service = CreateAuthService(context, passwordHasher);

        var result = await service.LoginAsync(new LoginRequest
        {
            Email = "teacher@test.local",
            Password = "WrongPassword!"
        });

        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_WithUnknownEmail_ReturnsNull()
    {
        var context = CreateDbContext();
        var service = CreateAuthService(context, new PasswordHasher());

        var result = await service.LoginAsync(new LoginRequest
        {
            Email = "missing@test.local",
            Password = "AnyPassword123!"
        });

        Assert.Null(result);
    }

    [Fact]
    public async Task LoginAsync_WithInactiveUser_ReturnsNull()
    {
        var passwordHasher = new PasswordHasher();
        var context = CreateDbContext();

        context.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "Inactive",
            LastName = "User",
            Email = "inactive@test.local",
            PasswordHash = passwordHasher.HashPassword("Inactive123!"),
            Role = "Student",
            IsActive = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var service = CreateAuthService(context, passwordHasher);
        var result = await service.LoginAsync(new LoginRequest
        {
            Email = "inactive@test.local",
            Password = "Inactive123!"
        });

        Assert.Null(result);
    }

    [Fact]
    public async Task GetCurrentUserAsync_ForInactiveUser_ReturnsNull()
    {
        var passwordHasher = new PasswordHasher();
        var context = CreateDbContext();
        var userId = Guid.NewGuid();

        context.Users.Add(new AppUser
        {
            Id = userId,
            FirstName = "Student",
            LastName = "User",
            Email = "student@test.local",
            PasswordHash = passwordHasher.HashPassword("Student123!"),
            Role = "Student",
            IsActive = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var service = CreateAuthService(context, passwordHasher);
        var result = await service.GetCurrentUserAsync(userId);

        Assert.Null(result);
    }

    [Fact]
    public async Task GetCurrentUserAsync_ForActiveUser_ReturnsMappedUser()
    {
        var passwordHasher = new PasswordHasher();
        var context = CreateDbContext();
        var userId = Guid.NewGuid();

        context.Users.Add(new AppUser
        {
            Id = userId,
            FirstName = "Active",
            LastName = "Teacher",
            Email = "active.teacher@test.local",
            PasswordHash = passwordHasher.HashPassword("Active123!"),
            Role = "Teacher",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();

        var service = CreateAuthService(context, passwordHasher);
        var result = await service.GetCurrentUserAsync(userId);

        Assert.NotNull(result);
        Assert.Equal(userId.ToString(), result!.Id);
        Assert.Equal("active.teacher@test.local", result.Email);
        Assert.Equal("Teacher", result.Role);
    }

    private static AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }

    private static AuthService CreateAuthService(AppDbContext context, PasswordHasher passwordHasher)
    {
        var jwtOptions = Options.Create(new JwtSettings
        {
            Issuer = "test-issuer",
            Audience = "test-audience",
            Secret = "super-secret-key-for-tests-1234567890",
            ExpiresInMinutes = 60
        });

        return new AuthService(context, jwtOptions, passwordHasher);
    }
}
