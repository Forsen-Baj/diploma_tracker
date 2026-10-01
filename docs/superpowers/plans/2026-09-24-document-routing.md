# Document Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user keeps documents and passes them to others for review or signing. A document is with one person at a time, who finishes it, passes it on, or sends it back to someone who worked on it before. Every version and hand-off forms a timeline that everyone involved can read.

**Architecture:** Three entities: `RoutedDocument` (state, owner, holder, purpose, row version), `DocumentVersion` (one stored file each) and `DocumentEvent` (one numbered timeline line each). The timeline is also what the rules read: who handed the document to the holder, who held it before, whether a signer has added the signed copy this turn. That logic sits in a pure `DocumentRules` class. `DocumentService` owns reads, writes and cleanup on account deletion. Every write names the last event sequence the client saw (`expectedSequence`); a stale view is refused with `document.changed`, and the row version catches true races. The existing *Documents* page becomes four sections (for review, for signing, my documents, templates), plus a document page.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-24-review-panels-and-document-routing-design.md` (§4 and §5; §3 is phase 9)

**Prerequisites:** phase 9 (`docs/superpowers/plans/2026-09-24-review-panels.md`) implemented and committed as `Implement review panels`.

## Global Constraints

- Every role (administrator, teacher, student) has documents.
- One holder at a time. A hand-off is either for `Review` or for `Signing`.
- States: `WithOwner` (the owner holds it), `InCirculation` (a recipient holds it, with a purpose), `Completed` (no holder).
- Recipients: any active user other than the caller. A student sends and forwards only to staff (teachers and administrators). An archived student's account is never a recipient.
- Signing turn: *Forward* and *Done* require a version the holder added during this turn, or a file in the same request (`document.signedCopyRequired`). *Reject* never requires one.
- Reject:
  - A comment is required.
  - The target is the owner or someone who held the document before; never the current holder.
  - The default target is the person who handed it over.
  - The target holds it again with the purpose they last had; the owner gets it back as `WithOwner`.
- Recall: the owner, while the document circulates and someone else holds it.
- Delete: the owner, only while the document has never been sent (`document.alreadySent`).
- Versions: the holder at any time; the owner while `WithOwner` or `Completed`. Forward and Done may carry a version in the same request.
- Files: one per version; allowlist `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`/`.jpeg`; at most 20 MB; inspected exactly like supporting files. Downloads are attachments with `X-Content-Type-Options: nosniff`.
- Participants (the owner plus every actor or recipient in the timeline) see the document, its versions and its timeline. Nobody else does — administrators included. A hidden document answers exactly like a missing one (`document.notFound`, 404).
- Every write carries `expectedSequence`, the last timeline sequence the client saw.
- Title at most 200 characters; description and comments at most 2000.
- Every `DateTime` is UTC. Enum values travel as strings.
- Error bodies follow `{ code, message }`. New codes go into `DocumentErrors.All`, `ErrorCatalog` **and** both translation files.
- Account deletion (group deletion of archived students):
  - their own documents are deleted with versions, events and stored files;
  - a document they hold for someone else returns to its owner with a `Recalled` event;
  - their lines in other timelines keep names as text.
- **No unit tests.** The existing test project must still compile and pass.
- **Commits: exactly one**, in the final task: `Implement document routing`. One bare title line.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, `App_Data/` or `.superpowers/sdd/`.
- The local database is recreated (regenerated `InitialCreate`), with the owner's permission.

## Rulings recorded while planning

- **`expectedSequence` implements "a holder who acts on a stale view"** (§4.2). Every write body or form carries it. The detail response returns `sequence`, the number of the last timeline event.
- **`document.fileMissing` (400)** is added for a create or version upload with no file. The `file.*` codes cover a bad file.
- **A comment is required on Reject** through model validation (`validation.failed` with the `comment` field), not a separate code.
- **Enum values are strings on the wire in both directions.** The API has no global enum converter, so `purpose` is received as a string and parsed, returning `validation.failed` when unknown.
- **A document handed back by account deletion** gets a `Recalled` event with no actor id, and the departing holder's name as `actorName`. The timeline shows it as "returned to the owner because {name}'s account was removed".
- **A version is served with its document type** (`.pdf`, `.docx`, `.pptx`); an image is served as `application/octet-stream`, the same rule as supporting files.
- **Lists are not paged.** Each box is one user's own documents.
- **The existing Documents page is split, not replaced.** Its template list and dialogs move unchanged into `TemplatesSection`, and `templates.title` becomes "Templates".
- **The navigation badge** is fetched by the shell on every route change. It is a hint: a failed read leaves the last value.
- **Only the owner may edit** the title and description, while the document is `WithOwner`. The spec lists `PUT` for exactly this.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/RoutedDocument.cs`, `DocumentVersion.cs`, `DocumentEvent.cs`, `DocumentState.cs`, `DocumentPurpose.cs`, `DocumentEventKind.cs` | Domain |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Services/DocumentRules.cs` | Pure timeline rules |
| `backend/DiplomaTracker.Api/Services/DocumentErrors.cs`, `Errors/ErrorCatalog.cs`, `Services/SecurityLog.cs`, `Services/SubmissionFileRules.cs` | Codes, log event, content type |
| `backend/DiplomaTracker.Api/DTOs/Documents/*` | Contracts |
| `backend/DiplomaTracker.Api/Interfaces/IDocumentService.cs`, `Services/DocumentService.cs` | Reads, writes, account cleanup |
| `backend/DiplomaTracker.Api/Controllers/DocumentsController.cs`, `DocumentVersionsController.cs`, `Program.cs` | HTTP and registration |
| `backend/DiplomaTracker.Api/Services/GroupService.cs`, `DTOs/Groups/GroupDeletionPreviewResponse.cs` | Account deletion and its preview |
| `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs` | Constructor update only |
| `.superpowers/checks/document-routing-check.mjs` (new) | Endpoint verification |
| `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md` | Demo documents |
| `frontend/diploma-tracker-web/src/api/types.ts`, `documentsApi.ts` (new) | Client |
| `frontend/diploma-tracker-web/src/components/layout/navigation.ts`, `TabNav.tsx`, `AppShell.tsx`, `useDocumentCounts.ts` (new) | Navigation badge |
| `frontend/diploma-tracker-web/src/pages/DocumentsPage.tsx`, `DocumentPage.tsx` (new), `GroupsPage.tsx`, `App.tsx` | Pages and route |
| `frontend/diploma-tracker-web/src/components/documents/TemplatesSection.tsx`, `DocumentBox.tsx`, `MyDocumentsSection.tsx`, `NewDocumentDialog.tsx`, `PersonPicker.tsx`, `DocumentActionDialog.tsx`, `DocumentTimeline.tsx` (all new) | Sections, dialogs, timeline |
| `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json` | Translations |
| `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md` | Project records |

---

### Task 1: Document model, rules and service

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/DocumentState.cs`, `DocumentPurpose.cs`, `DocumentEventKind.cs`, `RoutedDocument.cs`, `DocumentVersion.cs`, `DocumentEvent.cs`
- Create: `backend/DiplomaTracker.Api/Services/DocumentRules.cs`, `DocumentErrors.cs`, `DocumentService.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IDocumentService.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Documents/DocumentResponses.cs`, `DocumentRequests.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Errors/ErrorCatalog.cs`, `Services/SecurityLog.cs`, `Services/SubmissionFileRules.cs`, `Program.cs`

**Interfaces:**
- Produces: `IDocumentService` (below), `DocumentRules`, `DocumentErrors.*`, `SecurityLog.DocumentAction`, `SubmissionFileRules.DocumentContentType(string fileName)`, `AppDbContext.RoutedDocuments`, `.DocumentVersions`, `.DocumentEvents`.

- [ ] **Step 1: Entities**

`Entities/DocumentState.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum DocumentState
{
    WithOwner,
    InCirculation,
    Completed
}
```

`Entities/DocumentPurpose.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum DocumentPurpose
{
    Review,
    Signing
}
```

`Entities/DocumentEventKind.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum DocumentEventKind
{
    Created,
    VersionAdded,
    Sent,
    Forwarded,
    Done,
    Rejected,
    Recalled
}
```

`Entities/RoutedDocument.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-24 §4.1. A document is with one person at a time: the owner while WithOwner, the
/// recipient while InCirculation (with a purpose), nobody once Completed.
public class RoutedDocument
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DocumentState State { get; set; }
    public Guid? HolderId { get; set; }
    public DocumentPurpose? Purpose { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public AppUser Owner { get; set; } = null!;
    public AppUser? Holder { get; set; }
    public ICollection<DocumentVersion> Versions { get; set; } = new List<DocumentVersion>();
    public ICollection<DocumentEvent> Events { get; set; } = new List<DocumentEvent>();
}
```

`Entities/DocumentVersion.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class DocumentVersion
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int Number { get; set; }

    /// Set to null when the uploader's account is deleted (§4.5); the name stays as text.
    public Guid? UploadedById { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
    public RoutedDocument Document { get; set; } = null!;
}
```

`Entities/DocumentEvent.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// One line of a document's timeline (§4.1). The ids are set to null when that account is deleted;
/// the names are kept as text, so the timeline still reads the same.
public class DocumentEvent
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int Sequence { get; set; }
    public DocumentEventKind Kind { get; set; }
    public Guid? ActorId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public Guid? RecipientId { get; set; }
    public string? RecipientName { get; set; }
    public DocumentPurpose? Purpose { get; set; }
    public string? Comment { get; set; }
    public int? VersionNumber { get; set; }
    public DateTime At { get; set; }
    public RoutedDocument Document { get; set; } = null!;
}
```

- [ ] **Step 2: Mapping**

In `Data/AppDbContext.cs` add the sets:

```csharp
    public DbSet<RoutedDocument> RoutedDocuments => Set<RoutedDocument>();
    public DbSet<DocumentVersion> DocumentVersions => Set<DocumentVersion>();
    public DbSet<DocumentEvent> DocumentEvents => Set<DocumentEvent>();
```

and before the closing brace of `OnModelCreating`:

```csharp
        var routedDocument = modelBuilder.Entity<RoutedDocument>();
        routedDocument.ToTable("RoutedDocuments");
        routedDocument.HasKey(x => x.Id);
        routedDocument.Property(x => x.Title).HasMaxLength(200).IsRequired();
        routedDocument.Property(x => x.Description).HasMaxLength(2000);
        routedDocument.Property(x => x.State).HasConversion<string>().HasMaxLength(50).IsRequired();
        routedDocument.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(50);
        routedDocument.Property(x => x.CreatedAt).IsRequired();
        routedDocument.Property(x => x.UpdatedAt).IsRequired();
        routedDocument.Property(x => x.RowVersion).IsRowVersion();
        routedDocument.HasIndex(x => new { x.HolderId, x.State, x.Purpose });
        routedDocument.HasIndex(x => x.OwnerId);
        routedDocument.HasOne(x => x.Owner)
            .WithMany()
            .HasForeignKey(x => x.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);
        routedDocument.HasOne(x => x.Holder)
            .WithMany()
            .HasForeignKey(x => x.HolderId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        var documentVersion = modelBuilder.Entity<DocumentVersion>();
        documentVersion.ToTable("DocumentVersions");
        documentVersion.HasKey(x => x.Id);
        // Last + first + patronymic, each up to 100 characters, plus two separating spaces: 302.
        documentVersion.Property(x => x.UploadedByName).HasMaxLength(302).IsRequired();
        documentVersion.Property(x => x.OriginalName).HasMaxLength(255).IsRequired();
        documentVersion.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        documentVersion.Property(x => x.ContentType).HasMaxLength(200).IsRequired();
        documentVersion.Property(x => x.UploadedAt).IsRequired();
        documentVersion.HasIndex(x => new { x.DocumentId, x.Number }).IsUnique();
        documentVersion.HasIndex(x => x.UploadedById);
        documentVersion.HasOne(x => x.Document)
            .WithMany(x => x.Versions)
            .HasForeignKey(x => x.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);
        // No database action: SQL Server refuses a second cascading path from Users, so the
        // account-deletion path nulls these ids itself (DocumentService.ReleaseForDeletedAccountsAsync).
        documentVersion.HasOne<AppUser>()
            .WithMany()
            .HasForeignKey(x => x.UploadedById)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.ClientSetNull);

        var documentEvent = modelBuilder.Entity<DocumentEvent>();
        documentEvent.ToTable("DocumentEvents");
        documentEvent.HasKey(x => x.Id);
        documentEvent.Property(x => x.Kind).HasConversion<string>().HasMaxLength(50).IsRequired();
        documentEvent.Property(x => x.Purpose).HasConversion<string>().HasMaxLength(50);
        documentEvent.Property(x => x.ActorName).HasMaxLength(302).IsRequired();
        documentEvent.Property(x => x.RecipientName).HasMaxLength(302);
        documentEvent.Property(x => x.Comment).HasMaxLength(2000);
        documentEvent.Property(x => x.At).IsRequired();
        // One line per number: two writers who both read sequence 7 cannot both write 8.
        documentEvent.HasIndex(x => new { x.DocumentId, x.Sequence }).IsUnique();
        documentEvent.HasIndex(x => x.ActorId);
        documentEvent.HasIndex(x => x.RecipientId);
        documentEvent.HasOne(x => x.Document)
            .WithMany(x => x.Events)
            .HasForeignKey(x => x.DocumentId)
            .OnDelete(DeleteBehavior.Cascade);
        documentEvent.HasOne<AppUser>()
            .WithMany()
            .HasForeignKey(x => x.ActorId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.ClientSetNull);
        documentEvent.HasOne<AppUser>()
            .WithMany()
            .HasForeignKey(x => x.RecipientId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.ClientSetNull);
```

- [ ] **Step 3: Rules**

`Services/DocumentRules.cs`:

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-24 §4.2. The rules that read a document's timeline. Pure: the service loads the
/// events, this answers, so the detail page and the writes can never disagree.
public static class DocumentRules
{
    public static bool IsHandOff(DocumentEventKind kind) =>
        kind is DocumentEventKind.Sent or DocumentEventKind.Forwarded or DocumentEventKind.Rejected;

    /// The event that gave the current holder the document.
    public static DocumentEvent? CurrentHandOff(IReadOnlyList<DocumentEvent> events) =>
        events.Where(e => IsHandOff(e.Kind)).MaxBy(e => e.Sequence);

    /// On a signing turn, Forward and Done need a version the holder added during this turn - the
    /// signed copy. The turn starts at the hand-off that gave them the document.
    public static bool SignedCopyMissing(RoutedDocument document, IReadOnlyList<DocumentEvent> events)
    {
        if (document.State != DocumentState.InCirculation
            || document.Purpose != DocumentPurpose.Signing
            || document.HolderId is null)
        {
            return false;
        }

        var since = CurrentHandOff(events)?.Sequence ?? 0;
        return !events.Any(e =>
            e.Kind == DocumentEventKind.VersionAdded && e.ActorId == document.HolderId && e.Sequence > since);
    }

    /// Who the holder may send the document back to: the owner and everyone who held it before,
    /// never the holder. The default is whoever handed it over, when they are among them.
    public static (IReadOnlyList<Guid> Candidates, Guid? DefaultId) RejectCandidates(
        Guid ownerId,
        Guid holderId,
        IReadOnlyList<DocumentEvent> events)
    {
        var candidates = events
            .Where(e => IsHandOff(e.Kind) && e.RecipientId is not null)
            .Select(e => e.RecipientId!.Value)
            .Prepend(ownerId)
            .Where(id => id != holderId)
            .Distinct()
            .ToList();

        var from = CurrentHandOff(events)?.ActorId;
        Guid? defaultId = from is { } fromId && candidates.Contains(fromId) ? fromId
            : candidates.Contains(ownerId) ? ownerId
            : candidates.Count > 0 ? candidates[0]
            : null;

        return (candidates, defaultId);
    }

    /// The purpose a person had when they last received the document; they get it back with it.
    public static DocumentPurpose LastPurposeOf(Guid personId, IReadOnlyList<DocumentEvent> events) =>
        events
            .Where(e => IsHandOff(e.Kind) && e.RecipientId == personId && e.Purpose is not null)
            .MaxBy(e => e.Sequence)?.Purpose ?? DocumentPurpose.Review;
}
```

- [ ] **Step 4: Errors, log event, content type, catalogue**

`Services/DocumentErrors.cs`:

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class DocumentErrors
{
    public const string NotFound = "document.notFound";
    public const string NotHolder = "document.notHolder";
    public const string NotOwner = "document.notOwner";
    public const string WrongState = "document.wrongState";
    public const string SignedCopyRequired = "document.signedCopyRequired";
    public const string RecipientInvalid = "document.recipientInvalid";
    public const string RejectTargetInvalid = "document.rejectTargetInvalid";
    public const string AlreadySent = "document.alreadySent";
    public const string Changed = "document.changed";
    public const string FileMissing = "document.fileMissing";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Document not found."),
        new(NotHolder, StatusCodes.Status403Forbidden, "Only the person who holds the document can do this."),
        new(NotOwner, StatusCodes.Status403Forbidden, "Only the document's owner can do this."),
        new(WrongState, StatusCodes.Status409Conflict, "This action does not fit the document's current state."),
        new(SignedCopyRequired, StatusCodes.Status400BadRequest, "Upload the signed copy first."),
        new(RecipientInvalid, StatusCodes.Status400BadRequest, "You cannot send the document to this person."),
        new(RejectTargetInvalid, StatusCodes.Status400BadRequest, "The document can go back only to someone who worked on it before."),
        new(AlreadySent, StatusCodes.Status409Conflict, "A document that has been sent cannot be deleted."),
        new(Changed, StatusCodes.Status409Conflict, "Someone acted on this document first. Reload and try again."),
        new(FileMissing, StatusCodes.Status400BadRequest, "Attach a file.")
    ];
}
```

In `Errors/ErrorCatalog.cs` add `DocumentErrors.All` to the `areas` array after `ArchiveErrors.All`.

In `Services/SecurityLog.cs` add:

```csharp
    /// Action is Created, VersionAdded, Updated, Sent, Forwarded, Rejected, Done, Recalled, Deleted or Downloaded.
    public static void DocumentAction(ILogger logger, Guid actorUserId, string action, Guid documentId) =>
        logger.LogInformation(
            "Document action: ActorUserId={ActorUserId}, Action={Action}, DocumentId={DocumentId}",
            actorUserId, action, documentId);
```

In `Services/SubmissionFileRules.cs` add:

```csharp
    /// Design 2026-09-24 §4.4: a routed document's version is stored with the type its extension
    /// names. Only the three document formats are served as themselves; an image is served as
    /// application/octet-stream, exactly as a supporting file is.
    public static string DocumentContentType(string fileName)
    {
        var (_, extension) = Normalize(fileName);
        return AllowedContentTypes.TryGetValue(extension, out var contentType) ? contentType : "application/octet-stream";
    }
```

- [ ] **Step 5: Contracts**

`DTOs/Documents/DocumentResponses.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Documents;

public class DocumentListItem
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HolderName { get; set; }

    /// Who made the latest hand-off, what they wrote and when.
    public string? FromName { get; set; }
    public string? Comment { get; set; }
    public DateTime? Since { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// The latest hand-off sent it back to the caller.
    public bool IsRejected { get; set; }
}

public class DocumentCountsResponse
{
    public int Review { get; set; }
    public int Signing { get; set; }
}

public class DocumentVersionResponse
{
    public Guid Id { get; set; }
    public int Number { get; set; }
    public string UploadedByName { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
}

public class DocumentEventResponse
{
    public int Sequence { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;

    /// The actor's account no longer exists (a document handed back when it was deleted).
    public bool ActorRemoved { get; set; }
    public string? RecipientName { get; set; }
    public string? Purpose { get; set; }
    public string? Comment { get; set; }
    public int? VersionNumber { get; set; }
    public DateTime At { get; set; }
}

public class DocumentPersonResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsDefault { get; set; }
}

public class DocumentRejectionResponse
{
    public string FromName { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public DateTime At { get; set; }
}

public class DocumentDetailsResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public bool IsOwner { get; set; }
    public string State { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HolderName { get; set; }
    public bool IsHolder { get; set; }

    /// The last timeline sequence; every write sends it back as expectedSequence.
    public int Sequence { get; set; }

    /// Set when the document was sent back to the caller and they hold it now.
    public DocumentRejectionResponse? Rejection { get; set; }
    public IReadOnlyList<DocumentVersionResponse> Versions { get; set; } = [];
    public IReadOnlyList<DocumentEventResponse> Events { get; set; } = [];
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanSend { get; set; }
    public bool CanAddVersion { get; set; }
    public bool CanForward { get; set; }
    public bool CanReject { get; set; }
    public bool CanDone { get; set; }
    public bool CanRecall { get; set; }
    public bool SignedCopyRequired { get; set; }
    public IReadOnlyList<DocumentPersonResponse> RejectTargets { get; set; } = [];
}

public class DocumentRecipientResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string? GroupCode { get; set; }
}
```

`DTOs/Documents/DocumentRequests.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Documents;

public class CreateDocumentForm
{
    [Required]
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    public IFormFile? File { get; set; }
}

public class UpdateDocumentRequest
{
    [Required]
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class AddVersionForm
{
    public IFormFile? File { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class SendDocumentRequest
{
    [Required]
    public Guid? RecipientId { get; set; }

    /// "Review" or "Signing".
    [Required]
    public string? Purpose { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class ForwardDocumentForm
{
    [Required]
    public Guid? RecipientId { get; set; }

    [Required]
    public string? Purpose { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public IFormFile? File { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class RejectDocumentRequest
{
    /// Empty means the default: whoever handed the document over.
    public Guid? TargetId { get; set; }

    [Required]
    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class DoneDocumentForm
{
    [MaxLength(2000)]
    public string? Comment { get; set; }

    public IFormFile? File { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class RecallDocumentRequest
{
    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}
```

- [ ] **Step 6: The service interface**

`Interfaces/IDocumentService.cs`:

```csharp
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
    Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id);
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
```

- [ ] **Step 7: The service**

`Services/DocumentService.cs`:

```csharp
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

    public async Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id)
    {
        var document = await _dbContext.RoutedDocuments
            .Where(ParticipantOf(user.UserId))
            .FirstOrDefaultAsync(d => d.Id == id);

        if (document is null)
        {
            await RefuseIfExistsAsync(user, id, "Document");
            return (false, DocumentErrors.NotFound);
        }

        if (document.OwnerId != user.UserId)
        {
            return (false, DocumentErrors.NotOwner);
        }

        if (await _dbContext.DocumentEvents.AnyAsync(e => e.DocumentId == id && e.Kind == DocumentEventKind.Sent))
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
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
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

    private static bool TryParsePurpose(string value, out DocumentPurpose purpose) =>
        Enum.TryParse(value, ignoreCase: false, out purpose) && Enum.IsDefined(purpose);

    /// §4.2: any active user but the caller; a student sends only to staff; an archived student's
    /// account is never a recipient.
    private IQueryable<AppUser> RecipientsFor(UserContext user)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && u.Id != user.UserId)
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
        var rejectedToMe = last.Kind == DocumentEventKind.Rejected && last.RecipientId == me && document.HolderId == me;
        var ownerOrCompleted = document.State is DocumentState.WithOwner or DocumentState.Completed;

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
            Rejection = rejectedToMe
                ? new DocumentRejectionResponse { FromName = last.ActorName, Comment = last.Comment, At = last.At }
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
```

- [ ] **Step 8: Register the service**

In `Program.cs` add after `IDashboardService`:

```csharp
builder.Services.AddScoped<IDocumentService, DocumentService>();
```

- [ ] **Step 9: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

---

### Task 2: Endpoints and account deletion

**Files:**
- Create: `backend/DiplomaTracker.Api/Controllers/DocumentsController.cs`, `DocumentVersionsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`, `DTOs/Groups/GroupDeletionPreviewResponse.cs`
- Modify: `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`

**Interfaces:**
- Consumes: `IDocumentService` from Task 1.
- Produces: the routes of spec §4.6; `GroupDeletionPreviewResponse.DocumentCount`.

- [ ] **Step 1: The documents controller**

`Controllers/DocumentsController.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Documents;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/documents")]
[Authorize]
public class DocumentsController : ApiControllerBase
{
    // One file of at most 20 MB plus a few short fields.
    private const long MaxDocumentRequestBytes = SubmissionFileRules.MaxFileBytes + 1024 * 1024;

    private readonly IDocumentService _documents;

    public DocumentsController(IDocumentService documents)
    {
        _documents = documents;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? box)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (items, error) = await _documents.ListAsync(user, box);
        return items is null ? ErrorResult(error) : Ok(items);
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts()
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        return Ok(await _documents.CountsAsync(user));
    }

    [HttpGet("recipients")]
    public async Task<IActionResult> Recipients([FromQuery] string? search)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        return Ok(await _documents.SearchRecipientsAsync(user, search));
    }

    [HttpPost]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Create([FromForm] CreateDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.CreateAsync(user, form.Title!, form.Description, form.File, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.GetAsync(user, id);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.UpdateAsync(user, id, request.Title!, request.Description, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (success, error) = await _documents.DeleteAsync(user, id);
        return success ? NoContent() : ErrorResult(error);
    }

    [HttpPost("{id:guid}/versions")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> AddVersion(Guid id, [FromForm] AddVersionForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.AddVersionAsync(user, id, form.File, form.Comment, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/send")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.SendAsync(user, id, request.RecipientId!.Value, request.Purpose!, request.Comment, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/forward")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Forward(Guid id, [FromForm] ForwardDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.ForwardAsync(user, id, form.RecipientId!.Value, form.Purpose!, form.Comment, form.File, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.RejectAsync(user, id, request.TargetId, request.Comment!, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/done")]
    [RequestSizeLimit(MaxDocumentRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxDocumentRequestBytes, MemoryBufferThreshold = 64 * 1024)]
    public async Task<IActionResult> Done(Guid id, [FromForm] DoneDocumentForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.DoneAsync(user, id, form.Comment, form.File, form.ExpectedSequence!.Value, cancellationToken);
        return document is null ? ErrorResult(error) : Ok(document);
    }

    [HttpPost("{id:guid}/recall")]
    public async Task<IActionResult> Recall(Guid id, [FromBody] RecallDocumentRequest request)
    {
        if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);
        var (document, error) = await _documents.RecallAsync(user, id, request.Comment, request.ExpectedSequence!.Value);
        return document is null ? ErrorResult(error) : Ok(document);
    }
}
```

(The one-line `if` guards are for brevity in this controller only. If the project's lint or style check flags them, expand them to the braced form the other controllers use.)

`Controllers/DocumentVersionsController.cs`:

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/document-versions")]
[Authorize]
public class DocumentVersionsController : ApiControllerBase
{
    private readonly IDocumentService _documents;

    public DocumentVersionsController(IDocumentService documents)
    {
        _documents = documents;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _documents.OpenVersionAsync(user, id, cancellationToken);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }
}
```

- [ ] **Step 2: Group deletion releases the documents**

`DTOs/Groups/GroupDeletionPreviewResponse.cs` — add:

```csharp
    /// Documents owned by the archived students whose accounts the deletion removes (design 2026-09-24 §4.5).
    public int DocumentCount { get; set; }
```

`Services/GroupService.cs`:

1. Inject `IDocumentService documents` as the last constructor parameter; store it in `_documents`.

2. In `DeleteGroupAsync`, after the reservations `foreach` and its `SaveChangesAsync`, and before `_dbContext.Users.RemoveRange(...)`, add:

```csharp
        // Design 2026-09-24 §4.5: documents go before the accounts do. A student's own documents
        // are deleted, one they hold for someone else returns to its owner, and their names stay
        // in other people's timelines as text. Stored files are removed only after the commit.
        var releasedKeys = await _documents.ReleaseForDeletedAccountsAsync(profiles.Select(p => p.UserId).ToList(), cancellationToken);
```

3. After `await transaction.CommitAsync(cancellationToken);` add:

```csharp
        await _documents.DeleteStoredFilesAsync(releasedKeys);
```

4. In `GetDeletionPreviewAsync`, before the `return`, add:

```csharp
        var archivedUserIds = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.GroupId == groupId && p.ArchivedAt != null)
            .Select(p => p.UserId)
            .ToListAsync(cancellationToken);
        var documentCount = await _documents.CountOwnedByAsync(archivedUserIds, cancellationToken);
```

and set `DocumentCount = documentCount` in the response.

`backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs` — `CreateService` gains the new argument, and the test's behaviour is unchanged:

```csharp
    private static GroupService CreateService(AppDbContext context) =>
        new(context, NullLogger<GroupService>.Instance, new AccessScope(context),
            new ArchiveService(context, new LocalFileStorage(Path.GetTempPath()), NullLogger<ArchiveService>.Instance),
            new ReservationService(context, new TopicSettingsService(context, NullLogger<TopicSettingsService>.Instance), NullLogger<ReservationService>.Instance),
            new DocumentService(context, new LocalFileStorage(Path.GetTempPath()), NullLogger<DocumentService>.Instance));
```

- [ ] **Step 3: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj && dotnet build backend/DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: both build with 0 errors and 0 warnings.

---

### Task 3: Check script and demo documents

**Files:**
- Create: `.superpowers/checks/document-routing-check.mjs`
- Modify: `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md`

Every document the script creates is owned by a student in a group the script creates. Removing the group therefore removes the documents, and nothing is left behind. Staff accounts can never be deleted; they are only deactivated.

- [ ] **Step 1: The check script**

`.superpowers/checks/document-routing-check.mjs`. Copy the header from `review-panels-check.mjs` unchanged: the imports, `API`, `stamp`, `results`, `authCalls`, `cleanup`, `check`, `paceAuth`, `call`, `login`, the zip writer and the `docx` bytes. Then add:

```js
const pdf = new TextEncoder().encode('%PDF-1.4\n%routing\n')

function docForm(fields, file) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) data.append(key, String(value))
  }
  if (file) data.append('file', new Blob([file.bytes]), file.name)
  return data
}

const docxFile = { bytes: docx, name: 'letter.docx' }
const signedFile = { bytes: pdf, name: 'signed.pdf' }

async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')

  const department = (await call('GET', '/api/departments', { token: admin })).body[0]
  async function makeGroup(code) {
    const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, code, academicYear: '2026/2027', description: '' } })).body
    cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))
    return group
  }
  async function makeStudent(group, key) {
    const email = `doc.${key}.${stamp}@student.local`
    const created = (await call('POST', '/api/students', { token: admin, json: { firstName: key, lastName: `Doc${key}${stamp}`, email, studentNumber: `D${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body
    return { id: created.id, token: await login(email, 'Password1!') }
  }
  async function makeTeacher(key) {
    const email = `doc.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: key, lastName: `Doc${key}${stamp}`, email, password: 'Teacher456!' } })).body.id
    cleanup.add(`teacher ${email} -> deactivate`, () => call('PATCH', `/api/teachers/${id}/deactivate`, { token: admin }))
    return { id, token: await login(email, 'Teacher456!') }
  }
  const userIdOf = async (token, search) => (await call('GET', `/api/documents/recipients?search=${encodeURIComponent(search)}`, { token })).body[0]?.id

  const groupA = await makeGroup(`DA${stamp}`)
  const groupB = await makeGroup(`DB${stamp}`)
  const s1 = await makeStudent(groupA, 'One')
  const s2 = await makeStudent(groupA, 'Two')
  const s3 = await makeStudent(groupB, 'Three')
  const tA = await makeTeacher('Alpha')
  const tB = await makeTeacher('Beta')
  const s1UserId = await userIdOf(tA.token, `DocOne${stamp}`)
  const s2UserId = await userIdOf(tA.token, `DocTwo${stamp}`)
  const adminUserId = await userIdOf(teacher, 'admin@diploma.local')

  const detail = async (token, id) => (await call('GET', `/api/documents/${id}`, { token })).body
  const act = async (token, id, action, fields = {}, file) => {
    const { sequence } = await detail(token, id)
    const multipart = ['forward', 'done', 'versions'].includes(action)
    return call('POST', `/api/documents/${id}/${action}`, multipart
      ? { token, form: docForm({ ...fields, expectedSequence: sequence }, file) }
      : { token, json: { ...fields, expectedSequence: sequence } })
  }

  // ---------- creating ----------
  const created = await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Application', description: 'For the dean' }, docxFile) })
  check('01 a student creates a document', `${created.status} ${created.body.state} ${created.body.versions?.length}`, '200 WithOwner 1')
  const d1 = created.body.id
  check('02 a file is required', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'No file' }) })).body.code, 'document.fileMissing')
  check('03 the file allowlist applies', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Bad' }, { bytes: docx, name: 'tool.exe' }) })).body.code, 'file.typeNotAllowed')
  check('04 a title is required', (await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: ' ' }, docxFile) })).body.code, 'validation.failed')
  check('05 a stranger cannot open it', (await call('GET', `/api/documents/${d1}`, { token: tA.token })).body.code, 'document.notFound')
  const renamed = await call('PUT', `/api/documents/${d1}`, { token: s1.token, json: { title: 'Application to the dean', description: 'Signed by two', expectedSequence: created.body.sequence } })
  check('06 the owner edits it while it is theirs', renamed.body.title, 'Application to the dean')

  // ---------- sending and passing on ----------
  check('07 a student cannot send to a student', (await act(s1.token, d1, 'send', { recipientId: s2UserId, purpose: 'Review' })).body.code, 'document.recipientInvalid')
  const sent = await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review', comment: 'Please check' })
  check('08 sent for review', `${sent.body.state} ${sent.body.purpose} ${sent.body.canRecall}`, 'InCirculation Review true')
  check('09 it waits in the reviewer\'s review box', (await call('GET', '/api/documents?box=review', { token: tA.token })).body.some((d) => d.id === d1), true)
  check('09a and counts there', (await call('GET', '/api/documents/counts', { token: tA.token })).body.review >= 1, true)
  const stale = (await detail(tA.token, d1)).sequence - 1
  check('10 a stale view is refused', (await call('POST', `/api/documents/${d1}/reject`, { token: tA.token, json: { comment: 'x', expectedSequence: stale } })).body.code, 'document.changed')
  check('11 only the holder passes it on', (await act(s1.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing' })).body.code, 'document.notHolder')
  const forwarded = await act(tA.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing', comment: 'Please sign' })
  check('12 passed on for signing', `${forwarded.status} ${forwarded.body.purpose}`, '200 Signing')

  // ---------- signing ----------
  check('13 done needs the signed copy', (await act(tB.token, d1, 'done')).body.code, 'document.signedCopyRequired')
  check('13a so does passing it on', (await act(tB.token, d1, 'forward', { recipientId: adminUserId, purpose: 'Review' })).body.code, 'document.signedCopyRequired')
  const rejected = await act(tB.token, d1, 'reject', { comment: 'Wrong form' })
  check('14 sent back by default to whoever handed it over', `${rejected.body.state} ${rejected.body.holderName?.includes(`DocAlpha${stamp}`)}`, 'InCirculation true')
  const backAtA = await detail(tA.token, d1)
  check('14a with the purpose they had', backAtA.purpose, 'Review')
  check('14b and the rejection shown to them', Boolean(backAtA.rejection), true)
  check('15 a rejection goes only to earlier participants', (await act(tA.token, d1, 'reject', { targetId: crypto.randomUUID(), comment: 'x' })).body.code, 'document.rejectTargetInvalid')
  await act(tA.token, d1, 'forward', { recipientId: tB.id, purpose: 'Signing' })
  const versioned = await act(tB.token, d1, 'versions', { comment: 'Signed' }, signedFile)
  check('16 the signer uploads the signed copy', versioned.body.signedCopyRequired, false)
  const done = await act(tB.token, d1, 'done', { comment: 'Signed and done' })
  check('17 then marks it as done', `${done.body.state} ${done.body.versions.length}`, 'Completed 2')
  check('18 the owner sees it completed', (await detail(s1.token, d1)).state, 'Completed')
  check('18a it is in the reviewer\'s handled box', (await call('GET', '/api/documents?box=handled', { token: tA.token })).body.some((d) => d.id === d1), true)
  check('19 a sent document cannot be deleted', (await call('DELETE', `/api/documents/${d1}`, { token: s1.token })).body.code, 'document.alreadySent')

  // ---------- back to the owner, recall ----------
  await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review' })
  const toOwner = await act(tA.token, d1, 'reject', { targetId: s1UserId, comment: 'Add the date' })
  check('20 sent back to the owner', toOwner.body.state, 'WithOwner')
  check('20a the owner sees why', (await detail(s1.token, d1)).rejection?.comment, 'Add the date')
  await act(s1.token, d1, 'send', { recipientId: tA.id, purpose: 'Review' })
  check('21 the owner takes it back', (await act(s1.token, d1, 'recall')).body.state, 'WithOwner')

  // ---------- files and search ----------
  const versionId = (await detail(s1.token, d1)).versions[1].id
  const download = await call('GET', `/api/document-versions/${versionId}`, { token: tA.token })
  check('22 a participant downloads a version', `${download.status} ${download.headers.get('x-content-type-options')}`, '200 nosniff')
  check('22a as an attachment', (download.headers.get('content-disposition') ?? '').startsWith('attachment'), true)
  check('22b a non-participant cannot', (await call('GET', `/api/document-versions/${versionId}`, { token: s2.token })).status, 404)
  check('23 a student is offered only staff', (await call('GET', '/api/documents/recipients', { token: s1.token })).body.every((r) => r.role !== 'Student'), true)
  check('23a staff are offered students', (await call('GET', `/api/documents/recipients?search=DocTwo${stamp}`, { token: tA.token })).body.some((r) => r.id === s2UserId), true)
  const draft = await call('POST', '/api/documents', { token: s1.token, form: docForm({ title: 'Draft' }, docxFile) })
  check('24 a never-sent document can be deleted', (await call('DELETE', `/api/documents/${draft.body.id}`, { token: s1.token })).status, 204)

  // ---------- account deletion (§4.5) ----------
  const d2 = (await call('POST', '/api/documents', { token: s2.token, form: docForm({ title: 'Own of Two' }, docxFile) })).body.id
  await act(s2.token, d2, 'send', { recipientId: tA.id, purpose: 'Review' })
  const d5 = (await call('POST', '/api/documents', { token: s3.token, form: docForm({ title: 'Own of Three' }, docxFile) })).body.id
  await act(s3.token, d5, 'send', { recipientId: tA.id, purpose: 'Signing' })
  await act(tA.token, d5, 'versions', {}, signedFile)
  await act(tA.token, d5, 'forward', { recipientId: s2UserId, purpose: 'Signing' })

  await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [s1.id, s2.id] } })
  const preview = (await call('GET', `/api/groups/${groupA.id}/deletion-preview`, { token: admin })).body
  check('25 the deletion preview counts their documents', preview.documentCount, 2) // d1 and d2
  await removeGroup(call, admin, groupA)
  check('26 their own documents are gone', (await call('GET', `/api/documents/${d2}`, { token: tA.token })).body.code, 'document.notFound')
  const returned = await detail(s3.token, d5)
  check('27 a document they held returns to its owner', returned.state, 'WithOwner')
  check('27a with a line that says why', `${returned.events.at(-1).kind} ${returned.events.at(-1).actorRemoved}`, 'Recalled true')
  check('27b their name stays in the timeline', returned.events.some((e) => e.recipientName?.includes(`DocTwo${stamp}`)), true)
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 2: Demo documents**

In `.superpowers/demo/seed-demo.mjs`, add after the submissions loop and **before** "Last year's group goes to the archive":

```js
  console.log('Documents...')
  const byName = (lastName) => students.find((x) => x.lastName === lastName)
  const docForm = (fields, file) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.append(key, String(value))
    if (file) form.append('file', new Blob([file.bytes]), file.name)
    return form
  }
  const docFile = (title, paragraphs, name) => ({ bytes: docx(title, paragraphs), name })
  const createDoc = (token, title, description, file) => call('POST', '/api/documents', { token, form: docForm({ title, description }, file) })
  const act = async (token, id, action, fields = {}, file) => {
    const { sequence } = await call('GET', `/api/documents/${id}`, { token })
    return ['forward', 'done', 'versions'].includes(action)
      ? call('POST', `/api/documents/${id}/${action}`, { token, form: docForm({ ...fields, expectedSequence: sequence }, file) })
      : call('POST', `/api/documents/${id}/${action}`, { token, json: { ...fields, expectedSequence: sequence } })
  }

  // Бондаренко asks the supervisor to sign the topic application: waiting in Петренко's signing box.
  const bondarenko = byName('Бондаренко')
  const application = await createDoc(bondarenko.token, 'Заява про затвердження теми дипломної роботи', 'Прошу затвердити тему та призначити керівника.',
    docFile('Заява', ['Прошу затвердити тему дипломної роботи та призначити керівника.'], 'zaiava_bondarenko.docx'))
  await act(bondarenko.token, application.id, 'send', { recipientId: teachers.petrenko.id, purpose: 'Signing', comment: 'Прошу підписати заяву.' })

  // Лисенко's assignment sheet: signed by the supervisor, then by the head of department - completed.
  const lysenko = byName('Лисенко')
  const assignment = await createDoc(lysenko.token, 'Завдання на дипломну роботу', 'Потребує підписів керівника та завідувача кафедри.',
    docFile('Завдання на дипломну роботу', ['Тема, вихідні дані, зміст пояснювальної записки, календарний план.'], 'zavdannia_lysenko.docx'))
  await act(lysenko.token, assignment.id, 'send', { recipientId: teachers.kovalenko.id, purpose: 'Signing', comment: 'Підпишіть, будь ласка.' })
  await act(teachers.kovalenko.token, assignment.id, 'forward', { recipientId: teachers.petrenko.id, purpose: 'Signing', comment: 'Підписано керівником, передаю завідувачу кафедри.' },
    docFile('Завдання на дипломну роботу (підписано керівником)', ['Підпис керівника: Коваленко А. М.'], 'zavdannia_pidpys_kerivnyka.docx'))
  await act(teachers.petrenko.token, assignment.id, 'done', { comment: 'Затверджено.' },
    docFile('Завдання на дипломну роботу (затверджено)', ['Підписи керівника та завідувача кафедри.'], 'zavdannia_zatverdzheno.docx'))

  // Мельник's request is sent back with a remark: the owner sees why.
  const melnyk = byName('Мельник')
  const request = await createDoc(melnyk.token, 'Заява про перенесення терміну етапу', undefined,
    docFile('Заява', ['Прошу перенести термін подання етапу через хворобу.'], 'zaiava_melnyk.docx'))
  await act(melnyk.token, request.id, 'send', { recipientId: teachers.kovalenko.id, purpose: 'Review' })
  await act(teachers.kovalenko.token, request.id, 'reject', { comment: 'Додайте довідку та нову дату.' })

  // A department minute: Петренко asks Коваленко to review; he passes it to Шевчук for signing.
  const minute = await createDoc(teachers.petrenko.token, 'Протокол засідання кафедри № 3', 'Затвердження тем дипломних робіт.',
    docFile('Протокол засідання кафедри № 3', ['Слухали: про затвердження тем дипломних робіт.', 'Ухвалили: затвердити.'], 'protokol_3.docx'))
  await act(teachers.petrenko.token, minute.id, 'send', { recipientId: teachers.kovalenko.id, purpose: 'Review', comment: 'Перевірте формулювання.' })
  await act(teachers.kovalenko.token, minute.id, 'forward', { recipientId: teachers.shevchuk.id, purpose: 'Signing', comment: 'Зауважень немає, прошу підписати як секретаря.' })
```

In `.superpowers/demo/README.md`, add a section:

```markdown
### Documents

- Петренко: *For signing* holds Бондаренко's topic application; the navigation shows a badge.
- Лисенко: *My documents* shows the assignment sheet **Completed**. Its history reads: sent to Коваленко for signing, passed to Петренко with the signed copy, marked done with the final version.
- Мельник: *My documents* shows the request sent back by Коваленко with the remark at the top.
- Шевчук: *For signing* holds the department minute, which came via Коваленко's review.
```

- [ ] **Step 3: Syntax check**

```bash
node --check .superpowers/checks/document-routing-check.mjs && node --check .superpowers/demo/seed-demo.mjs
```

Expected: no output.

---

### Task 4: Client, Documents page and document page

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`
- Create: `frontend/diploma-tracker-web/src/api/documentsApi.ts`
- Modify: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`, `TabNav.tsx`, `AppShell.tsx`
- Create: `frontend/diploma-tracker-web/src/components/layout/useDocumentCounts.ts`
- Create: `frontend/diploma-tracker-web/src/components/documents/TemplatesSection.tsx`, `DocumentBox.tsx`, `MyDocumentsSection.tsx`, `NewDocumentDialog.tsx`, `PersonPicker.tsx`, `DocumentActionDialog.tsx`, `DocumentTimeline.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/DocumentsPage.tsx`, `GroupsPage.tsx`, `App.tsx`
- Create: `frontend/diploma-tracker-web/src/pages/DocumentPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json`

- [ ] **Step 1: Types**

Add to `src/api/types.ts`:

```ts
export type DocumentState = 'WithOwner' | 'InCirculation' | 'Completed'
export type DocumentPurpose = 'Review' | 'Signing'
export type DocumentBoxName = 'review' | 'signing' | 'mine' | 'handled'
export type DocumentEventKind = 'Created' | 'VersionAdded' | 'Sent' | 'Forwarded' | 'Done' | 'Rejected' | 'Recalled'

export type DocumentListItem = {
  id: string
  title: string
  ownerName: string
  state: DocumentState
  purpose: DocumentPurpose | null
  holderName: string | null
  fromName: string | null
  comment: string | null
  since: string | null
  updatedAt: string
  isRejected: boolean
}

export type DocumentCounts = {
  review: number
  signing: number
}

export type DocumentVersion = {
  id: string
  number: number
  uploadedByName: string
  originalName: string
  sizeBytes: number
  uploadedAt: string
}

export type DocumentEvent = {
  sequence: number
  kind: DocumentEventKind
  actorName: string
  actorRemoved: boolean
  recipientName: string | null
  purpose: DocumentPurpose | null
  comment: string | null
  versionNumber: number | null
  at: string
}

export type DocumentPerson = {
  id: string
  name: string
  isDefault: boolean
}

export type DocumentDetails = {
  id: string
  title: string
  description: string | null
  ownerName: string
  isOwner: boolean
  state: DocumentState
  purpose: DocumentPurpose | null
  holderName: string | null
  isHolder: boolean
  sequence: number
  rejection: { fromName: string; comment: string | null; at: string } | null
  versions: DocumentVersion[]
  events: DocumentEvent[]
  canEdit: boolean
  canDelete: boolean
  canSend: boolean
  canAddVersion: boolean
  canForward: boolean
  canReject: boolean
  canDone: boolean
  canRecall: boolean
  signedCopyRequired: boolean
  rejectTargets: DocumentPerson[]
}

export type DocumentRecipient = {
  id: string
  name: string
  role: 'Admin' | 'Teacher' | 'Student'
  groupCode: string | null
}
```

Add `documentCount: number` to `GroupDeletionPreview`.

- [ ] **Step 2: API module**

`src/api/documentsApi.ts`:

```ts
import { apiDownload, apiRequest, saveBlob } from './apiClient'
import { UploadNetworkError } from './templatesApi'
import type { DocumentBoxName, DocumentCounts, DocumentDetails, DocumentListItem, DocumentPurpose, DocumentRecipient } from './types'

// Files passed here are already snapshots (`snapshotFile`) taken by the dialog at submit, so a file
// fixed in Word and chosen again uploads its current bytes (PROJECT_MEMORY: never upload a picked
// handle directly).
async function upload<T>(path: string, form: FormData): Promise<T> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body: form })
  } catch (err) {
    if (err instanceof TypeError) throw new UploadNetworkError(err)
    throw err
  }
}

function form(fields: Record<string, string | number | null | undefined>, file?: File | null): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') data.append(key, String(value))
  }
  if (file) data.append('file', file)
  return data
}

export function getDocuments(box: DocumentBoxName): Promise<DocumentListItem[]> {
  return apiRequest<DocumentListItem[]>(`/api/documents?box=${box}`)
}

export function getDocumentCounts(): Promise<DocumentCounts> {
  return apiRequest<DocumentCounts>('/api/documents/counts')
}

export function getDocument(id: string): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}`)
}

export function searchRecipients(search: string): Promise<DocumentRecipient[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const query = params.toString()
  return apiRequest<DocumentRecipient[]>(`/api/documents/recipients${query ? `?${query}` : ''}`)
}

export function createDocument(title: string, description: string, file: File): Promise<DocumentDetails> {
  return upload<DocumentDetails>('/api/documents', form({ title, description: description.trim() }, file))
}

export function updateDocument(id: string, title: string, description: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title, description: description.trim() || null, expectedSequence })
  })
}

export function deleteDocument(id: string): Promise<void> {
  return apiRequest<void>(`/api/documents/${id}`, { method: 'DELETE' })
}

export function addDocumentVersion(id: string, file: File, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/versions`, form({ comment: comment.trim(), expectedSequence }, file))
}

export function sendDocument(id: string, recipientId: string, purpose: DocumentPurpose, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ recipientId, purpose, comment: comment.trim() || null, expectedSequence })
  })
}

export function forwardDocument(
  id: string,
  recipientId: string,
  purpose: DocumentPurpose,
  comment: string,
  file: File | null,
  expectedSequence: number
): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/forward`, form({ recipientId, purpose, comment: comment.trim(), expectedSequence }, file))
}

export function rejectDocument(id: string, targetId: string | null, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ targetId, comment: comment.trim(), expectedSequence })
  })
}

export function completeDocument(id: string, comment: string, file: File | null, expectedSequence: number): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/done`, form({ comment: comment.trim(), expectedSequence }, file))
}

export function recallDocument(id: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/recall`, {
    method: 'POST',
    body: JSON.stringify({ expectedSequence })
  })
}

export async function downloadDocumentVersion(versionId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/document-versions/${versionId}`)
  saveBlob(blob, fileName ?? fallbackName)
}
```

- [ ] **Step 3: The navigation badge**

`src/components/layout/navigation.ts` — extend `NavItem`, and mark every `/documents` item:

```ts
export type NavItem = {
  to: string
  labelKey: NavLabelKey
  /** Shows the number of documents waiting for the signed-in user. */
  badge?: 'documents'
}
```

In all three role lists change `{ to: '/documents', labelKey: 'nav.documents' }` to `{ to: '/documents', labelKey: 'nav.documents', badge: 'documents' }`.

`src/components/layout/useDocumentCounts.ts`:

```ts
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getDocumentCounts } from '../../api/documentsApi'

