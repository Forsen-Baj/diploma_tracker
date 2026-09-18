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

        var faculty = await EnsureFacultyAsync(dbContext, "Faculty of Informatics and Computer Science", "FICS", now);
        var department = await EnsureDepartmentAsync(dbContext, faculty.Id, "Department of Software Engineering", "SE", now);
        var group = await EnsureGroupAsync(dbContext, department.Id, "SEED-A", "Default seeded group", "2026/2027", now);

        await EnsureStudentProfileAsync(dbContext, student.Id, group.Id, teacher.Id, now);
        await EnsureTaskTemplatesAsync(dbContext, faculty.Id, now);
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

    private static async Task<Faculty> EnsureFacultyAsync(AppDbContext dbContext, string name, string shortName, DateTime now)
    {
        var existing = await dbContext.Faculties.FirstOrDefaultAsync(f => f.ShortName == shortName || f.Name == name);
        if (existing is not null)
        {
            return existing;
        }

        var faculty = new Faculty
        {
            Id = Guid.NewGuid(),
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Faculties.Add(faculty);
        await dbContext.SaveChangesAsync();
        return faculty;
    }

    private static async Task<Department> EnsureDepartmentAsync(
        AppDbContext dbContext,
        Guid facultyId,
        string name,
        string shortName,
        DateTime now)
    {
        var existing = await dbContext.Departments.FirstOrDefaultAsync(
            d => d.FacultyId == facultyId && (d.ShortName == shortName || d.Name == name));
        if (existing is not null)
        {
            return existing;
        }

        var department = new Department
        {
            Id = Guid.NewGuid(),
            FacultyId = facultyId,
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Departments.Add(department);
        await dbContext.SaveChangesAsync();
        return department;
    }

    private static async Task<Group> EnsureGroupAsync(
        AppDbContext dbContext,
        Guid departmentId,
        string code,
        string description,
        string academicYear,
        DateTime now)
    {
        var existing = await dbContext.Groups.FirstOrDefaultAsync(g => g.Code == code && g.AcademicYear == academicYear);
        if (existing is not null)
        {
            return existing;
        }

        var group = new Group
        {
            Id = Guid.NewGuid(),
            DepartmentId = departmentId,
            Code = code,
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
            StudentNumber = "SEED-0001",
            DiplomaTopic = "Seeded diploma topic",
            GroupId = groupId,
            SupervisorId = supervisorId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureTaskTemplatesAsync(AppDbContext dbContext, Guid facultyId, DateTime now)
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
                FacultyId = facultyId,
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
