namespace DiplomaTracker.Api.Interfaces;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default);
    Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
}
