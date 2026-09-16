using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace DiplomaTracker.Api.Tests.Data;

public class AcademicStructureModelTests
{
    [Fact]
    public void Department_RequiresFaculty_AndRestrictsFacultyDeletion()
    {
        using var context = TestDbContextFactory.Create();

        var foreignKey = context.Model.FindEntityType(typeof(Department))!
            .GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Faculty));

        Assert.True(foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
    }

    [Fact]
    public void Group_RequiresDepartment_AndRestrictsDepartmentDeletion()
    {
        using var context = TestDbContextFactory.Create();

        var foreignKey = context.Model.FindEntityType(typeof(Group))!
            .GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Department));

        Assert.True(foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
    }

    [Fact]
    public void Faculty_NameAndShortName_AreUnique()
    {
        using var context = TestDbContextFactory.Create();
        var faculty = context.Model.FindEntityType(typeof(Faculty))!;

        AssertUniqueIndex(faculty, nameof(Faculty.Name));
        AssertUniqueIndex(faculty, nameof(Faculty.ShortName));
    }

    [Fact]
    public void Department_NameAndShortName_AreUniqueWithinFaculty()
    {
        using var context = TestDbContextFactory.Create();
        var department = context.Model.FindEntityType(typeof(Department))!;

        AssertUniqueIndex(department, nameof(Department.FacultyId), nameof(Department.Name));
        AssertUniqueIndex(department, nameof(Department.FacultyId), nameof(Department.ShortName));
    }

    private static void AssertUniqueIndex(IEntityType entityType, params string[] propertyNames)
    {
        var index = entityType.GetIndexes()
            .SingleOrDefault(i => i.Properties.Select(p => p.Name).SequenceEqual(propertyNames));

        Assert.NotNull(index);
        Assert.True(index!.IsUnique);
    }
}
