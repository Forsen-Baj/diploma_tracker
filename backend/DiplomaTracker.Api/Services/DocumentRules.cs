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
