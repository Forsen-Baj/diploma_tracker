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