/** Documents waiting for the user (review + signing), re-read on every route change. The badge is a
 *  hint: a failed read keeps the last value rather than showing an error in the header. */
export function useDocumentCounts(enabled: boolean): number {
  const location = useLocation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let isCurrent = true
    getDocumentCounts()
      .then((counts) => {
        if (isCurrent) setCount(counts.review + counts.signing)
      })
      .catch(() => undefined)
    return () => {
      isCurrent = false
    }
  }, [enabled, location.pathname, location.search])

  return count
}
```

`src/components/layout/TabNav.tsx` — replace the file:

```tsx
import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

export type TabItem = {
  to: string
  label: string
  badge?: number
  badgeLabel?: string
}

export function TabNav({ items }: { items: TabItem[] }) {
  return (
    <nav className="flex items-center justify-center gap-8">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-1.5 border-b-2 py-1 text-sm text-text-strong transition-colors',
              isActive ? 'border-text-strong font-bold' : 'border-transparent font-medium hover:text-accent'
            )
          }
        >
          {item.label}
          {item.badge ? (
            <span
              aria-label={item.badgeLabel}
              className="inline-flex min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-accent-contrast"
            >
              {item.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}
```

`src/components/layout/AppShell.tsx` — compute the items with the badge:

```tsx
  const waitingDocuments = useDocumentCounts(Boolean(user))
  const items = user
    ? navigationByRole[user.role].map((item) => ({
        to: item.to,
        label: t(item.labelKey),
        badge: item.badge === 'documents' ? waitingDocuments : undefined,
        badgeLabel: item.badge === 'documents' ? t('nav.documentsWaiting', { count: waitingDocuments }) : undefined
      }))
    : []
```

(import `useDocumentCounts` from `./useDocumentCounts`).

- [ ] **Step 4: Move the templates list into a section**

Create `src/components/documents/TemplatesSection.tsx` by moving the whole of today's `pages/DocumentsPage.tsx` into it:
- Rename `DocumentsPage` to `TemplatesSection`.
- Adjust the import paths one level deeper (`'../api/…'` → `'../../api/…'`, `'../components/ui/…'` → `'../ui/…'`, `'../components/documents/…'` → `'./…'`, `'../auth/useAuth'` → `'../../auth/useAuth'`).
- Replace the `<PageHeader … />` and the `<Card>` that follows it with one card. The rest of the JSX (the table, dialogs, confirm) is unchanged:

```tsx
      <Card
        title={t('templates.title')}
        actions={canCreate ? <Button icon={FilePlus2} onClick={openCreate}>{t('templates.add')}</Button> : undefined}
      >
        <p className="mb-4 text-sm text-text-muted">{t('templates.subtitle')}</p>
        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={templates}
            getRowKey={(template) => template.id}
            loading={isLoading}
            emptyState={<EmptyState icon={FileText} message={t('templates.empty')} />}
          />
        )}
      </Card>
