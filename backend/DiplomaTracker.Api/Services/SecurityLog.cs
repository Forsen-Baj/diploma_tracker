using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.3. Every security-relevant event is written through one of these methods, so a
/// line's shape does not depend on which service wrote it. A line never carries a password, a
/// password hash, a token, a file's contents or a connection string. An email address appears
/// only where the account is not yet identified - a failed sign-in or a refused claim - because
/// there is no id to name instead.
public static class SecurityLog
{
    public static void SignInSucceeded(ILogger logger, Guid userId, string role) =>
        logger.LogInformation("Sign-in succeeded: UserId={UserId}, Role={Role}", userId, role);

    /// Reason is one of UnknownAccount, WrongPassword, Inactive, Unclaimed.
    public static void SignInFailed(ILogger logger, string email, string reason) =>
        logger.LogWarning("Sign-in failed: Email={Email}, Reason={Reason}", email, reason);

    /// Reason is one of Missing, Inactive, Unclaimed, RoleChanged, Malformed.
    public static void SessionRejected(ILogger logger, Guid userId, string reason) =>
        logger.LogWarning("Session rejected: UserId={UserId}, Reason={Reason}", userId, reason);

    public static void ClaimSucceeded(ILogger logger, Guid userId, bool reopened) =>
        logger.LogInformation("Account claimed: UserId={UserId}, Reopened={Reopened}", userId, reopened);

    /// Reason is one of DetailsMismatch, RegistrationClosed.
    public static void ClaimRefused(ILogger logger, string email, string reason) =>
        logger.LogWarning("Claim refused: Email={Email}, Reason={Reason}", email, reason);

    public static void PasswordChanged(ILogger logger, Guid userId) =>
        logger.LogInformation("Password changed: UserId={UserId}", userId);

    public static void AccessReset(ILogger logger, Guid studentUserId, Guid administratorId) =>
        logger.LogInformation(
            "Access reset: StudentUserId={StudentUserId}, AdministratorId={AdministratorId}",
            studentUserId, administratorId);

    public static void AccessRefused(ILogger logger, Guid actorUserId, string role, string resource, Guid resourceId) =>
        logger.LogWarning(
            "Access refused: ActorUserId={ActorUserId}, Role={Role}, Resource={Resource}, ResourceId={ResourceId}",
            actorUserId, role, resource, resourceId);

    public static void StudentsImported(ILogger logger, Guid administratorId, int created, int skipped) =>
        logger.LogInformation(
            "Students imported: AdministratorId={AdministratorId}, Created={Created}, Skipped={Skipped}",
            administratorId, created, skipped);

    public static void StudentsArchived(ILogger logger, Guid administratorId, int count, IReadOnlyList<Guid> studentProfileIds) =>
        logger.LogInformation(
            "Students archived: AdministratorId={AdministratorId}, Count={Count}, StudentProfileIds={StudentProfileIds}",
            administratorId, count, studentProfileIds);

    public static void StudentsRestored(ILogger logger, Guid administratorId, int count, IReadOnlyList<Guid> studentProfileIds) =>
        logger.LogInformation(
            "Students restored: AdministratorId={AdministratorId}, Count={Count}, StudentProfileIds={StudentProfileIds}",
            administratorId, count, studentProfileIds);

    /// Action is Created, Updated, Deleted, Activated, Deactivated, PasswordSet or Reordered;
    /// entity is the entity type name (Faculty, Department, Group, TaskTemplate, GroupTask,
    /// Teacher, Administrator, Student, Topic, Settings).
    public static void AdministratorAction(ILogger logger, Guid administratorId, string action, string entity, Guid entityId) =>
        logger.LogInformation(
            "Administrator action: AdministratorId={AdministratorId}, Action={Action}, Entity={Entity}, EntityId={EntityId}",
            administratorId, action, entity, entityId);

    public static void TopicAssigned(ILogger logger, Guid studentProfileId, Guid administratorId, Guid? topicId) =>
        logger.LogInformation(
            "Topic assigned: StudentProfileId={StudentProfileId}, AdministratorId={AdministratorId}, TopicId={TopicId}",
            studentProfileId, administratorId, topicId);

    public static void SubmissionDecided(ILogger logger, Guid reviewerId, Guid submissionId, string decision, int? mark) =>
        logger.LogInformation(
            "Submission decided: ReviewerId={ReviewerId}, SubmissionId={SubmissionId}, Decision={Decision}, Mark={Mark}",
            reviewerId, submissionId, decision, mark);

    public static void FileDownloaded(ILogger logger, Guid actorUserId, Guid fileId, Guid studentProfileId) =>
        logger.LogInformation(
            "File downloaded: ActorUserId={ActorUserId}, FileId={FileId}, StudentProfileId={StudentProfileId}",
            actorUserId, fileId, studentProfileId);

    /// Action is Uploaded, Replaced, Deleted or Generated.
    public static void TemplateAction(ILogger logger, Guid actorUserId, string action, Guid templateId) =>
        logger.LogInformation(
            "Template {Action}: ActorUserId={ActorUserId}, TemplateId={TemplateId}",
            action, actorUserId, templateId);

    public static void GroupDeleted(ILogger logger, Guid administratorId, Guid groupId, string groupCode, int archivedFileCount, int deletedStudentCount) =>
        logger.LogWarning(
            "Group deleted: AdministratorId={AdministratorId}, GroupId={GroupId}, GroupCode={GroupCode}, ArchivedFileCount={ArchivedFileCount}, DeletedStudentCount={DeletedStudentCount}",
            administratorId, groupId, groupCode, archivedFileCount, deletedStudentCount);

    public static void ArchivePurged(ILogger logger, Guid administratorId, Guid archivedGroupId, int fileCount, long bytes) =>
        logger.LogWarning(
            "Archive purged: AdministratorId={AdministratorId}, ArchivedGroupId={ArchivedGroupId}, FileCount={FileCount}, Bytes={Bytes}",
            administratorId, archivedGroupId, fileCount, bytes);
}
