namespace DiplomaTracker.Api.Interfaces;

public interface IRegistrationService
{
    Task<bool> IsOpenAsync();
    Task SetOpenAsync(bool open);
}
