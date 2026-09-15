using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Data;

public class StudentTaskStatusMappingTests
{
    [Fact]
    public void Status_IsMappedAsEnumPersistedAsString()
    {
        using var context = TestDbContextFactory.Create();

        var property = context.Model.FindEntityType(typeof(StudentTask))!.FindProperty(nameof(StudentTask.Status))!;

        Assert.Equal(typeof(StudentTaskStatus), property.ClrType);
        Assert.Equal(typeof(string), property.GetProviderClrType());
    }

    [Fact]
    public async Task Status_RoundTripsThroughTheContext()
    {
        var taskId = Guid.NewGuid();
        await using (var writeContext = TestDbContextFactory.Create())
        {
            writeContext.StudentTasks.Add(new StudentTask
            {
                Id = taskId,
                StudentProfileId = Guid.NewGuid(),
                GroupTaskId = Guid.NewGuid(),
                Status = StudentTaskStatus.Submitted,
                CreatedAt = DateTime.UtcNow
            });
            await writeContext.SaveChangesAsync();

            var stored = await writeContext.StudentTasks.AsNoTracking().SingleAsync(t => t.Id == taskId);

            Assert.Equal(StudentTaskStatus.Submitted, stored.Status);
        }
    }
}
