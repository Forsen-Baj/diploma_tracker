using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class RegistrationService : IRegistrationService
{
    private readonly AppDbContext _dbContext;

    public RegistrationService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<bool> IsOpenAsync()
    {
        return await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.RegistrationOpen)
            .FirstOrDefaultAsync();
    }

    public async Task SetOpenAsync(bool open)
    {
        var settings = await _dbContext.PlatformSettings.FirstOrDefaultAsync(s => s.Id == PlatformSettings.SingletonId);
        if (settings is null)
        {
            settings = new PlatformSettings { Id = PlatformSettings.SingletonId };
            _dbContext.PlatformSettings.Add(settings);
        }

        settings.RegistrationOpen = open;
        await _dbContext.SaveChangesAsync();
    }
}
