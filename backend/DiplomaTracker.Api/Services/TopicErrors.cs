using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TopicErrors
{
    public const string TopicNotFound = "topic.notFound";
    public const string TopicInvalid = "topic.invalid";
    public const string TopicNotAvailable = "topic.notAvailable";
    public const string TopicNotInYourDepartment = "topic.notInYourDepartment";
    public const string TopicNotEditable = "topic.notEditable";
    public const string TopicNotOwner = "topic.notOwner";
    public const string TopicAlreadyYours = "topic.alreadyYours";
    public const string TopicSupervisorInvalid = "topic.supervisorInvalid";
    public const string ProposalTeacherInvalid = "proposal.teacherInvalid";
    public const string ReservationNotFound = "reservation.notFound";
    public const string ReservationAlreadyActive = "reservation.alreadyActive";
    public const string ReservationInvalidState = "reservation.invalidState";
    public const string ReservationNotYours = "reservation.notYours";
    public const string ReservationHasSubmissions = "reservation.hasSubmissions";
    public const string ReservationTopicHeld = "reservation.topicHeld";
    public const string SelectionClosed = "selection.closed";
    public const string StudentProfileRequired = "topic.studentProfileRequired";
    public const string ApprovalNotApprover = "approval.notApprover";
    public const string ApprovalSeatSatisfied = "approval.seatSatisfied";
    public const string ReservationChanged = "reservation.changed";

    public static readonly ErrorDefinition[] All =
    [
        new(TopicNotFound, StatusCodes.Status404NotFound, "Topic not found."),
        new(TopicInvalid, StatusCodes.Status400BadRequest, "The selected topic does not exist."),
        new(TopicNotAvailable, StatusCodes.Status409Conflict, "The topic is no longer available."),
        new(TopicNotInYourDepartment, StatusCodes.Status403Forbidden, "The topic belongs to another department."),
        new(TopicNotEditable, StatusCodes.Status409Conflict, "Only available catalogue topics can be changed or deleted."),
        new(TopicNotOwner, StatusCodes.Status403Forbidden, "You can change only topics you supervise."),
        new(TopicAlreadyYours, StatusCodes.Status409Conflict, "This is already your topic."),
        new(TopicSupervisorInvalid, StatusCodes.Status400BadRequest, "The supervisor must be an active teacher."),
        new(ProposalTeacherInvalid, StatusCodes.Status400BadRequest, "The chosen teacher must be an active teacher."),
        new(ReservationNotFound, StatusCodes.Status404NotFound, "Reservation not found."),
        new(ReservationAlreadyActive, StatusCodes.Status409Conflict, "You already have a request awaiting a decision."),
        new(ReservationInvalidState, StatusCodes.Status409Conflict, "The reservation is not in a state that allows this action."),
        new(ReservationNotYours, StatusCodes.Status403Forbidden, "This reservation belongs to another student."),
        new(ReservationHasSubmissions, StatusCodes.Status409Conflict, "The student has already submitted work on this topic; the topic cannot be removed."),
        new(ReservationTopicHeld, StatusCodes.Status409Conflict, "You already have an approved topic. Ask your supervisor or an administrator to change it."),
        new(SelectionClosed, StatusCodes.Status403Forbidden, "The topic selection deadline has passed."),
        new(StudentProfileRequired, StatusCodes.Status403Forbidden, "Only students with a profile can do this."),
        new(ApprovalNotApprover, StatusCodes.Status403Forbidden, "You do not approve this topic request."),
        new(ApprovalSeatSatisfied, StatusCodes.Status409Conflict, "Your approval of this request is already recorded."),
        new(ReservationChanged, StatusCodes.Status409Conflict, "Someone else acted on this request first. Reload and try again.")
    ];
}