```

Remove the now unused `PageHeader` import.

- [ ] **Step 5: The lists**

`src/components/documents/DocumentBox.tsx`:

```tsx
import { FileText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getDocuments } from '../../api/documentsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge } from '../ui/Badge'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { documentStateTone } from './documentTones'
import type { DocumentBoxName, DocumentListItem } from '../../api/types'

export function DocumentBox({ box }: { box: DocumentBoxName }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [items, setItems] = useState<DocumentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getDocuments(box)
        if (requestRef.current !== requestId) return
        setItems(data)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box])

  const titleCell = (item: DocumentListItem) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-text-strong">{item.title}</span>
      {item.isRejected && <Badge tone="warning">{t('documents.rejectedBadge')}</Badge>}
    </div>
  )

  const inbox: DataTableColumn<DocumentListItem>[] = [
    { key: 'title', header: t('documents.columns.title'), render: titleCell },
    { key: 'owner', header: t('documents.columns.owner'), render: (item) => item.ownerName },
    { key: 'from', header: t('documents.columns.from'), render: (item) => item.fromName ?? '' },
    { key: 'since', header: t('documents.columns.since'), render: (item) => (item.since ? dateTimeFormat.format(new Date(item.since)) : '') },
    { key: 'comment', header: t('documents.columns.comment'), render: (item) => item.comment ?? '' }
  ]

  const overview: DataTableColumn<DocumentListItem>[] = [
    { key: 'title', header: t('documents.columns.title'), render: titleCell },
    ...(box === 'handled' ? [{ key: 'owner', header: t('documents.columns.owner'), render: (item: DocumentListItem) => item.ownerName }] : []),
    {
      key: 'state',
      header: t('documents.columns.state'),
      render: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={documentStateTone[item.state]}>{t(`documents.state.${item.state}`)}</Badge>
          {item.purpose && <Badge tone="neutral">{t(`documents.purpose.${item.purpose}`)}</Badge>}
        </div>
      )
    },
    { key: 'holder', header: t('documents.columns.holder'), render: (item) => item.holderName ?? '—' },
    { key: 'updatedAt', header: t('documents.columns.updatedAt'), render: (item) => dateTimeFormat.format(new Date(item.updatedAt)) }
  ]

  if (loadError) {
    return <p className="text-sm text-danger">{loadError}</p>
  }

  return (
    <DataTable
      columns={box === 'review' || box === 'signing' ? inbox : overview}
      rows={items}
      getRowKey={(item) => item.id}
      loading={isLoading}
      emptyState={<EmptyState icon={FileText} message={t(`documents.empty.${box}`)} />}
      onRowClick={(item) => navigate(`/documents/${item.id}`)}
    />
  )
}
```

Create `src/components/documents/documentTones.ts`:

```ts
import type { BadgeTone } from '../ui/Badge'
import type { DocumentState } from '../../api/types'

