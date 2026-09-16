using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class GroupServiceTests
{
    [Fact]
    public async Task CreateGroupAsync_ForUnknownDepartment_ReturnsDepartmentNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (group, error) = await new GroupService(context).CreateGroupAsync(new CreateGroupRequest
        {
            DepartmentId = Guid.NewGuid(),
            Name = "SE-21",
            AcademicYear = "2026/2027"
        });

        Assert.Null(group);
        Assert.Equal(AcademicStructureErrors.DepartmentNotFound, error);
        Assert.False(await context.Groups.AnyAsync());
    }

    [Fact]
    public async Task CreateGroupAsync_MapsDepartmentAndFacultyNames()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var department = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (group, error) = await new GroupService(context).CreateGroupAsync(new CreateGroupRequest
        {
            DepartmentId = department.Id,
            Name = " SE-21 ",
            AcademicYear = "2026/2027"
        });

        Assert.Null(error);
        Assert.Equal("SE-21", group!.Name);
        Assert.Equal(department.Id, group.DepartmentId);
        Assert.Equal("Department of Software Engineering", group.DepartmentName);
        Assert.Equal(faculty.Id, group.FacultyId);
        Assert.Equal("Faculty of Informatics", group.FacultyName);
    }

    [Fact]
    public async Task UpdateGroupAsync_ToUnknownDepartment_ReturnsDepartmentNotFound()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        var existing = TestData.AddGroup(context, department.Id);

        var (group, error) = await new GroupService(context).UpdateGroupAsync(existing.Id, new UpdateGroupRequest
        {
            DepartmentId = Guid.NewGuid(),
            Name = existing.Name,
            AcademicYear = existing.AcademicYear
        });

        Assert.Null(group);
        Assert.Equal(AcademicStructureErrors.DepartmentNotFound, error);
    }

    [Fact]
    public async Task GetGroupsAsync_IncludesDepartmentAndFacultyNames()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var department = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");
        TestData.AddGroup(context, department.Id, "SE-21");
        context.ChangeTracker.Clear();

        var groups = await new GroupService(context).GetGroupsAsync();

        var group = Assert.Single(groups);
        Assert.Equal("Department of Software Engineering", group.DepartmentName);
        Assert.Equal("Faculty of Informatics", group.FacultyName);
    }

    [Fact]
    public async Task GetGroupStudentsAsync_ForTeacherWhoIsNotAReviewer_IsForbidden()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);
        var outsider = TestData.AddUser(context, "Teacher", "outsider@kpi.ua");

        var (students, error) = await new GroupService(context).GetGroupStudentsAsync(group.Id, "Teacher", outsider.Id);

        Assert.Null(students);
        Assert.Equal("Forbidden.", error);
    }

    [Fact]
    public async Task GetGroupStudentsAsync_ForAssignedReviewer_ReturnsStudents()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);
        var reviewer = TestData.AddUser(context, "Teacher", "reviewer@kpi.ua");
        context.GroupReviewers.Add(new GroupReviewer
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            ReviewerId = reviewer.Id,
            CreatedAt = TestData.Now
        });
        await context.SaveChangesAsync();

        var (students, error) = await new GroupService(context).GetGroupStudentsAsync(group.Id, "Teacher", reviewer.Id);

        Assert.Null(error);
        var student = Assert.Single(students!);
        Assert.Equal("student@kpi.ua", student.Email);
    }

    [Fact]
    public async Task DeleteGroupAsync_WithAssignedStudents_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);

        var (success, error) = await new GroupService(context).DeleteGroupAsync(group.Id);

        Assert.False(success);
        Assert.Equal("Cannot delete group because students are assigned.", error);
        Assert.True(await context.Groups.AnyAsync(g => g.Id == group.Id));
    }

    private static Group AddGroupWithOneStudent(AppDbContext context)
    {
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        var group = TestData.AddGroup(context, department.Id);
        var supervisor = TestData.AddUser(context, "Teacher", "supervisor@kpi.ua");
        var student = TestData.AddUser(context, "Student", "student@kpi.ua");
        TestData.AddStudentProfile(context, student.Id, group.Id, supervisor.Id);
        return group;
    }
}
