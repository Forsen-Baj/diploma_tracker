using DiplomaTracker.Api.DTOs.Archive;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IArchiveService
{
    /// Copies every submitted file of every student in the group into the archive and marks the
    /// archive as belonging to a deleted group. Adds nothing that is already there. Does not
    /// delete anything; the caller owns the transaction. Returns the number of files archived.
    Task<int> ArchiveGroupAsync(Guid groupId, CancellationToken cancellationToken);

    /// Copies the submitted files of the named students into their group's archive, leaving the
    /// live rows untouched. Returns the number of files archived.
    Task<int> ArchiveStudentsAsync(IReadOnlyList<Guid> studentProfileIds, CancellationToken cancellationToken);

    Task<IReadOnlyList<ArchivedGroupSummaryResponse>> GetGroupsAsync(UserContext user, string? academicYear, string? search);
    Task<(ArchivedGroupDetailsResponse? details, string? error)> GetGroupAsync(UserContext user, Guid id);
    Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken);
    Task<ArchiveUsageResponse> GetUsageAsync();
    Task<(bool success, string? error)> PurgeGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken);
}