export const documentStateTone: Record<DocumentState, BadgeTone> = {
  WithOwner: 'neutral',
  InCirculation: 'info',
  Completed: 'success'
}
```

`src/components/documents/MyDocumentsSection.tsx`:

```tsx
import { FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SegmentedControl } from '../ui/SegmentedControl'
import { DocumentBox } from './DocumentBox'
import { NewDocumentDialog } from './NewDocumentDialog'

export function MyDocumentsSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [box, setBox] = useState<'mine' | 'handled'>('mine')
  const [isCreating, setIsCreating] = useState(false)

  return (
    <Card
      title={t('documents.sections.mine')}
      actions={<Button icon={FilePlus2} onClick={() => setIsCreating(true)}>{t('documents.new')}</Button>}
    >
      <div className="mb-4">
        <SegmentedControl
          size="sm"
          ariaLabel={t('documents.mineSwitchLabel')}
          value={box}
          onChange={(value) => setBox(value as 'mine' | 'handled')}
          options={[
            { value: 'mine', label: t('documents.mineSwitch.mine') },
            { value: 'handled', label: t('documents.mineSwitch.handled') }
          ]}
        />
      </div>
      <DocumentBox key={box} box={box} />
      {isCreating && (
        <NewDocumentDialog
          onClose={() => setIsCreating(false)}
          onCreated={(document) => navigate(`/documents/${document.id}`)}
        />
      )}
    </Card>
  )
}
```

- [ ] **Step 6: The page shell**

Replace `src/pages/DocumentsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getDocumentCounts } from '../api/documentsApi'
import { DocumentBox } from '../components/documents/DocumentBox'
import { MyDocumentsSection } from '../components/documents/MyDocumentsSection'
import { TemplatesSection } from '../components/documents/TemplatesSection'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Spinner } from '../components/ui/Spinner'
import type { DocumentCounts } from '../api/types'

