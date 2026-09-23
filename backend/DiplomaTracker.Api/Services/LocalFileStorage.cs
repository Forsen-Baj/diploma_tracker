using DiplomaTracker.Api.Interfaces;

namespace DiplomaTracker.Api.Services;

public class LocalFileStorage : IFileStorage
{
    private readonly string _rootPath;
    private readonly string _rootPathForComparison;

    public LocalFileStorage(string rootPath)
    {
        _rootPath = Path.GetFullPath(rootPath);
        _rootPathForComparison = _rootPath.EndsWith(Path.DirectorySeparatorChar)
            ? _rootPath
            : _rootPath + Path.DirectorySeparatorChar;
    }

    public async Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var key = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}";
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        try
        {
            await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
            await content.CopyToAsync(file, cancellationToken);
        }
        catch
        {
            // The stream above is already disposed (and the handle released) by the time we get
            // here, since the `await using` unwinds before this catch runs. A partial file may be
            // on disk (disk full, client abort) with a key that was never returned to the caller,
            // so nothing else could ever find and remove it - clean it up now, before rethrowing.
            if (File.Exists(path))
            {
                try
                {
                    File.Delete(path);
                }
                catch (IOException)
                {
                    // Best effort: the original exception is what the caller needs to see.
                }
            }

            throw;
        }

        return key;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(key);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string ResolvePath(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_rootPath, key));
        if (!path.StartsWith(_rootPathForComparison, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Storage key resolves outside the storage root.");
        }

        return path;
    }
}
