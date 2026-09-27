namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationResponse
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }

    /// The topic's current wording while the request is open or approved; the wording at request
    /// time for closed history.
    public string TopicTitle { get; set; } = string.Empty;
    public string? TopicDescription { get; set; }
    public string? Origin { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorName { get; set; }
    public Guid? DirectionId { get; set; }
    public string? DirectionName { get; set; }
    public string? DirectionManagerName { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentEmail { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public bool CanCancel { get; set; }

    /// True when the student has at least one Submission on any of their steps - releasing this
    /// reservation would then be refused with reservation.hasSubmissions (O1).
    public bool HasSubmissions { get; set; }

    /// The topic the student holds today, when this is an open request from a student who already
    /// has one - that is, an administrator's assignment over a held topic. Null otherwise.
    public Guid? CurrentTopicId { get; set; }
    public string? CurrentTopicTitle { get; set; }

    /// Design 2026-09-27 §5.4: the three seats of an open request (empty otherwise), and the
    /// decisions made on it, oldest first.
    public IReadOnlyList<ApprovalSeatResponse> Seats { get; set; } = [];
    public IReadOnlyList<ReservationDecisionResponse> Timeline { get; set; } = [];

    /// The comment of the return the request is waiting on, while it is Returned.
    public string? ReturnComment { get; set; }

    /// The caller holds a seat that has not approved yet and the request waits for approvers.
    public bool CanDecide { get; set; }
    public bool CanEditWording { get; set; }
    public bool CanReject { get; set; }
    public bool CanRelease { get; set; }
    public bool CanResubmit { get; set; }
}
