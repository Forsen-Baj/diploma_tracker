using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class DepartmentServiceTests
{
    [Fact]
    public async Task CreateDepartmentAsync_ForUnknownFaculty_ReturnsFacultyNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = Guid.NewGuid(), Name = "Department of Software Engineering", ShortName = "SE" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentFacultyNotFound, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithUniqueNames_ReturnsDepartmentWithFacultyName()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = " Department of Software Engineering ", ShortName = " SE " });

        Assert.Null(error);
        Assert.Equal("Department of Software Engineering", department!.Name);
        Assert.Equal("SE", department.ShortName);
        Assert.Equal(faculty.Id, department.FacultyId);
        Assert.Equal("Faculty of Informatics", department.FacultyName);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithDuplicateNameInSameFaculty_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = "Department of Software Engineering", ShortName = "OTHER" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentNameTaken, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithDuplicateShortNameInSameFaculty_ReturnsShortNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = "Department of Systems Engineering", ShortName = "SE" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentShortNameTaken, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithSameNamesInAnotherFaculty_Succeeds()
    {
        await using var context = TestDbContextFactory.Create();
        var informatics = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddDepartment(context, informatics.Id, "Department of Mathematics", "DM");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = physics.Id, Name = "Department of Mathematics", ShortName = "DM" });

        Assert.Null(error);
        Assert.Equal(physics.Id, department!.FacultyId);
    }

    [Fact]
    public async Task GetDepartmentsAsync_FilteredByFaculty_ReturnsOnlyThatFacultysDepartments()
    {
        await using var context = TestDbContextFactory.Create();
        var informatics = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddDepartment(context, informatics.Id, "Department of Software Engineering", "SE");
        TestData.AddDepartment(context, informatics.Id, "Department of Computer Engineering", "CE");
        TestData.AddDepartment(context, physics.Id, "Department of Optics", "DO");

        var departments = await new DepartmentService(context).GetDepartmentsAsync(informatics.Id);

        Assert.Equal(new[] { "Department of Computer Engineering", "Department of Software Engineering" }, departments!.Select(d => d.Name));
    }

    [Fact]
    public async Task GetDepartmentsAsync_ForUnknownFaculty_ReturnsNull()
    {
        await using var context = TestDbContextFactory.Create();

        var departments = await new DepartmentService(context).GetDepartmentsAsync(Guid.NewGuid());

        Assert.Null(departments);
    }

    [Fact]
    public async Task UpdateDepartmentAsync_WithUnknownId_ReturnsDepartmentNotFound()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);

        var (department, error) = await new DepartmentService(context).UpdateDepartmentAsync(
            Guid.NewGuid(), new UpdateDepartmentRequest { FacultyId = faculty.Id, Name = "Any", ShortName = "A" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentNotFound, error);
    }

    [Fact]
    public async Task UpdateDepartmentAsync_ToUnknownFaculty_ReturnsFacultyNotFound()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var existing = TestData.AddDepartment(context, faculty.Id);

        var (department, error) = await new DepartmentService(context).UpdateDepartmentAsync(
            existing.Id, new UpdateDepartmentRequest { FacultyId = Guid.NewGuid(), Name = existing.Name, ShortName = existing.ShortName });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentFacultyNotFound, error);
    }

    [Fact]
    public async Task UpdateDepartmentAsync_KeepingItsOwnNames_Succeeds()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var existing = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (department, error) = await new DepartmentService(context).UpdateDepartmentAsync(
            existing.Id, new UpdateDepartmentRequest { FacultyId = faculty.Id, Name = "Department of Software Engineering", ShortName = "SE" });

        Assert.Null(error);
        Assert.Equal("Department of Software Engineering", department!.Name);
        Assert.Equal("SE", department.ShortName);
        Assert.Equal("Faculty of Informatics", department.FacultyName);
        Assert.True(await context.Departments.AnyAsync(d => d.Id == existing.Id && d.Name == "Department of Software Engineering"));
    }

    [Fact]
    public async Task GetDepartmentByIdAsync_ReturnsDepartmentWithFacultyName()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var department = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var found = await new DepartmentService(context).GetDepartmentByIdAsync(department.Id);
        var notFound = await new DepartmentService(context).GetDepartmentByIdAsync(Guid.NewGuid());

        Assert.NotNull(found);
        Assert.Equal("Department of Software Engineering", found!.Name);
        Assert.Equal("Faculty of Informatics", found.FacultyName);
        Assert.Null(notFound);
    }

    [Fact]
    public async Task GetDepartmentsAsync_WithoutFacultyId_ReturnsAllDepartments()
    {
        await using var context = TestDbContextFactory.Create();
        var informatics = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddDepartment(context, informatics.Id, "Department of Software Engineering", "SE");
        TestData.AddDepartment(context, physics.Id, "Department of Optics", "DO");

        var departments = await new DepartmentService(context).GetDepartmentsAsync(null);

        Assert.NotNull(departments);
        Assert.Equal(2, departments!.Count);
        Assert.Contains(departments, d => d.Name == "Department of Software Engineering");
        Assert.Contains(departments, d => d.Name == "Department of Optics");
    }

    [Fact]
    public async Task DeleteDepartmentAsync_WithGroups_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        TestData.AddGroup(context, department.Id);

        var (success, error) = await new DepartmentService(context).DeleteDepartmentAsync(department.Id);

        Assert.False(success);
        Assert.Equal(AcademicStructureErrors.DepartmentHasGroups, error);
        Assert.True(await context.Departments.AnyAsync(d => d.Id == department.Id));
    }

    [Fact]
    public async Task DeleteDepartmentAsync_WithoutGroups_RemovesDepartment()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);

        var (success, error) = await new DepartmentService(context).DeleteDepartmentAsync(department.Id);

        Assert.True(success);
        Assert.Null(error);
        Assert.False(await context.Departments.AnyAsync());
    }
}
