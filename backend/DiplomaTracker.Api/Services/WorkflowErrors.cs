using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class WorkflowErrors
{
    public const string StudentTaskNotYours = "studentTask.notYours";
    public const string TopicRequired = "step.topicRequired";
    public const string PreviousNotApproved = "step.previousNotApproved";
    public const string AwaitingReview = "step.awaitingReview";
    public const string AlreadyApproved = "step.alreadyApproved";
    public const string SubmissionNotFound = "submission.notFound";
    public const string SubmissionAlreadyDecided = "submission.alreadyDecided";
    public const string NotReviewer = "submission.notReviewer";
    public const string MainFileMissing = "file.mainMissing";
    public const string FileTypeNotAllowed = "file.typeNotAllowed";
    public const string FileTooLarge = "file.tooLarge";
    public const string TooManyFiles = "file.tooMany";
    public const string FileContentMismatch = "file.contentMismatch";
    public const string FileNotFound = "file.notFound";
    public const string MarkRequired = "review.markRequired";
    public const string MarkOutOfRange = "review.markOutOfRange";
    public const string CommentRequired = "review.commentRequired";

    public static readonly ErrorDefinition[] All =
    [
        new(StudentTaskNotYours, StatusCodes.Status403Forbidden, "This step belongs to another student."),
        new(TopicRequired, StatusCodes.Status409Conflict, "Choose a topic first: work on the steps starts once your topic is approved."),
        new(PreviousNotApproved, StatusCodes.Status409Conflict, "The previous step must be approved first."),
        new(AwaitingReview, StatusCodes.Status409Conflict, "The latest submission is awaiting review."),
        new(AlreadyApproved, StatusCodes.Status409Conflict, "This step is already approved."),
        new(SubmissionNotFound, StatusCodes.Status404NotFound, "Submission not found."),
        new(SubmissionAlreadyDecided, StatusCodes.Status409Conflict, "This submission has already been decided."),
        new(NotReviewer, StatusCodes.Status403Forbidden, "You are not a reviewer of this student."),
        new(MainFileMissing, StatusCodes.Status400BadRequest, "Attach the main document."),
        new(FileTypeNotAllowed, StatusCodes.Status400BadRequest, "This file type is not allowed."),
        new(FileTooLarge, StatusCodes.Status400BadRequest, "A file is larger than 20 MB."),
        new(TooManyFiles, StatusCodes.Status400BadRequest, "Attach at most three supporting files."),
        new(FileContentMismatch, StatusCodes.Status400BadRequest, "The main document's content does not match its extension."),
        new(FileNotFound, StatusCodes.Status404NotFound, "File not found."),
        new(MarkRequired, StatusCodes.Status400BadRequest, "Enter a mark to approve."),
        new(MarkOutOfRange, StatusCodes.Status400BadRequest, "The mark must be a whole number from 0 to 100."),
        new(CommentRequired, StatusCodes.Status400BadRequest, "Enter a comment to return the work.")
    ];
}
