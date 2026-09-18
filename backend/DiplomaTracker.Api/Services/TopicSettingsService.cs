using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TopicSettingsService : ITopicSettingsService
{
    private readonly AppDbContext _dbContext;

    public TopicSettingsService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<DateTime?> GetDeadlineAsync()
    {
        var deadline = await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.TopicSelectionDeadline)
            .FirstOrDefaultAsync();

        return deadline is null ? null : DateTime.SpecifyKind(deadline.Value, DateTimeKind.Utc);
    }

    public async Task SetDeadlineAsync(DateTime? deadlineUtc)
    {
        var settings = await _dbContext.PlatformSettings.FirstOrDefaultAsync(s => s.Id == PlatformSettings.SingletonId);
        if (settings is null)
        {
            settings = new PlatformSettings { Id = PlatformSettings.SingletonId };
            _dbContext.PlatformSettings.Add(settings);
        }

        settings.TopicSelectionDeadline = deadlineUtc?.Kind switch
        {
            null => null,
            DateTimeKind.Local => deadlineUtc.Value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(deadlineUtc.Value, DateTimeKind.Utc)
        };

        await _dbContext.SaveChangesAsync();
    }

    public async Task<bool> IsSelectionOpenAsync()
    {
        var deadline = await GetDeadlineAsync();
        return deadline is null || DateTime.UtcNow < deadline.Value;
    }
}
