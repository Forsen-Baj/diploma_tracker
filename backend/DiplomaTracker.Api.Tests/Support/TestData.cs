using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Tests.Support;

public static class TestData
{
    public static readonly DateTime Now = new(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);

    public static Faculty AddFaculty(AppDbContext context, string name = "Faculty of Informatics", string shortName = "FI")
    {
        var faculty = new Faculty { Id = Guid.NewGuid(), Name = name, ShortName = shortName, CreatedAt = Now, UpdatedAt = Now };
        context.Faculties.Add(faculty);
        context.SaveChanges();
        return faculty;
    }

    public static Department AddDepartment(AppDbContext context, Guid facultyId, string name = "Department of Software Engineering", string shortName = "SE")
    {
        var department = new Department { Id = Guid.NewGuid(), FacultyId = facultyId, Name = name, ShortName = shortName, CreatedAt = Now, UpdatedAt = Now };
        context.Departments.Add(department);
        context.SaveChanges();
        return department;
    }

    public static Group AddGroup(AppDbContext context, Guid departmentId, string name = "SE-21", string academicYear = "2026/2027")
    {
        var group = new Group { Id = Guid.NewGuid(), DepartmentId = departmentId, Name = name, AcademicYear = academicYear, CreatedAt = Now, UpdatedAt = Now };
        context.Groups.Add(group);
        context.SaveChanges();
        return group;
    }

    public static AppUser AddUser(AppDbContext context, string role, string email)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = role,
            LastName = email,
            Email = email,
            PasswordHash = "hash",
            Role = role,
            IsActive = true,
            CreatedAt = Now,
            UpdatedAt = Now
        };
        context.Users.Add(user);
        context.SaveChanges();
        return user;
    }

    public static StudentProfile AddStudentProfile(AppDbContext context, Guid userId, Guid groupId, Guid supervisorId)
    {
        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GroupId = groupId,
            SupervisorId = supervisorId,
            DiplomaTopic = "Topic",
            CreatedAt = Now,
            UpdatedAt = Now
        };
        context.StudentProfiles.Add(profile);
        context.SaveChanges();
        return profile;
    }
}
