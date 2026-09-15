using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public static class DbSeeder
{
    private static readonly string[] DefaultTaskTemplates =
    [
        "Choose diploma topic",
        "Submit diploma plan",
        "Submit introduction",
        "Submit literature review",
        "Submit practical part",
        "Submit first draft",
        "Submit final version",
        "Submit presentation"
    ];

    public static async Task SeedAsync(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        var now = DateTime.UtcNow;

        await EnsureUserAsync(dbContext, passwordHasher, "admin@diploma.local", "System", "Admin", "Admin123!", "Admin", now);
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", "Teacher", now);
        var student = await EnsureUserAsync(dbContext, passwordHasher, "student@diploma.local", "Demo", "Student", "Student123!", "Student", now);

        var group = await EnsureGroupAsync(dbContext, "Seed Group A", "Default seeded group", "2026/2027", now);

        await EnsureStudentProfileAsync(dbContext, student.Id, group.Id, teacher.Id, now);
        await EnsureTaskTemplatesAsync(dbContext, now);
    }

    private static async Task<AppUser> EnsureUserAsync(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        string email,
        string firstName,
        string lastName,
        string password,
        string role,
        DateTime now)
    {
        var existing = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing is not null)
        {
            return existing;
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            PasswordHash = passwordHasher.HashPassword(password),
            Role = role,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();
        return user;
    }

    private static async Task<Group> EnsureGroupAsync(
        AppDbContext dbContext,
        string name,
        string description,
        string academicYear,
        DateTime now)
    {
        var existing = await dbContext.Groups.FirstOrDefaultAsync(g => g.Name == name && g.AcademicYear == academicYear);
        if (existing is not null)
        {
            return existing;
        }

        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            AcademicYear = academicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Groups.Add(group);
        await dbContext.SaveChangesAsync();
        return group;
    }

    private static async Task EnsureStudentProfileAsync(
        AppDbContext dbContext,
        Guid userId,
        Guid groupId,
        Guid supervisorId,
        DateTime now)
    {
        if (await dbContext.StudentProfiles.AnyAsync(s => s.UserId == userId))
        {
            return;
        }

        dbContext.StudentProfiles.Add(new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DiplomaTopic = "Seeded diploma topic",
            GroupId = groupId,
            SupervisorId = supervisorId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureTaskTemplatesAsync(AppDbContext dbContext, DateTime now)
    {
        if (await dbContext.DiplomaTaskTemplates.AnyAsync())
        {
            return;
        }

        for (var i = 0; i < DefaultTaskTemplates.Length; i++)
        {
            dbContext.DiplomaTaskTemplates.Add(new DiplomaTaskTemplate
            {
                Id = Guid.NewGuid(),
                Title = DefaultTaskTemplates[i],
                Order = i + 1,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
}
