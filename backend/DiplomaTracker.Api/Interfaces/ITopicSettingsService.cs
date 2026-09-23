namespace DiplomaTracker.Api.Interfaces;

public interface ITopicSettingsService
{
    Task<DateTime?> GetDeadlineAsync();
    Task SetDeadlineAsync(DateTime? deadlineUtc, Guid administratorId);
    Task<bool> IsSelectionOpenAsync();
}
