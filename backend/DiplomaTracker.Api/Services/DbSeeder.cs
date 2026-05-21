using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;

namespace DiplomaTracker.Api.Services;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        var now = DateTime.UtcNow;

        var admin = await EnsureUserAsync(
            dbContext,
            passwordHasher,
            "admin@diploma.local",
            "System",
            "Admin",
            "Admin123!",
            "Admin",
            now);

        var teacher = await EnsureUserAsync(
            dbContext,
            passwordHasher,
            "teacher@diploma.local",
            "Demo",
            "Teacher",
            "Teacher123!",
            "Teacher",
            now);

        var student = await EnsureUserAsync(
            dbContext,
            passwordHasher,
            "student@diploma.local",
            "Demo",
            "Student",
            "Student123!",
            "Student",
            now);

        var seededGroup = await EnsureGroupAsync(dbContext, "Seed Group A", "Default seeded group", "2026/2027", now);

        await dbContext.Database.ExecuteSqlRawAsync(
            "UPDATE StudentProfiles SET GroupId = @groupId WHERE GroupId IS NULL",
            new SqlParameter("@groupId", seededGroup.Id));
        await dbContext.Database.ExecuteSqlRawAsync(
            "UPDATE StudentProfiles SET SupervisorId = @supervisorId WHERE SupervisorId IS NULL",
            new SqlParameter("@supervisorId", teacher.Id));

        var studentProfile = await dbContext.StudentProfiles.FirstOrDefaultAsync(s => s.UserId == student.Id);
        if (studentProfile is null)
        {
            dbContext.StudentProfiles.Add(new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = student.Id,
                DiplomaTopic = "Seeded diploma topic",
                GroupId = seededGroup.Id,
                SupervisorId = teacher.Id,
                CreatedAt = now,
                UpdatedAt = now
            });
            await dbContext.SaveChangesAsync();
        }
        else if (studentProfile.GroupId == Guid.Empty || studentProfile.SupervisorId == Guid.Empty)
        {
            studentProfile.GroupId = seededGroup.Id;
            studentProfile.SupervisorId = teacher.Id;
            studentProfile.UpdatedAt = now;
            await dbContext.SaveChangesAsync();
        }

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
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);

        if (user is not null)
        {
            return user;
        }

        var created = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = firstName,
            LastName = lastName,
            Email = normalizedEmail,
            PasswordHash = passwordHasher.HashPassword(password),
            Role = role,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Users.Add(created);
        await dbContext.SaveChangesAsync();
        return created;
    }

    private static async Task<Group> EnsureGroupAsync(
        AppDbContext dbContext,
        string name,
        string description,
        string academicYear,
        DateTime now)
    {
        var group = await dbContext.Groups.FirstOrDefaultAsync(g => g.Name == name && g.AcademicYear == academicYear);
        if (group is not null)
        {
            return group;
        }

        var created = new Group
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            AcademicYear = academicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Groups.Add(created);
        await dbContext.SaveChangesAsync();
        return created;
    }

    private static async Task EnsureTaskTemplatesAsync(AppDbContext dbContext, DateTime now)
    {
        var exists = await dbContext.DiplomaTaskTemplates.AnyAsync();
        if (exists)
        {
            return;
        }

        var templates = new[]
        {
            "Choose diploma topic",
            "Submit diploma plan",
            "Submit introduction",
            "Submit literature review",
            "Submit practical part",
            "Submit first draft",
            "Submit final version",
            "Submit presentation"
        };

        for (var i = 0; i < templates.Length; i++)
        {
            dbContext.DiplomaTaskTemplates.Add(new DiplomaTaskTemplate
            {
                Id = Guid.NewGuid(),
                Title = templates[i],
                Description = null,
                Order = i + 1,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
}
