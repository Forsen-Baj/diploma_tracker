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
    public const string TopicDepartmentInvalid = "topic.departmentInvalid";
    public const string TopicSupervisorInvalid = "topic.supervisorInvalid";
    public const string ProposalTeacherInvalid = "proposal.teacherInvalid";
    public const string ReservationNotFound = "reservation.notFound";
    public const string ReservationAlreadyActive = "reservation.alreadyActive";
    public const string ReservationInvalidState = "reservation.invalidState";
    public const string ReservationNotYours = "reservation.notYours";
    public const string ReservationNotSupervisor = "reservation.notSupervisor";
    public const string SelectionClosed = "selection.closed";
    public const string StudentProfileRequired = "topic.studentProfileRequired";

    public static readonly ErrorDefinition[] All =
    [
        new(TopicNotFound, StatusCodes.Status404NotFound, "Topic not found."),
        new(TopicInvalid, StatusCodes.Status400BadRequest, "The selected topic does not exist."),
        new(TopicNotAvailable, StatusCodes.Status409Conflict, "The topic is no longer available."),
        new(TopicNotInYourDepartment, StatusCodes.Status403Forbidden, "The topic belongs to another department."),
        new(TopicNotEditable, StatusCodes.Status409Conflict, "Only available catalogue topics can be changed or deleted."),
        new(TopicNotOwner, StatusCodes.Status403Forbidden, "You can change only topics you supervise."),
        new(TopicAlreadyYours, StatusCodes.Status409Conflict, "This is already your topic."),
        new(TopicDepartmentInvalid, StatusCodes.Status400BadRequest, "The selected department does not exist."),
        new(TopicSupervisorInvalid, StatusCodes.Status400BadRequest, "The supervisor must be an active teacher."),
        new(ProposalTeacherInvalid, StatusCodes.Status400BadRequest, "The chosen teacher must be an active teacher."),
        new(ReservationNotFound, StatusCodes.Status404NotFound, "Reservation not found."),
        new(ReservationAlreadyActive, StatusCodes.Status409Conflict, "You already have a request awaiting a decision."),
        new(ReservationInvalidState, StatusCodes.Status409Conflict, "The reservation is not in a state that allows this action."),
        new(ReservationNotYours, StatusCodes.Status403Forbidden, "This reservation belongs to another student."),
        new(ReservationNotSupervisor, StatusCodes.Status403Forbidden, "Only the topic's supervisor can decide on this reservation."),
        new(SelectionClosed, StatusCodes.Status403Forbidden, "The topic selection deadline has passed."),
        new(StudentProfileRequired, StatusCodes.Status403Forbidden, "Only students with a profile can do this.")
    ];
}