type Section = 'review' | 'signing' | 'mine' | 'templates'
const sections: Section[] = ['review', 'signing', 'mine', 'templates']
const isSection = (value: string | null): value is Section => value !== null && (sections as string[]).includes(value)

export function DocumentsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [counts, setCounts] = useState<DocumentCounts | null>(null)

  useEffect(() => {
    let isCurrent = true
    getDocumentCounts()
      .then((data) => {
        if (isCurrent) setCounts(data)
      })
      .catch(() => {
        if (isCurrent) setCounts({ review: 0, signing: 0 })
      })
    return () => {
      isCurrent = false
    }
  }, [])

  // §4.7: the first section with something waiting opens by default.
  const requested = searchParams.get('section')
  const section: Section | null = isSection(requested)
    ? requested
    : counts === null
      ? null
      : counts.review > 0
        ? 'review'
        : counts.signing > 0
          ? 'signing'
          : 'mine'

  const withCount = (label: string, count: number | undefined) => (count ? `${label} (${count})` : label)

  return (
    <>
      <PageHeader title={t('documents.title')} description={t('documents.subtitle')} />

      <div className="mb-6">
        <SegmentedControl
          ariaLabel={t('documents.sectionsLabel')}
          value={section ?? ''}
          onChange={(value) => setSearchParams({ section: value })}
          options={[
            { value: 'review', label: withCount(t('documents.sections.review'), counts?.review) },
            { value: 'signing', label: withCount(t('documents.sections.signing'), counts?.signing) },
            { value: 'mine', label: t('documents.sections.mine') },
            { value: 'templates', label: t('documents.sections.templates') }
          ]}
        />
      </div>

      {section === null && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {(section === 'review' || section === 'signing') && (
        <Card title={t(`documents.sections.${section}`)}>
          <DocumentBox key={section} box={section} />
        </Card>
      )}
      {section === 'mine' && <MyDocumentsSection />}
      {section === 'templates' && <TemplatesSection />}
    </>
  )
}
```

- [ ] **Step 7: Dialogs and the picker**

`src/components/documents/PersonPicker.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchRecipients } from '../../api/documentsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { cn } from '../ui/cn'
import { Spinner } from '../ui/Spinner'
import { TextField } from '../ui/TextField'
import type { DocumentRecipient } from '../../api/types'

