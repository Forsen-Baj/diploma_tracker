using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Documents;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-24 §4. A document is with one person at a time; everything that happens to it is
/// a numbered line in its timeline, and the timeline is also what the rules read.
public class DocumentService : IDocumentService
{
    private const int RecipientLimit = 20;
    private const int SearchMaxLength = 100;

    private readonly AppDbContext _dbContext;
    private readonly IFileStorage _storage;
    private readonly ILogger<DocumentService> _logger;

    public DocumentService(AppDbContext dbContext, IFileStorage storage, ILogger<DocumentService> logger)
    {
        _dbContext = dbContext;
        _storage = storage;
        _logger = logger;
    }

    /// §4.3: the owner and everyone named in the timeline. Administrators have no special access.
    private static Expression<Func<RoutedDocument, bool>> ParticipantOf(Guid userId) =>
        d => d.OwnerId == userId || d.Events.Any(e => e.ActorId == userId || e.RecipientId == userId);

    // ---------------------------------------------------------------- reads

    public async Task<(IReadOnlyList<DocumentListItem>? items, string? error)> ListAsync(UserContext user, string? box)
    {
        var me = user.UserId;
        var documents = _dbContext.RoutedDocuments.AsNoTracking();

        var query = box switch
        {
            "review" => documents.Where(d => d.State == DocumentState.InCirculation && d.HolderId == me && d.Purpose == DocumentPurpose.Review),
            "signing" => documents.Where(d => d.State == DocumentState.InCirculation && d.HolderId == me && d.Purpose == DocumentPurpose.Signing),
            "mine" => documents.Where(d => d.OwnerId == me),
            "handled" => documents.Where(d => d.OwnerId != me && d.HolderId != me && d.Events.Any(e => e.ActorId == me || e.RecipientId == me)),
            _ => null
        };

        if (query is null)
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var rows = await query
            .OrderByDescending(d => d.UpdatedAt)
            .ThenBy(d => d.Id)
            .Select(d => new
            {
                d.Id,
                d.Title,
                d.State,
                d.Purpose,
                d.UpdatedAt,
                OwnerLastName = d.Owner.LastName,
                OwnerFirstName = d.Owner.FirstName,
                OwnerPatronymic = d.Owner.Patronymic,
                HolderLastName = d.Holder != null ? d.Holder.LastName : null,
                HolderFirstName = d.Holder != null ? d.Holder.FirstName : null,
                HolderPatronymic = d.Holder != null ? d.Holder.Patronymic : null,
                HandOff = d.Events
                    .Where(e => e.Kind == DocumentEventKind.Sent || e.Kind == DocumentEventKind.Forwarded || e.Kind == DocumentEventKind.Rejected)
                    .OrderByDescending(e => e.Sequence)
                    .Select(e => new { e.Kind, e.ActorName, e.RecipientId, e.Comment, e.At })
                    .FirstOrDefault()
            })
            .ToListAsync();

        return (rows.Select(r => new DocumentListItem
        {
            Id = r.Id,
            Title = r.Title,
            OwnerName = JoinName(r.OwnerLastName, r.OwnerFirstName, r.OwnerPatronymic),
            State = r.State.ToString(),
            Purpose = r.Purpose?.ToString(),
            HolderName = r.HolderLastName is null ? null : JoinName(r.HolderLastName, r.HolderFirstName, r.HolderPatronymic),
            FromName = r.HandOff?.ActorName,
            Comment = r.HandOff?.Comment,
            Since = r.HandOff?.At,
            UpdatedAt = r.UpdatedAt,
            IsRejected = r.HandOff is not null && r.HandOff.Kind == DocumentEventKind.Rejected && r.HandOff.RecipientId == me
        }).ToList(), null);
    }

