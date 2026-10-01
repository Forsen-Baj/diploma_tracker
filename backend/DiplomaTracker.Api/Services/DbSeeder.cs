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

        var administrator = await EnsureUserAsync(dbContext, passwordHasher, "admin@diploma.local", "System", "Admin", "Admin123!", AccountRoles.Admin, now);
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", AccountRoles.Staff, now);
        var student = await EnsureUserAsync(dbContext, passwordHasher, "student@diploma.local", "Demo", "Student", "Student123!", AccountRoles.Student, now);

        var faculty = await EnsureFacultyAsync(dbContext, "Faculty of Informatics and Computer Science", "FICS", now);
        var department = await EnsureDepartmentAsync(dbContext, faculty.Id, "Department of Software Engineering", "SE", now);
        var group = await EnsureGroupAsync(dbContext, department.Id, "SEED-A", "Default seeded group", "2026/2027", now);

        await EnsureStudentProfileAsync(dbContext, student.Id, group.Id, now);
        await EnsureTaskTemplatesAsync(dbContext, faculty.Id, now);

        // Only on a database with no direction yet, and only for an active staff member: after that
        // the roles and the directions are the administrator's, and a restart must not re-add a
        // removed role or recreate a deleted direction under a manager who may have left.
        if (teacher.IsActive && !await dbContext.Directions.AnyAsync())
        {
            await EnsureTeacherRolesAsync(dbContext, teacher.Id, faculty.Id, administrator.Id, now);
            await EnsureDirectionAsync(dbContext, department.Id, "Software Engineering", teacher.Id, now);
        }
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
            StudentNumberCanonical = IdentityNormalizer.StudentNumberCanonical("SEED-0001"),
            GroupId = groupId,
            SupervisorId = null,
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

    // Design 2026-09-27 (phase 12) §3: the seeded staff member holds all three roles for the seeded
    // faculty, so the check scripts have one of each to work with.
    private static async Task EnsureTeacherRolesAsync(AppDbContext dbContext, Guid teacherId, Guid facultyId, Guid administratorId, DateTime now)
    {
        foreach (var role in Enum.GetValues<StaffRole>())
        {
            if (await dbContext.RoleAssignments.AnyAsync(a => a.UserId == teacherId && a.Role == role
                && a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == facultyId))
            {
                continue;
            }

            dbContext.RoleAssignments.Add(new RoleAssignment
            {
                Id = Guid.NewGuid(),
                UserId = teacherId,
                Role = role,
                ScopeKind = RoleScopeKind.Faculty,
                ScopeId = facultyId,
                CreatedById = administratorId,
                CreatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureDirectionAsync(AppDbContext dbContext, Guid departmentId, string name, Guid managerId, DateTime now)
    {
        if (await dbContext.Directions.AnyAsync(d => d.DepartmentId == departmentId && d.Name == name))
        {
            return;
        }

        dbContext.Directions.Add(new Direction
        {
            Id = Guid.NewGuid(),
            DepartmentId = departmentId,
            Name = name,
            Description = "The seeded department's direction.",
            ManagerId = managerId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }
}
