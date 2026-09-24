using DiplomaTracker.Api.DTOs.Documents;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDocumentService
{
    Task<(IReadOnlyList<DocumentListItem>? items, string? error)> ListAsync(UserContext user, string? box);
    Task<DocumentCountsResponse> CountsAsync(UserContext user);
    Task<(DocumentDetailsResponse? document, string? error)> GetAsync(UserContext user, Guid id);
    Task<IReadOnlyList<DocumentRecipientResponse>> SearchRecipientsAsync(UserContext user, string? search);
    Task<(StoredFileDownload? file, string? error)> OpenVersionAsync(UserContext user, Guid versionId, CancellationToken cancellationToken);

    Task<(DocumentDetailsResponse? document, string? error)> CreateAsync(UserContext user, string title, string? description, IFormFile? file, CancellationToken cancellationToken);
    Task<(DocumentDetailsResponse? document, string? error)> UpdateAsync(UserContext user, Guid id, string title, string? description, int expectedSequence);
    Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id, int expectedSequence);
    Task<(DocumentDetailsResponse? document, string? error)> AddVersionAsync(UserContext user, Guid id, IFormFile? file, string? comment, int expectedSequence, CancellationToken cancellationToken);
    Task<(DocumentDetailsResponse? document, string? error)> SendAsync(UserContext user, Guid id, Guid recipientId, string purpose, string? comment, int expectedSequence);
    Task<(DocumentDetailsResponse? document, string? error)> ForwardAsync(UserContext user, Guid id, Guid recipientId, string purpose, string? comment, IFormFile? file, int expectedSequence, CancellationToken cancellationToken);
    Task<(DocumentDetailsResponse? document, string? error)> RejectAsync(UserContext user, Guid id, Guid? targetId, string comment, int expectedSequence);
    Task<(DocumentDetailsResponse? document, string? error)> DoneAsync(UserContext user, Guid id, string? comment, IFormFile? file, int expectedSequence, CancellationToken cancellationToken);
    Task<(DocumentDetailsResponse? document, string? error)> RecallAsync(UserContext user, Guid id, string? comment, int expectedSequence);

    /// Design 2026-09-24 §4.5: how many documents the given accounts own - the group deletion preview.
    Task<int> CountOwnedByAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken);

    /// Runs inside the caller's transaction, before the accounts are deleted. Returns the storage
    /// keys of the deleted versions; the caller removes them only after its commit.
    Task<IReadOnlyList<string>> ReleaseForDeletedAccountsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken);
    Task DeleteStoredFilesAsync(IReadOnlyList<string> storageKeys);
}
