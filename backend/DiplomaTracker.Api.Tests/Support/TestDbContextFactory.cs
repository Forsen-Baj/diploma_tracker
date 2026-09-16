using DiplomaTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Support;

public static class TestDbContextFactory
{
    public static AppDbContext Create()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }
}