type PersonPickerProps = {
  value: string
  onChange: (id: string) => void
  error?: string
}

export function PersonPicker({ value, onChange, error }: PersonPickerProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<DocumentRecipient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const result = await searchRecipients(search.trim())
        if (requestRef.current !== requestId) return
        setOptions(result)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    const timer = window.setTimeout(() => {
      void load()
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return (
    <div className="flex flex-col gap-2">
      <TextField label={t('documents.fields.recipient')} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('documents.recipientSearch')} error={error} />
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {isLoading && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
      {!isLoading && !loadError && options.length === 0 && <p className="text-sm text-text-muted">{t('documents.recipientEmpty')}</p>}
      {!isLoading && options.length > 0 && (
        <ul role="listbox" aria-label={t('documents.fields.recipient')} className="flex max-h-48 flex-col gap-1 overflow-auto">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.id}
                onClick={() => onChange(option.id)}
                className={cn('w-full rounded-control px-3 py-2 text-left text-sm hover:bg-surface', value === option.id && 'bg-surface font-semibold')}
              >
                <span className="block text-text-strong">{option.name}</span>
                <span className="block text-xs text-text-muted">
                  {t(`roles.${option.role}`)}
                  {option.groupCode ? ` · ${option.groupCode}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

`src/components/documents/NewDocumentDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createDocument } from '../../api/documentsApi'
import { snapshotFile } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { FileInput } from '../ui/FileInput'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import type { DocumentDetails } from '../../api/types'

export const documentFileAccept = '.pdf,.docx,.pptx,.png,.jpg,.jpeg'

type NewDocumentDialogProps = {
  onClose: () => void
  onCreated: (document: DocumentDetails) => void
}

export function NewDocumentDialog({ onClose, onCreated }: NewDocumentDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [titleError, setTitleError] = useState('')
  const [fileError, setFileError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async () => {
    setTitleError(title.trim() ? '' : t('validation.required'))
    setFileError(file ? '' : t('validation.required'))
    if (!title.trim() || !file) return

    setIsSaving(true)
    try {
      let fresh: File
      try {
        fresh = await snapshotFile(file)
      } catch {
        setFileError(t('documents.fileChanged'))
        return
      }
      const document = await createDocument(title.trim(), description, fresh)
      toast.success(t('documents.toasts.created'))
      onCreated(document)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={isSaving ? () => undefined : onClose}
      title={t('documents.newTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button onClick={() => void submit()} loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      <TextField label={t('documents.fields.title')} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} error={titleError} />
      <Textarea label={t('documents.fields.description')} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
      <FileInput label={t('documents.fields.file')} hint={t('documents.fields.fileHint')} accept={documentFileAccept} onChange={(files) => setFile(files[0] ?? null)} error={fileError} />
    </Modal>
  )
}
```

`src/components/documents/DocumentActionDialog.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addDocumentVersion,
  completeDocument,
  forwardDocument,
  rejectDocument,
  sendDocument,
  updateDocument
} from '../../api/documentsApi'
import { snapshotFile } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { FileInput } from '../ui/FileInput'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import { documentFileAccept } from './NewDocumentDialog'
import { PersonPicker } from './PersonPicker'
import type { DocumentDetails, DocumentPurpose } from '../../api/types'

export type DocumentDialogMode = 'send' | 'forward' | 'reject' | 'done' | 'version' | 'edit'

type DocumentActionDialogProps = {
  mode: DocumentDialogMode
  document: DocumentDetails
  onClose: () => void
  onDone: (details: DocumentDetails) => void
}

export function DocumentActionDialog({ mode, document, onClose, onDone }: DocumentActionDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const defaultTarget = document.rejectTargets.find((target) => target.isDefault) ?? document.rejectTargets[0]
  const [recipientId, setRecipientId] = useState('')
  const [purpose, setPurpose] = useState<DocumentPurpose>('Review')
  const [targetId, setTargetId] = useState(defaultTarget?.id ?? '')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(document.title)
  const [description, setDescription] = useState(document.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // A signing turn needs the signed copy on the way out (§4.2); the server enforces it too.
  const fileRequired = mode === 'version' || ((mode === 'forward' || mode === 'done') && document.signedCopyRequired)
  const showsFile = mode === 'version' || mode === 'forward' || mode === 'done'
  const commentRequired = mode === 'reject'

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if ((mode === 'send' || mode === 'forward') && !recipientId) next.recipient = t('validation.required')
    if (mode === 'reject' && !targetId) next.target = t('validation.required')
    if (commentRequired && !comment.trim()) next.comment = t('validation.required')
    if (fileRequired && !file) next.file = t('validation.required')
    if (mode === 'edit' && !title.trim()) next.title = t('validation.required')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      let fresh: File | null = null
      if (file) {
        try {
          fresh = await snapshotFile(file)
        } catch {
          setErrors({ file: t('documents.fileChanged') })
          return
        }
      }

      const sequence = document.sequence
      const details =
        mode === 'send' ? await sendDocument(document.id, recipientId, purpose, comment, sequence)
        : mode === 'forward' ? await forwardDocument(document.id, recipientId, purpose, comment, fresh, sequence)
        : mode === 'reject' ? await rejectDocument(document.id, targetId, comment, sequence)
        : mode === 'done' ? await completeDocument(document.id, comment, fresh, sequence)
        : mode === 'version' ? await addDocumentVersion(document.id, fresh!, comment, sequence)
        : await updateDocument(document.id, title.trim(), description, sequence)

      toast.success(t(`documents.toasts.${mode}`))
      onDone(details)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={isSaving ? () => undefined : onClose}
      title={t(`documents.dialog.${mode}`)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button onClick={() => void submit()} loading={isSaving}>{t(`documents.actions.${mode}`)}</Button>
        </>
      }
    >
      {mode === 'edit' && (
        <>
          <TextField label={t('documents.fields.title')} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} error={errors.title} />
          <Textarea label={t('documents.fields.description')} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
        </>
      )}

      {(mode === 'send' || mode === 'forward') && (
        <>
          <PersonPicker value={recipientId} onChange={setRecipientId} error={errors.recipient} />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text-strong">{t('documents.fields.purpose')}</p>
            <SegmentedControl
              ariaLabel={t('documents.fields.purpose')}
              value={purpose}
              onChange={(value) => setPurpose(value as DocumentPurpose)}
              options={[
                { value: 'Review', label: t('documents.purpose.Review') },
                { value: 'Signing', label: t('documents.purpose.Signing') }
              ]}
            />
          </div>
        </>
      )}

      {mode === 'reject' && (
        <Select
          label={t('documents.fields.target')}
          value={targetId}
          onChange={setTargetId}
          options={document.rejectTargets.map((target) => ({ value: target.id, label: target.name }))}
          error={errors.target}
        />
      )}

      {showsFile && (
        <FileInput
          label={document.signedCopyRequired && mode !== 'version' ? t('documents.fields.signedCopy') : t('documents.fields.file')}
          hint={document.signedCopyRequired && mode !== 'version' ? t('documents.fields.signedCopyHint') : t('documents.fields.fileHint')}
          accept={documentFileAccept}
          onChange={(files) => setFile(files[0] ?? null)}
          error={errors.file}
        />
      )}

      {mode !== 'edit' && (
        <Textarea label={t('documents.fields.comment')} value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} error={errors.comment} />
      )}
    </Modal>
  )
}
```

- [ ] **Step 8: Timeline and the document page**

`src/components/documents/DocumentTimeline.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocumentEvent } from '../../api/types'

export function DocumentTimeline({ events }: { events: DocumentEvent[] }) {
  const { t, i18n } = useTranslation()
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const describe = (event: DocumentEvent): string => {
    const params = {
      actor: event.actorName,
      recipient: event.recipientName ?? '',
      purpose: event.purpose ? t(`documents.purposeFor.${event.purpose}`) : '',
      version: event.versionNumber ?? ''
    }
    if (event.kind === 'Recalled' && event.actorRemoved) return t('documents.events.RecalledRemoved', params)
    return t(`documents.events.${event.kind}`, params)
  }

  return (
    <ol className="flex flex-col gap-4">
      {[...events].reverse().map((event) => (
        <li key={event.sequence} className="border-l-2 border-border-subtle pl-4">
          <p className="text-sm text-text-strong">{describe(event)}</p>
          <p className="text-xs text-text-muted">{dateTimeFormat.format(new Date(event.at))}</p>
          {event.comment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{event.comment}</p>}
        </li>
      ))}
    </ol>
  )
}
```

`src/pages/DocumentPage.tsx`:

```tsx
import { ArrowLeft, Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteDocument, downloadDocumentVersion, getDocument, recallDocument } from '../api/documentsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { DocumentActionDialog, type DocumentDialogMode } from '../components/documents/DocumentActionDialog'
import { DocumentTimeline } from '../components/documents/DocumentTimeline'
import { documentStateTone } from '../components/documents/documentTones'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/useToast'
import { formatBytes } from '../components/workflow/formatBytes'
import type { DocumentDetails } from '../api/types'

export function DocumentPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [document, setDocument] = useState<DocumentDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<DocumentDialogMode | null>(null)
  const [confirm, setConfirm] = useState<'recall' | 'delete' | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const requestRef = useRef(0)

  const locale = i18n.language === 'en' ? 'en-GB' : 'uk-UA'
  const dateTimeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale])

  const load = async () => {
    const requestId = ++requestRef.current
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await getDocument(id)
      if (requestRef.current !== requestId) return
      setDocument(data)
    } catch (err) {
      if (requestRef.current !== requestId) return
      setLoadError(errorMessage(err))
    } finally {
      if (requestRef.current === requestId) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const confirmAction = async () => {
    if (!document || !confirm) return
    setIsConfirming(true)
    try {
      if (confirm === 'delete') {
        await deleteDocument(document.id)
        toast.success(t('documents.toasts.deleted'))
        navigate('/documents?section=mine')
        return
      }
      setDocument(await recallDocument(document.id, document.sequence))
      toast.success(t('documents.toasts.recalled'))
      setConfirm(null)
    } catch (err) {
      toast.error(errorMessage(err))
      // A stale view is the likely cause of a refusal here: reload what is there now.
      void load()
      setConfirm(null)
    } finally {
      setIsConfirming(false)
    }
  }

  const download = async (versionId: string, name: string) => {
    setDownloadingId(versionId)
    try {
      await downloadDocumentVersion(versionId, name)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading && !document) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (loadError || !document) {
    return (
      <Card>
        <p className="text-sm text-danger">{loadError || t('errors.server.unexpected')}</p>
      </Card>
    )
  }

  const actions: { mode: DocumentDialogMode; allowed: boolean; primary?: boolean }[] = [
    { mode: 'send', allowed: document.canSend, primary: true },
    { mode: 'forward', allowed: document.canForward, primary: true },
    { mode: 'done', allowed: document.canDone },
    { mode: 'reject', allowed: document.canReject },
    { mode: 'version', allowed: document.canAddVersion },
    { mode: 'edit', allowed: document.canEdit }
  ]
  const hasActions = actions.some((action) => action.allowed) || document.canRecall || document.canDelete

  return (
    <>
      <PageHeader
        title={document.title}
        description={`${t('documents.owner')}: ${document.ownerName}`}
        actions={
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/documents')}>
            {t('documents.back')}
          </Button>
        }
      />

      {document.rejection && (
        <Card className="mb-6 border-warning">
          <p className="text-sm font-semibold text-warning">{t('documents.rejectedTitle', { name: document.rejection.fromName })}</p>
          {document.rejection.comment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{document.rejection.comment}</p>}
        </Card>
      )}

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.columns.state')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge tone={documentStateTone[document.state]}>{t(`documents.state.${document.state}`)}</Badge>
              {document.purpose && <Badge tone="neutral">{t(`documents.purpose.${document.purpose}`)}</Badge>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.holder')}</p>
            <p className="text-sm text-text-strong">{document.holderName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.versions')}</p>
            <p className="text-sm text-text-strong">{document.versions.length}</p>
          </div>
        </div>
        {document.description && <p className="mt-4 whitespace-pre-line text-sm text-text-strong">{document.description}</p>}
      </Card>

      {hasActions && (
        <Card title={t('documents.actions.title')} className="mb-6">
          {document.signedCopyRequired && <p className="mb-3 text-sm text-text-muted">{t('documents.signedCopyNeeded')}</p>}
          <div className="flex flex-wrap gap-2">
            {actions.filter((action) => action.allowed).map((action) => (
              <Button key={action.mode} variant={action.primary ? 'primary' : 'secondary'} onClick={() => setDialog(action.mode)}>
                {t(`documents.actions.${action.mode}`)}
              </Button>
            ))}
            {document.canRecall && <Button variant="secondary" onClick={() => setConfirm('recall')}>{t('documents.actions.recall')}</Button>}
            {document.canDelete && <Button variant="danger" onClick={() => setConfirm('delete')}>{t('documents.actions.delete')}</Button>}
          </div>
        </Card>
      )}

      <Card title={t('documents.versions')} className="mb-6">
        <ul className="flex flex-col divide-y divide-border-subtle">
          {[...document.versions].reverse().map((version) => {
            const size = formatBytes(version.sizeBytes, locale)
            return (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-strong">
                    {t('documents.version', { number: version.number })} · {version.originalName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {version.uploadedByName} · {dateTimeFormat.format(new Date(version.uploadedAt))} · {size.value} {t(`steps.fileSize.${size.unitKey}`)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  loading={downloadingId === version.id}
                  disabled={downloadingId !== null && downloadingId !== version.id}
                  onClick={() => void download(version.id, version.originalName)}
                >
                  {t('templates.download')}
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title={t('documents.timeline')}>
        <DocumentTimeline events={document.events} />
      </Card>

      {dialog && (
        <DocumentActionDialog
          mode={dialog}
          document={document}
          onClose={() => setDialog(null)}
          onDone={(details) => {
            setDialog(null)
            setDocument(details)
          }}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={t(confirm === 'delete' ? 'documents.actions.delete' : 'documents.actions.recall')}
        message={
          confirm === 'delete'
            ? t('documents.deleteConfirm', { title: document.title })
            : t('documents.recallConfirm', { name: document.holderName ?? '' })
        }
        tone={confirm === 'delete' ? 'danger' : 'primary'}
        loading={isConfirming}
        onConfirm={() => void confirmAction()}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
```

`formatBytes` already exists in `components/workflow/formatBytes.ts` and returns `{ value, unitKey }` (used by `StepTimeline`).

- [ ] **Step 9: Route and group deletion dialog**

`App.tsx` — import `DocumentPage` and add the route next to `documents`:

```tsx
          <Route path="documents/:id" element={<DocumentPage />} />
```

`GroupsPage.tsx` — in the delete dialog message, after the `deleteFiles` line add:

```tsx
          {deletionPreview.documentCount > 0 && <p>{t('groups.deleteDocuments', { count: deletionPreview.documentCount })}</p>}
```

- [ ] **Step 10: Translations**

`en.json`: change `templates.title` to `"Templates"`, then merge:

```json
{
  "nav": {
    "documentsWaiting_one": "{{count}} document waits for you",
    "documentsWaiting_other": "{{count}} documents wait for you"
  },
  "groups": {
    "deleteDocuments_one": "{{count}} document owned by these students will be deleted.",
    "deleteDocuments_other": "{{count}} documents owned by these students will be deleted."
  },
  "documents": {
    "title": "Documents",
    "subtitle": "Documents you keep, review and sign, and the templates you can fill in.",
    "sectionsLabel": "Document sections",
    "sections": { "review": "For review", "signing": "For signing", "mine": "My documents", "templates": "Templates" },
    "mineSwitchLabel": "Which documents",
    "mineSwitch": { "mine": "Mine", "handled": "Handled by me" },
    "new": "New document",
    "newTitle": "New document",
    "fields": {
      "title": "Title",
      "description": "Description",
      "file": "File",
      "fileHint": ".pdf, .docx, .pptx, .png or .jpg, up to 20 MB",
      "signedCopy": "Signed copy",
      "signedCopyHint": "The signed document: a scan, or the file signed with an e-signature.",
      "comment": "Comment",
      "recipient": "Recipient",
      "purpose": "Purpose",
      "target": "Send back to"
    },
    "columns": { "title": "Title", "owner": "Owner", "from": "From", "since": "Since", "comment": "Comment", "state": "State", "holder": "With", "updatedAt": "Last activity" },
    "empty": {
      "review": "Nothing waits for your review.",
      "signing": "Nothing waits for your signature.",
      "mine": "You have no documents yet.",
      "handled": "You have not handled anyone else's documents yet."
    },
    "state": { "WithOwner": "With the owner", "InCirculation": "In circulation", "Completed": "Completed" },
    "purpose": { "Review": "Review", "Signing": "Signing" },
    "purposeFor": { "Review": "for review", "Signing": "for signing" },
    "rejectedBadge": "Sent back to you",
    "owner": "Owner",
    "holder": "With",
    "versions": "Versions",
    "version": "Version {{number}}",
    "timeline": "History",
    "back": "Back to documents",
    "rejectedTitle": "Sent back to you by {{name}}",
    "signedCopyNeeded": "You received this document for signing: upload the signed copy when you pass it on or mark it as done.",
    "actions": {
      "title": "Actions",
      "send": "Send",
      "forward": "Pass on",
      "reject": "Send back",
      "done": "Mark as done",
      "version": "Upload new version",
      "edit": "Edit",
      "recall": "Take back",
      "delete": "Delete"
    },
    "dialog": {
      "send": "Send the document",
      "forward": "Pass the document on",
      "reject": "Send the document back",
      "done": "Mark the document as done",
      "version": "Upload a new version",
      "edit": "Edit the document"
    },
    "toasts": {
      "created": "Document created",
      "send": "Document sent",
      "forward": "Document passed on",
      "reject": "Document sent back",
      "done": "Document marked as done",
      "version": "New version uploaded",
      "edit": "Document saved",
      "recalled": "Document taken back",
      "deleted": "Document deleted"
    },
    "recallConfirm": "Take the document back from {{name}}?",
    "deleteConfirm": "Delete \"{{title}}\"? This cannot be undone.",
    "recipientSearch": "Search by name or email",
    "recipientEmpty": "Nobody matches.",
    "fileChanged": "The file changed on disk after you chose it. Choose it again.",
    "events": {
      "Created": "{{actor}} created the document",
      "VersionAdded": "{{actor}} uploaded version {{version}}",
      "Sent": "{{actor}} sent it to {{recipient}} {{purpose}}",
      "Forwarded": "{{actor}} passed it to {{recipient}} {{purpose}}",
      "Rejected": "{{actor}} sent it back to {{recipient}}",
      "Done": "{{actor}} marked it as done",
      "Recalled": "{{actor}} took it back",
      "RecalledRemoved": "It returned to the owner because {{actor}}'s account was removed"
    }
  },
  "errors": {
    "document": {
      "notFound": "Document not found.",
      "notHolder": "Only the person who holds the document can do this.",
      "notOwner": "Only the document's owner can do this.",
      "wrongState": "This action does not fit the document's current state.",
      "signedCopyRequired": "Upload the signed copy first.",
      "recipientInvalid": "You cannot send the document to this person.",
      "rejectTargetInvalid": "The document can go back only to someone who worked on it before.",
      "alreadySent": "A document that has been sent cannot be deleted.",
      "changed": "Someone acted on this document first. Reload and try again.",
      "fileMissing": "Attach a file."
    }
  }
}
```

`uk.json`: change `templates.title` to `"Шаблони"`, then merge (Ukrainian plurals use `one`/`few`/`many`):

```json
{
  "nav": {
    "documentsWaiting_one": "{{count}} документ чекає на вас",
    "documentsWaiting_few": "{{count}} документи чекають на вас",
    "documentsWaiting_many": "{{count}} документів чекають на вас"
  },
  "groups": {
    "deleteDocuments_one": "Буде видалено {{count}} документ цих студентів.",
    "deleteDocuments_few": "Буде видалено {{count}} документи цих студентів.",
    "deleteDocuments_many": "Буде видалено {{count}} документів цих студентів."
  },
  "documents": {
    "title": "Документи",
    "subtitle": "Документи, які ви зберігаєте, переглядаєте й підписуєте, та шаблони для заповнення.",
    "sectionsLabel": "Розділи документів",
    "sections": { "review": "На перегляд", "signing": "На підпис", "mine": "Мої документи", "templates": "Шаблони" },
    "mineSwitchLabel": "Які документи",
    "mineSwitch": { "mine": "Мої", "handled": "Опрацьовані мною" },
    "new": "Новий документ",
    "newTitle": "Новий документ",
    "fields": {
      "title": "Назва",
      "description": "Опис",
      "file": "Файл",
      "fileHint": ".pdf, .docx, .pptx, .png або .jpg, до 20 МБ",
      "signedCopy": "Підписана копія",
      "signedCopyHint": "Підписаний документ: скан або файл, підписаний електронним підписом.",
      "comment": "Коментар",
      "recipient": "Отримувач",
      "purpose": "Мета",
      "target": "Повернути"
    },
    "columns": { "title": "Назва", "owner": "Власник", "from": "Від кого", "since": "Надійшов", "comment": "Коментар", "state": "Стан", "holder": "У кого", "updatedAt": "Остання дія" },
    "empty": {
      "review": "Немає документів на перегляд.",
      "signing": "Немає документів на підпис.",
      "mine": "У вас ще немає документів.",
      "handled": "Ви ще не опрацьовували чужих документів."
    },
    "state": { "WithOwner": "У власника", "InCirculation": "В обігу", "Completed": "Завершено" },
    "purpose": { "Review": "Перегляд", "Signing": "Підпис" },
    "purposeFor": { "Review": "на перегляд", "Signing": "на підпис" },
    "rejectedBadge": "Повернуто вам",
    "owner": "Власник",
    "holder": "У кого",
    "versions": "Версії",
    "version": "Версія {{number}}",
    "timeline": "Історія",
    "back": "До документів",
    "rejectedTitle": "{{name}} повернув(ла) вам документ",
    "signedCopyNeeded": "Документ надіслано вам на підпис: додайте підписану копію, коли передаватимете його далі або завершуватимете.",
    "actions": {
      "title": "Дії",
      "send": "Надіслати",
      "forward": "Передати далі",
      "reject": "Повернути",
      "done": "Завершити",
      "version": "Завантажити нову версію",
      "edit": "Редагувати",
      "recall": "Відкликати",
      "delete": "Видалити"
    },
    "dialog": {
      "send": "Надіслати документ",
      "forward": "Передати документ далі",
      "reject": "Повернути документ",
      "done": "Завершити роботу з документом",
      "version": "Завантажити нову версію",
      "edit": "Редагувати документ"
    },
    "toasts": {
      "created": "Документ створено",
      "send": "Документ надіслано",
      "forward": "Документ передано",
      "reject": "Документ повернуто",
      "done": "Роботу з документом завершено",
      "version": "Нову версію завантажено",
      "edit": "Документ збережено",
      "recalled": "Документ відкликано",
      "deleted": "Документ видалено"
    },
    "recallConfirm": "Відкликати документ у {{name}}?",
    "deleteConfirm": "Видалити «{{title}}»? Цю дію не можна скасувати.",
    "recipientSearch": "Пошук за ім'ям або email",
    "recipientEmpty": "Нікого не знайдено.",
    "fileChanged": "Файл змінився на диску після вибору. Оберіть його ще раз.",
    "events": {
      "Created": "{{actor}} створює документ",
      "VersionAdded": "{{actor}} завантажує версію {{version}}",
      "Sent": "{{actor}} надсилає його {{recipient}} {{purpose}}",
      "Forwarded": "{{actor}} передає його {{recipient}} {{purpose}}",
      "Rejected": "{{actor}} повертає його {{recipient}}",
      "Done": "{{actor}} завершує роботу з документом",
      "Recalled": "{{actor}} відкликає документ",
      "RecalledRemoved": "Документ повернувся власнику, бо обліковий запис {{actor}} видалено"
    }
  },
  "errors": {
    "document": {
      "notFound": "Документ не знайдено.",
      "notHolder": "Це може зробити лише той, у кого зараз документ.",
      "notOwner": "Це може зробити лише власник документа.",
      "wrongState": "Ця дія недоступна в поточному стані документа.",
      "signedCopyRequired": "Спершу завантажте підписану копію.",
      "recipientInvalid": "Цій особі не можна надіслати документ.",
      "rejectTargetInvalid": "Документ можна повернути лише тому, хто вже працював із ним.",
      "alreadySent": "Документ, який уже надсилали, не можна видалити.",
      "changed": "Хтось уже виконав дію з документом. Оновіть сторінку й спробуйте ще раз.",
      "fileMissing": "Додайте файл."
    }
  }
}
```

- [ ] **Step 11: Frontend gates**

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: no type errors; lint 0/0; i18n matching.

---

### Task 5: Schema, verification, records and the commit

**Files:**
- Delete and regenerate: `backend/DiplomaTracker.Api/Migrations/*`
- Modify: `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md`

- [ ] **Step 1: Ask before the database is dropped**

**Stop and ask the owner.** Say what will be lost: every row the seeder does not recreate. Demo data can be reloaded with `node .superpowers/demo/seed-demo.mjs`. Do not continue until they say yes.

- [ ] **Step 2: Drop, regenerate, read**

With the API stopped (`netstat -ano | grep ":5000 .*LISTEN"` prints nothing):

```bash
cd backend && dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

```bash
rm -rf backend/DiplomaTracker.Api/Migrations
```

```bash
cd backend && dotnet ef migrations add InitialCreate --project DiplomaTracker.Api -- --environment Development
```

```bash
grep -n "RoutedDocuments\|DocumentVersions\|DocumentEvents\|IX_DocumentEvents_DocumentId_Sequence\|IX_DocumentVersions_DocumentId_Number\|onDelete: ReferentialAction" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs | grep -i "document"
```

Expected:
- The three tables exist.
- Both named indexes are `unique: true`.
- The `DocumentId` foreign keys are `Cascade`.
- The user foreign keys of `DocumentEvents` and `DocumentVersions` are `NoAction`, not `SetNull` or `Cascade`.

Phase 9's tables (`StudentTaskReviewers`, `SubmissionReviews`, `ArchivedReviews`) are still present.

- [ ] **Step 3: Start and settle**

Ask the controller to start the API, then:

```bash
cd backend && dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api -- --environment Development
```

Expected: `No changes have been made to the model since the last migration.`

- [ ] **Step 4: Full verification**

Record the real output of each command.

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

```bash
node .superpowers/checks/document-routing-check.mjs
```

```bash
for script in review-panels-check workflow-check hardening-check topics-check refinements-check onboarding-check design-system-check templates-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: build 0/0; all tests pass; the frontend gates are clean; every script fully passes and ends with `Cleanup: nothing left behind.`

```bash
node .superpowers/demo/seed-demo.mjs
```

Expected: completes. It now includes the documents of its README's *Documents* section.

- [ ] **Step 5: Project records**

`docs/superpowers/PROJECT_MEMORY.md`:
- **Status table:** phase 10 becomes `Done — commit <hash>` with this plan's path. Phase 7 stays deferred and is next.
- **Gotchas**, add:
  - "**Routed documents are visible to participants only** — the owner and everyone in the timeline. Administrators have no special access. Every write carries `expectedSequence`; a stale view gets `document.changed`."
  - "**Account deletion releases documents first.** `DocumentService.ReleaseForDeletedAccountsAsync` runs inside `GroupService.DeleteGroupAsync`'s transaction. It deletes the student's own documents, returns documents they hold to the owners, and nulls their ids in other timelines; the user foreign keys are `NoAction` because SQL Server refuses a second cascade path. Blobs go only after the commit. It uses `ExecuteDelete`/`ExecuteUpdate`, which the InMemory provider cannot run."
  - "**`templates.title` is \"Templates\";** the *Documents* page is a shell over four sections, and `?section=` selects one."
- **Log:** one dated line for phase 10 with the check count.

`docs/superpowers/test-backlog.md` — add:

```markdown
## Phase 10 — Document routing

- `DocumentRules.SignedCopyMissing`: only on a signing turn; a version added before the current hand-off does not count; one added by someone else does not count.
- `DocumentRules.RejectCandidates`: excludes the holder; default is the hand-off's actor, else the owner; a document forwarded to its owner offers only earlier holders.
- `DocumentRules.LastPurposeOf`: the purpose of the latest hand-off to that person; Review when none.
- Writes: each refused on a stale `expectedSequence`; recipient rules (student → student refused, archived student refused, self refused); delete refused once sent; owner edit only while `WithOwner`; version upload allowed to the holder and to the owner while `WithOwner`/`Completed`.
- Concurrency: two holders' writes on the same sequence yield one success and one `document.changed`; the files stored by the loser are deleted.
- Visibility: a non-participant (administrators included) gets `document.notFound` for the document and its versions.
- Account deletion (needs SQL Server or SQLite - InMemory cannot run `ExecuteDelete`): own documents and blobs removed after commit; held documents returned with a `Recalled` event with no actor id; ids nulled, names kept.
- Frontend: default section chooses review, then signing, then mine; the badge keeps its last value on a failed read.
```

- [ ] **Step 6: Commit**

```bash
git add -A
```

```bash
git status --short
```

Check the list: `.superpowers/checks/document-routing-check.mjs` is present; `.superpowers/sdd/`, `App_Data/`, `bin/` and `obj/` are absent.

```bash
git commit -m "Implement document routing"
```

- [ ] **Step 7: Report and stop**

Report the verification numbers and the commit hash. Say that **the other machine must drop its database** when it next pulls. Then give the owner a plain-language list for manual testing:
- **Everyone:** *Documents* shows *For review*, *For signing*, *My documents* and *Templates*, and a badge counts what waits.
- **Owner:** create a document, send it for review or signing, take it back, edit it while it is theirs, delete it before it is ever sent.
- **Recipient:** pass it on, send it back (by default to whoever sent it), upload a version, and mark it as done. On a signing turn the signed copy is required.
- **Student:** can send only to teachers and administrators.
- **Group deletion:** the dialog names the documents that will be deleted.

Then stop: phase 7 (preview and commenting) is next and needs its own design.

---

## Plan self-review

- **Spec coverage (§4):**
  - §4.1 model — Task 1, Steps 1–2.
  - §4.2 workflow — Task 1, Steps 3 and 7. Stale views are handled by `expectedSequence`.
  - §4.3 access — `ParticipantOf` in `DocumentService`.
  - §4.4 files — `ValidateFileAsync` and `DocumentContentType`.
  - §4.5 account deletion — `ReleaseForDeletedAccountsAsync` (Task 1), wired and previewed in Task 2.
  - §4.6 API — `DocumentsController` and `DocumentVersionsController`; the error codes are in Task 1, Step 4.
  - §4.7 interface — Task 4: sections, default section, badge, document page, dialogs.
  - §5 — Tasks 3 and 5.
- **Placeholders:** none. Existing-file edits name exact anchors (the `deleteFiles` line in `GroupsPage`, the reservations `foreach` in `DeleteGroupAsync`).
- **Type consistency:**
  - `DocumentDetailsResponse` ↔ `DocumentDetails` (every `can*` flag, `sequence`, `rejection`, `rejectTargets`).
  - `DocumentListItem` fields are identical on both sides.
  - `DocumentDialogMode` values match the `documents.actions.*`, `documents.dialog.*` and `documents.toasts.*` keys (`send`, `forward`, `reject`, `done`, `version`, `edit`), plus `toasts.created`, `recalled` and `deleted` for the page's own actions.