    public async Task<DocumentCountsResponse> CountsAsync(UserContext user)
    {
        var counts = await _dbContext.RoutedDocuments.AsNoTracking()
            .Where(d => d.State == DocumentState.InCirculation && d.HolderId == user.UserId)
            .GroupBy(d => d.Purpose)
            .Select(g => new { Purpose = g.Key, Count = g.Count() })
            .ToListAsync();

        return new DocumentCountsResponse
        {
            Review = counts.FirstOrDefault(c => c.Purpose == DocumentPurpose.Review)?.Count ?? 0,
            Signing = counts.FirstOrDefault(c => c.Purpose == DocumentPurpose.Signing)?.Count ?? 0
        };
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> GetAsync(UserContext user, Guid id)
    {
        var document = await _dbContext.RoutedDocuments.AsNoTracking()
            .Include(d => d.Owner)
            .Include(d => d.Holder)
            .Where(d => d.Id == id)
            .Where(ParticipantOf(user.UserId))
            .FirstOrDefaultAsync();

        if (document is null)
        {
            await RefuseIfExistsAsync(user, id, "Document");
            return (null, DocumentErrors.NotFound);
        }

        return (await BuildDetailsAsync(user, document), null);
    }

    public async Task<IReadOnlyList<DocumentRecipientResponse>> SearchRecipientsAsync(UserContext user, string? search)
    {
        var query = RecipientsFor(user);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            if (trimmed.Length > SearchMaxLength)
            {
                trimmed = trimmed[..SearchMaxLength];
            }

            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = trimmed.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            query = query.Where(u => EF.Functions.Like(u.LastName, $"%{term}%")
                || EF.Functions.Like(u.FirstName, $"%{term}%")
                || EF.Functions.Like(u.Email, $"%{term}%"));
        }

        var rows = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Take(RecipientLimit)
            .Select(u => new
            {
                u.Id,
                u.LastName,
                u.FirstName,
                u.Patronymic,
                u.Role,
                GroupCode = u.StudentProfile != null ? u.StudentProfile.Group.Code : null
            })
            .ToListAsync();

        return rows.Select(r => new DocumentRecipientResponse
        {
            Id = r.Id,
            Name = JoinName(r.LastName, r.FirstName, r.Patronymic),
            Role = r.Role,
            GroupCode = r.GroupCode
        }).ToList();
    }

