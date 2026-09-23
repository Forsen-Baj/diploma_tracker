using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class TopicSettingsService : ITopicSettingsService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<TopicSettingsService> _logger;

    public TopicSettingsService(AppDbContext dbContext, ILogger<TopicSettingsService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    // Phase 8 §8: the deadline is read once per request and held for the lifetime of this
    // scoped instance. A request that checks it five times issues one query; the NEXT request
    // constructs a new instance and reads the database again, so a change to the deadline takes
    // effect immediately. Nothing is cached across requests.
    private bool _deadlineLoaded;
    private DateTime? _deadline;

    public async Task<DateTime?> GetDeadlineAsync()
    {
        if (_deadlineLoaded)
        {
            return _deadline;
        }

        var deadline = await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.TopicSelectionDeadline)
            .FirstOrDefaultAsync();

        _deadline = deadline is null ? null : DateTime.SpecifyKind(deadline.Value, DateTimeKind.Utc);
        _deadlineLoaded = true;
        return _deadline;
    }

    public async Task SetDeadlineAsync(DateTime? deadlineUtc, Guid administratorId)
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

        _deadlineLoaded = false;
        _deadline = null;

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Settings", Guid.Empty);
    }

    public async Task<bool> IsSelectionOpenAsync()
    {
        var deadline = await GetDeadlineAsync();
        return deadline is null || DateTime.UtcNow < deadline.Value;
    }
}
