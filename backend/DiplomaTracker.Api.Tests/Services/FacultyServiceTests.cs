using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace DiplomaTracker.Api.Tests.Services;

public class FacultyServiceTests
{
    private static readonly Guid AdministratorId = Guid.NewGuid();

    [Fact]
    public async Task GetFacultiesAsync_ReturnsFacultiesOrderedByName()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var faculties = await new FacultyService(context, NullLogger<FacultyService>.Instance).GetFacultiesAsync();

        Assert.Equal(new[] { "Faculty of Informatics", "Faculty of Physics" }, faculties.Select(f => f.Name));
    }

    [Fact]
    public async Task CreateFacultyAsync_WithUniqueNames_ReturnsTrimmedFaculty()
    {
        await using var context = TestDbContextFactory.Create();

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "  Faculty of Applied Mathematics ", ShortName = " FAM " }, AdministratorId);

        Assert.Null(error);
        Assert.NotNull(faculty);
        Assert.Equal("Faculty of Applied Mathematics", faculty!.Name);
        Assert.Equal("FAM", faculty.ShortName);
        Assert.True(await context.Faculties.AnyAsync(f => f.Id == faculty.Id));
    }

    [Fact]
    public async Task CreateFacultyAsync_WithDuplicateName_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "Faculty of Informatics", ShortName = "OTHER" }, AdministratorId);

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNameTaken, error);
    }

    [Fact]
    public async Task CreateFacultyAsync_WithDuplicateShortName_ReturnsShortNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "Faculty of Innovation", ShortName = "FI" }, AdministratorId);

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyShortNameTaken, error);
    }

    [Fact]
    public async Task UpdateFacultyAsync_WithUnknownId_ReturnsNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).UpdateFacultyAsync(
            Guid.NewGuid(), new UpdateFacultyRequest { Name = "Any", ShortName = "A" }, AdministratorId);

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNotFound, error);
    }

    [Fact]
    public async Task UpdateFacultyAsync_KeepingItsOwnNames_Succeeds()
    {
        await using var context = TestDbContextFactory.Create();
        var existing = TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).UpdateFacultyAsync(
            existing.Id, new UpdateFacultyRequest { Name = "Faculty of Informatics", ShortName = "FI" }, AdministratorId);

        Assert.Null(error);
        Assert.Equal("FI", faculty!.ShortName);
    }

    [Fact]
    public async Task UpdateFacultyAsync_ToAnotherFacultysName_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");

        var (faculty, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).UpdateFacultyAsync(
            physics.Id, new UpdateFacultyRequest { Name = "Faculty of Informatics", ShortName = "FP" }, AdministratorId);

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNameTaken, error);
    }

    [Fact]
    public async Task DeleteFacultyAsync_WithDepartments_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id);

        var (success, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).DeleteFacultyAsync(faculty.Id, AdministratorId);

        Assert.False(success);
        Assert.Equal(AcademicStructureErrors.FacultyHasDepartments, error);
        Assert.True(await context.Faculties.AnyAsync(f => f.Id == faculty.Id));
    }

    [Fact]
    public async Task DeleteFacultyAsync_WithoutDepartments_RemovesFaculty()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);

        var (success, error) = await new FacultyService(context, NullLogger<FacultyService>.Instance).DeleteFacultyAsync(faculty.Id, AdministratorId);

        Assert.True(success);
        Assert.Null(error);
        Assert.False(await context.Faculties.AnyAsync());
    }
}