    public async Task<(StoredFileDownload? file, string? error)> OpenVersionAsync(UserContext user, Guid versionId, CancellationToken cancellationToken)
    {
        var version = await _dbContext.DocumentVersions.AsNoTracking()
            .Where(v => v.Id == versionId)
            .Select(v => new { v.DocumentId, v.StorageKey, v.ContentType, v.OriginalName })
            .FirstOrDefaultAsync(cancellationToken);

        if (version is null)
        {
            return (null, DocumentErrors.NotFound);
        }

        var allowed = await _dbContext.RoutedDocuments.AsNoTracking()
            .Where(d => d.Id == version.DocumentId)
            .Where(ParticipantOf(user.UserId))
            .AnyAsync(cancellationToken);

        if (!allowed)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "DocumentVersion", versionId);
            return (null, DocumentErrors.NotFound);
        }

        var stream = await _storage.OpenReadAsync(version.StorageKey, cancellationToken);
        if (stream is null)
        {
            return (null, DocumentErrors.NotFound);
        }

        SecurityLog.DocumentAction(_logger, user.UserId, "Downloaded", version.DocumentId);
        return (new StoredFileDownload(stream, version.ContentType, version.OriginalName), null);
    }

    // ---------------------------------------------------------------- writes

    public async Task<(DocumentDetailsResponse? document, string? error)> CreateAsync(
        UserContext user,
        string title,
        string? description,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        var fileError = await ValidateFileAsync(file, required: true);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var owner = await _dbContext.Users.AsNoTracking().FirstAsync(u => u.Id == user.UserId, cancellationToken);
        var now = DateTime.UtcNow;
        var document = new RoutedDocument
        {
            Id = Guid.NewGuid(),
            OwnerId = owner.Id,
            HolderId = owner.Id,
            Title = title.Trim(),
            Description = IdentityNormalizer.Optional(description),
            State = DocumentState.WithOwner,
            CreatedAt = now,
            UpdatedAt = now
        };
        _dbContext.RoutedDocuments.Add(document);

        var storedKeys = new List<string>();
        var version = await StoreVersionAsync(document.Id, 1, file!, owner, now, storedKeys, cancellationToken);
        new Timeline(_dbContext, document.Id, 0, now)
            .Add(DocumentEventKind.Created, owner.Id, PersonName.Full(owner), versionNumber: version.Number);

        var saveError = await SaveAsync(storedKeys);
        if (saveError is not null)
        {
            return (null, saveError);
        }

        SecurityLog.DocumentAction(_logger, owner.Id, "Created", document.Id);
        return await GetAsync(user, document.Id);
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> UpdateAsync(
        UserContext user,
        Guid id,
        string title,
        string? description,
        int expectedSequence)
    {
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var document = change.Document;
        if (document.OwnerId != user.UserId)
        {
            return (null, DocumentErrors.NotOwner);
        }

        if (document.State != DocumentState.WithOwner)
        {
            return (null, DocumentErrors.WrongState);
        }

        document.Title = title.Trim();
        document.Description = IdentityNormalizer.Optional(description);
        document.UpdatedAt = change.Now;

        var saveError = await SaveAsync([]);
        if (saveError is not null)
        {
            return (null, saveError);
        }

        SecurityLog.DocumentAction(_logger, user.UserId, "Updated", document.Id);
        return await GetAsync(user, document.Id);
    }

    public async Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id, int expectedSequence)
    {
        // Fix wave I2: delete is a write like any other, so a stale view (a second tab that has not
        // seen a version uploaded since) is refused the same way BeginChangeAsync refuses the rest.
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (false, error);
        }

        var document = change.Document;
        if (document.OwnerId != user.UserId)
        {
            return (false, DocumentErrors.NotOwner);
        }

        if (change.Events.Any(e => e.Kind == DocumentEventKind.Sent))
        {
            return (false, DocumentErrors.AlreadySent);
        }

        var keys = await _dbContext.DocumentVersions.AsNoTracking()
            .Where(v => v.DocumentId == id)
            .Select(v => v.StorageKey)
            .ToListAsync();

        // Versions and events cascade in the database.
        _dbContext.RoutedDocuments.Remove(document);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (false, DocumentErrors.Changed);
        }

        await DeleteStoredFilesAsync(keys);
        SecurityLog.DocumentAction(_logger, user.UserId, "Deleted", id);
        return (true, null);
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> AddVersionAsync(
        UserContext user,
        Guid id,
        IFormFile? file,
        string? comment,
        int expectedSequence,
        CancellationToken cancellationToken)
    {
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var document = change.Document;
        var ownerMayAdd = document.OwnerId == user.UserId && document.State is DocumentState.WithOwner or DocumentState.Completed;
        if (!change.IsHolder && !ownerMayAdd)
        {
            return (null, document.State == DocumentState.InCirculation ? DocumentErrors.NotHolder : DocumentErrors.NotOwner);
        }

        var fileError = await ValidateFileAsync(file, required: true);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var storedKeys = new List<string>();
        var timeline = change.StartTimeline(_dbContext);
        await AddVersionCoreAsync(change, timeline, file!, IdentityNormalizer.Optional(comment), storedKeys, cancellationToken);
        document.UpdatedAt = change.Now;

        var saveError = await SaveAsync(storedKeys);
        if (saveError is not null)
        {
            return (null, saveError);
        }

        SecurityLog.DocumentAction(_logger, user.UserId, "VersionAdded", document.Id);
        return await GetAsync(user, document.Id);
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> SendAsync(
        UserContext user,
        Guid id,
        Guid recipientId,
        string purpose,
        string? comment,
        int expectedSequence)
    {
        if (!TryParsePurpose(purpose, out var parsedPurpose))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var document = change.Document;
        if (document.OwnerId != user.UserId)
        {
            return (null, DocumentErrors.NotOwner);
        }

        if (document.State is not (DocumentState.WithOwner or DocumentState.Completed))
        {
            return (null, DocumentErrors.WrongState);
        }

        var (recipient, recipientError) = await ResolveRecipientAsync(user, recipientId);
        if (recipient is null)
        {
            return (null, recipientError);
        }

        document.State = DocumentState.InCirculation;
        document.HolderId = recipient.Id;
        document.Purpose = parsedPurpose;
        document.UpdatedAt = change.Now;
        change.StartTimeline(_dbContext).Add(
            DocumentEventKind.Sent,
            change.Me.Id,
            PersonName.Full(change.Me),
            recipient.Id,
            PersonName.Full(recipient),
            parsedPurpose,
            IdentityNormalizer.Optional(comment));

        return await FinishAsync(user, document.Id, [], "Sent");
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> ForwardAsync(
        UserContext user,
        Guid id,
        Guid recipientId,
        string purpose,
        string? comment,
        IFormFile? file,
        int expectedSequence,
        CancellationToken cancellationToken)
    {
        if (!TryParsePurpose(purpose, out var parsedPurpose))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var holderError = HolderError(change);
        if (holderError is not null)
        {
            return (null, holderError);
        }

        var fileError = await ValidateFileAsync(file, required: false);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var (recipient, recipientError) = await ResolveRecipientAsync(user, recipientId);
        if (recipient is null)
        {
            return (null, recipientError);
        }

        var document = change.Document;
        if (file is null && DocumentRules.SignedCopyMissing(document, change.Events))
        {
            return (null, DocumentErrors.SignedCopyRequired);
        }

        var storedKeys = new List<string>();
        var timeline = change.StartTimeline(_dbContext);
        if (file is not null)
        {
            await AddVersionCoreAsync(change, timeline, file, null, storedKeys, cancellationToken);
        }

        document.HolderId = recipient.Id;
        document.Purpose = parsedPurpose;
        document.UpdatedAt = change.Now;
        timeline.Add(
            DocumentEventKind.Forwarded,
            change.Me.Id,
            PersonName.Full(change.Me),
            recipient.Id,
            PersonName.Full(recipient),
            parsedPurpose,
            IdentityNormalizer.Optional(comment));

        return await FinishAsync(user, document.Id, storedKeys, "Forwarded");
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> RejectAsync(
        UserContext user,
        Guid id,
        Guid? targetId,
        string comment,
        int expectedSequence)
    {
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var holderError = HolderError(change);
        if (holderError is not null)
        {
            return (null, holderError);
        }

        var document = change.Document;
        var targets = await RejectTargetsAsync(document, change.Events);
        var target = targetId is null
            ? targets.FirstOrDefault(t => t.IsDefault) ?? targets.FirstOrDefault()
            : targets.FirstOrDefault(t => t.Id == targetId);

        if (target is null)
        {
            return (null, DocumentErrors.RejectTargetInvalid);
        }

        DocumentPurpose? purpose = null;
        if (target.Id == document.OwnerId)
        {
            document.State = DocumentState.WithOwner;
            document.HolderId = document.OwnerId;
            document.Purpose = null;
        }
        else
        {
            purpose = DocumentRules.LastPurposeOf(target.Id, change.Events);
            document.HolderId = target.Id;
            document.Purpose = purpose;
        }

        document.UpdatedAt = change.Now;
        change.StartTimeline(_dbContext).Add(
            DocumentEventKind.Rejected,
            change.Me.Id,
            PersonName.Full(change.Me),
            target.Id,
            target.Name,
            purpose,
            comment.Trim());

        return await FinishAsync(user, document.Id, [], "Rejected");
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> DoneAsync(
        UserContext user,
        Guid id,
        string? comment,
        IFormFile? file,
        int expectedSequence,
        CancellationToken cancellationToken)
    {
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var holderError = HolderError(change);
        if (holderError is not null)
        {
            return (null, holderError);
        }

        var fileError = await ValidateFileAsync(file, required: false);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var document = change.Document;
        if (file is null && DocumentRules.SignedCopyMissing(document, change.Events))
        {
            return (null, DocumentErrors.SignedCopyRequired);
        }

        var storedKeys = new List<string>();
        var timeline = change.StartTimeline(_dbContext);
        if (file is not null)
        {
            await AddVersionCoreAsync(change, timeline, file, null, storedKeys, cancellationToken);
        }

        document.State = DocumentState.Completed;
        document.HolderId = null;
        document.Purpose = null;
        document.UpdatedAt = change.Now;
        timeline.Add(DocumentEventKind.Done, change.Me.Id, PersonName.Full(change.Me), comment: IdentityNormalizer.Optional(comment));

        return await FinishAsync(user, document.Id, storedKeys, "Done");
    }

    public async Task<(DocumentDetailsResponse? document, string? error)> RecallAsync(
        UserContext user,
        Guid id,
        string? comment,
        int expectedSequence)
    {
        var (change, error) = await BeginChangeAsync(user, id, expectedSequence);
        if (change is null)
        {
            return (null, error);
        }

        var document = change.Document;
        if (document.OwnerId != user.UserId)
        {
            return (null, DocumentErrors.NotOwner);
        }

        if (document.State != DocumentState.InCirculation || document.HolderId == user.UserId)
        {
            return (null, DocumentErrors.WrongState);
        }

        document.State = DocumentState.WithOwner;
        document.HolderId = document.OwnerId;
        document.Purpose = null;
        document.UpdatedAt = change.Now;
        change.StartTimeline(_dbContext).Add(DocumentEventKind.Recalled, change.Me.Id, PersonName.Full(change.Me), comment: IdentityNormalizer.Optional(comment));

        return await FinishAsync(user, document.Id, [], "Recalled");
    }

    // ---------------------------------------------------------------- account deletion

    public Task<int> CountOwnedByAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.ToList();
        return _dbContext.RoutedDocuments.AsNoTracking().CountAsync(d => ids.Contains(d.OwnerId), cancellationToken);
    }

    public async Task<IReadOnlyList<string>> ReleaseForDeletedAccountsAsync(IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var ids = userIds.ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var now = DateTime.UtcNow;

        // 1. Their own documents go with them, versions and timelines included (§4.5).
        var keys = await _dbContext.DocumentVersions.AsNoTracking()
            .Where(v => ids.Contains(v.Document.OwnerId))
            .Select(v => v.StorageKey)
            .ToListAsync(cancellationToken);
        await _dbContext.RoutedDocuments
            .Where(d => ids.Contains(d.OwnerId))
            .ExecuteDeleteAsync(cancellationToken);

        // 2. A document they hold for someone else returns to its owner, so nobody is left waiting
        // on an account that no longer exists.
        var held = await _dbContext.RoutedDocuments
            .Where(d => d.State == DocumentState.InCirculation && d.HolderId != null && ids.Contains(d.HolderId.Value))
            .ToListAsync(cancellationToken);

        if (held.Count > 0)
        {
            var names = (await _dbContext.Users.AsNoTracking()
                    .Where(u => ids.Contains(u.Id))
                    .ToListAsync(cancellationToken))
                .ToDictionary(u => u.Id, PersonName.Full);

            foreach (var document in held)
            {
                var lastSequence = await _dbContext.DocumentEvents
                    .Where(e => e.DocumentId == document.Id)
                    .MaxAsync(e => e.Sequence, cancellationToken);

                // No actor id: nobody recalled it. The departing holder's name explains why it came back.
                new Timeline(_dbContext, document.Id, lastSequence, now)
                    .Add(DocumentEventKind.Recalled, null, names.GetValueOrDefault(document.HolderId!.Value, string.Empty));

                document.State = DocumentState.WithOwner;
                document.HolderId = document.OwnerId;
                document.Purpose = null;
                document.UpdatedAt = now;
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        // 3. Their lines in other people's timelines keep the names as text; only the ids go.
        await _dbContext.DocumentEvents
            .Where(e => e.ActorId != null && ids.Contains(e.ActorId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.ActorId, (Guid?)null), cancellationToken);
        await _dbContext.DocumentEvents
            .Where(e => e.RecipientId != null && ids.Contains(e.RecipientId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.RecipientId, (Guid?)null), cancellationToken);
        await _dbContext.DocumentVersions
            .Where(v => v.UploadedById != null && ids.Contains(v.UploadedById.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.UploadedById, (Guid?)null), cancellationToken);

        return keys;
    }

    public async Task DeleteStoredFilesAsync(IReadOnlyList<string> storageKeys)
    {
        foreach (var key in storageKeys)
        {
            try
            {
                await _storage.DeleteAsync(key, CancellationToken.None);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                // The rows are gone; a blob that cannot be removed now is only disk space.
                _logger.LogWarning(exception, "Document version blob could not be deleted: StorageKey={StorageKey}", key);
            }
        }
    }

    // ---------------------------------------------------------------- helpers

    /// What one write works on: the tracked document, its timeline as loaded, the caller, and the
    /// moment the write happens.
    private sealed record Change(RoutedDocument Document, List<DocumentEvent> Events, AppUser Me, DateTime Now)
    {
        public bool IsHolder => Document.State == DocumentState.InCirculation && Document.HolderId == Me.Id;

        public Timeline StartTimeline(AppDbContext dbContext) => new(dbContext, Document.Id, Events[^1].Sequence, Now);
    }

    /// Writes numbered lines. Added through the set: a child with a preset Guid reached only through a
    /// tracked parent's collection would be taken for an existing row and updated.
    private sealed class Timeline
    {
        private readonly AppDbContext _dbContext;
        private readonly Guid _documentId;
        private readonly DateTime _at;
        private int _next;

        public Timeline(AppDbContext dbContext, Guid documentId, int lastSequence, DateTime at)
        {
            _dbContext = dbContext;
            _documentId = documentId;
            _at = at;
            _next = lastSequence + 1;
        }

        public void Add(
            DocumentEventKind kind,
            Guid? actorId,
            string actorName,
            Guid? recipientId = null,
            string? recipientName = null,
            DocumentPurpose? purpose = null,
            string? comment = null,
            int? versionNumber = null)
        {
            _dbContext.DocumentEvents.Add(new DocumentEvent
            {
                Id = Guid.NewGuid(),
                DocumentId = _documentId,
                Sequence = _next++,
                Kind = kind,
                ActorId = actorId,
                ActorName = actorName,
                RecipientId = recipientId,
                RecipientName = recipientName,
                Purpose = purpose,
                Comment = comment,
                VersionNumber = versionNumber,
                At = _at
            });
        }
    }

    private async Task<(Change? change, string? error)> BeginChangeAsync(UserContext user, Guid id, int expectedSequence)
    {
        var document = await _dbContext.RoutedDocuments
            .Where(ParticipantOf(user.UserId))
            .FirstOrDefaultAsync(d => d.Id == id);

        if (document is null)
        {
            await RefuseIfExistsAsync(user, id, "Document");
            return (null, DocumentErrors.NotFound);
        }

        var events = await LoadEventsAsync(id);

        // §4.2: a write made on a stale view - someone acted since the page was loaded - is refused
        // rather than applied to a document the caller has not seen.
        if (events.Count == 0 || events[^1].Sequence != expectedSequence)
        {
            return (null, DocumentErrors.Changed);
        }

        var me = await _dbContext.Users.AsNoTracking().FirstAsync(u => u.Id == user.UserId);
        return (new Change(document, events, me, DateTime.UtcNow), null);
    }

    private static string? HolderError(Change change) =>
        change.Document.State != DocumentState.InCirculation ? DocumentErrors.WrongState
        : !change.IsHolder ? DocumentErrors.NotHolder
        : null;

    private Task<List<DocumentEvent>> LoadEventsAsync(Guid documentId) =>
        _dbContext.DocumentEvents.AsNoTracking()
            .Where(e => e.DocumentId == documentId)
            .OrderBy(e => e.Sequence)
            .ToListAsync();

    private async Task<(DocumentDetailsResponse? document, string? error)> FinishAsync(
        UserContext user,
        Guid documentId,
        IReadOnlyList<string> storedKeys,
        string action)
    {
        var saveError = await SaveAsync(storedKeys);
        if (saveError is not null)
        {
            return (null, saveError);
        }

        SecurityLog.DocumentAction(_logger, user.UserId, action, documentId);
        return await GetAsync(user, documentId);
    }

    /// A save that proves nothing committed (a lost race) removes the files this request stored;
    /// any other failure leaves them, because they may belong to a committed version.
    private async Task<string?> SaveAsync(IReadOnlyList<string> storedKeys)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            _dbContext.ChangeTracker.Clear();
            return null;
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            // Fix wave M11: a concurrent owner delete can commit between this write's checks and its
            // save, so the version/event insert hits the FK before the document update reports zero
            // rows. That is a lost race too, not an indeterminate failure.
            || (exception is DbUpdateException update && (update.IsUniqueConstraintViolation() || update.IsForeignKeyViolation())))
        {
            _dbContext.ChangeTracker.Clear();
            await DeleteStoredFilesAsync(storedKeys);
            return DocumentErrors.Changed;
        }
        catch (Exception exception) when (storedKeys.Count > 0)
        {
            _logger.LogWarning(exception,
                "Document save failed with an indeterminate outcome; leaving {StorageKeyCount} stored file(s): {StorageKeys}",
                storedKeys.Count, storedKeys);
            throw;
        }
    }

    private async Task<DocumentVersion> StoreVersionAsync(
        Guid documentId,
        int number,
        IFormFile file,
        AppUser uploader,
        DateTime at,
        List<string> storedKeys,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var key = await _storage.SaveAsync(stream, cancellationToken);
        storedKeys.Add(key);

        var version = new DocumentVersion
        {
            Id = Guid.NewGuid(),
            DocumentId = documentId,
            Number = number,
            UploadedById = uploader.Id,
            UploadedByName = PersonName.Full(uploader),
            OriginalName = SubmissionFileRules.SafeOriginalName(file.FileName),
            StorageKey = key,
            ContentType = SubmissionFileRules.DocumentContentType(file.FileName),
            SizeBytes = file.Length,
            UploadedAt = at
        };
        _dbContext.DocumentVersions.Add(version);
        return version;
    }

    private async Task AddVersionCoreAsync(
        Change change,
        Timeline timeline,
        IFormFile file,
        string? comment,
        List<string> storedKeys,
        CancellationToken cancellationToken)
    {
        var number = (await _dbContext.DocumentVersions
            .Where(v => v.DocumentId == change.Document.Id)
            .MaxAsync(v => (int?)v.Number, cancellationToken) ?? 0) + 1;

        await StoreVersionAsync(change.Document.Id, number, file, change.Me, change.Now, storedKeys, cancellationToken);
        timeline.Add(DocumentEventKind.VersionAdded, change.Me.Id, PersonName.Full(change.Me), comment: comment, versionNumber: number);
    }

    private static async Task<string?> ValidateFileAsync(IFormFile? file, bool required)
    {
        if (file is null)
        {
            return required ? DocumentErrors.FileMissing : null;
        }

        // §4.4: the supporting-file allowlist and inspection, unchanged.
        return await SubmissionFileRules.ValidateSupportingAsync([file]);
    }

    // Fix wave M9: enum values travel as strings on the wire in both directions (ruling). Matching
    // the literal names, rather than Enum.TryParse, refuses "1" the same as any other unknown value -
    // Enum.TryParse("1", …) succeeds and Enum.IsDefined then passes, because 1 is a valid underlying
    // Signing value.
    private static bool TryParsePurpose(string value, out DocumentPurpose purpose)
    {
        if (value is nameof(DocumentPurpose.Review) or nameof(DocumentPurpose.Signing))
        {
            return Enum.TryParse(value, ignoreCase: false, out purpose);
        }

        purpose = default;
        return false;
    }

    /// §4.2: any active user but the caller; a student sends only to staff; an archived student's
    /// account is never a recipient. Fix wave M10: an account that has never been claimed (no
    /// password) cannot open anything it is sent, so it is not offered either.
    private IQueryable<AppUser> RecipientsFor(UserContext user)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && u.Id != user.UserId && u.PasswordHash != null)
            .Where(u => u.Role != "Student" || (u.StudentProfile != null && u.StudentProfile.ArchivedAt == null));

        return user.IsStudent
            ? query.Where(u => u.Role == "Teacher" || u.Role == "Admin")
            : query;
    }

    private async Task<(AppUser? recipient, string? error)> ResolveRecipientAsync(UserContext user, Guid recipientId)
    {
        var recipient = await RecipientsFor(user).FirstOrDefaultAsync(u => u.Id == recipientId);
        return recipient is null ? (null, DocumentErrors.RecipientInvalid) : (recipient, null);
    }

    private async Task<List<DocumentPersonResponse>> RejectTargetsAsync(RoutedDocument document, IReadOnlyList<DocumentEvent> events)
    {
        var (candidates, defaultId) = DocumentRules.RejectCandidates(document.OwnerId, document.HolderId!.Value, events);

        // The owner always qualifies; anyone else must still be able to act on it.
        var people = await _dbContext.Users.AsNoTracking()
            .Where(u => candidates.Contains(u.Id) && (u.IsActive || u.Id == document.OwnerId))
            .ToListAsync();
        var byId = people.ToDictionary(p => p.Id);

        return candidates
            .Where(byId.ContainsKey)
            .Select(id => new DocumentPersonResponse { Id = id, Name = PersonName.Full(byId[id]), IsDefault = id == defaultId })
            .ToList();
    }

    private async Task<DocumentDetailsResponse> BuildDetailsAsync(UserContext user, RoutedDocument document)
    {
        var me = user.UserId;
        var versions = await _dbContext.DocumentVersions.AsNoTracking()
            .Where(v => v.DocumentId == document.Id)
            .OrderBy(v => v.Number)
            .ToListAsync();
        var events = await LoadEventsAsync(document.Id);

        var isOwner = document.OwnerId == me;
        var isHolder = document.State == DocumentState.InCirculation && document.HolderId == me;
        var targets = isHolder ? await RejectTargetsAsync(document, events) : [];
        var last = events[^1];
        // Fix wave M1: the rejection banner is about the turn the holder is on, not the very last
        // line of the timeline - a version the holder uploaded since the rejection must not hide it.
        var lastHandOff = DocumentRules.CurrentHandOff(events);
        var rejectedToMe = lastHandOff is not null && lastHandOff.Kind == DocumentEventKind.Rejected
            && lastHandOff.RecipientId == me && document.HolderId == me;
        var ownerOrCompleted = document.State is DocumentState.WithOwner or DocumentState.Completed;
        // Fix wave M2: §4.2 "Completed - done by {name}"; the actor of the last Done event.
        var completedByName = document.State == DocumentState.Completed
            ? events.LastOrDefault(e => e.Kind == DocumentEventKind.Done)?.ActorName
            : null;

        return new DocumentDetailsResponse
        {
            Id = document.Id,
            Title = document.Title,
            Description = document.Description,
            OwnerName = PersonName.Full(document.Owner),
            IsOwner = isOwner,
            State = document.State.ToString(),
            Purpose = document.Purpose?.ToString(),
            HolderName = document.Holder is null ? null : PersonName.Full(document.Holder),
            IsHolder = isHolder,
            Sequence = last.Sequence,
            CompletedByName = completedByName,
            Rejection = rejectedToMe
                ? new DocumentRejectionResponse { FromName = lastHandOff!.ActorName, Comment = lastHandOff.Comment, At = lastHandOff.At }
                : null,
            Versions = versions.Select(v => new DocumentVersionResponse
            {
                Id = v.Id,
                Number = v.Number,
                UploadedByName = v.UploadedByName,
                OriginalName = v.OriginalName,
                SizeBytes = v.SizeBytes,
                UploadedAt = v.UploadedAt
            }).ToList(),
            Events = events.Select(e => new DocumentEventResponse
            {
                Sequence = e.Sequence,
                Kind = e.Kind.ToString(),
                ActorName = e.ActorName,
                ActorRemoved = e.ActorId is null,
                RecipientName = e.RecipientName,
                Purpose = e.Purpose?.ToString(),
                Comment = e.Comment,
                VersionNumber = e.VersionNumber,
                At = e.At
            }).ToList(),
            CanEdit = isOwner && document.State == DocumentState.WithOwner,
            CanDelete = isOwner && document.State == DocumentState.WithOwner && !events.Any(e => e.Kind == DocumentEventKind.Sent),
            CanSend = isOwner && ownerOrCompleted,
            CanAddVersion = isHolder || (isOwner && ownerOrCompleted),
            CanForward = isHolder,
            CanReject = isHolder && targets.Count > 0,
            CanDone = isHolder,
            CanRecall = isOwner && document.State == DocumentState.InCirculation && document.HolderId != me,
            SignedCopyRequired = isHolder && DocumentRules.SignedCopyMissing(document, events),
            RejectTargets = targets
        };
    }

    private async Task RefuseIfExistsAsync(UserContext user, Guid id, string resource)
    {
        if (await _dbContext.RoutedDocuments.AsNoTracking().AnyAsync(d => d.Id == id))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, resource, id);
        }
    }

    private static string JoinName(params string?[] parts) =>
        string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));
}
