namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationResponse
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }
    public string TopicTitle { get; set; } = string.Empty;
    public string? TopicDescription { get; set; }
    public string? Origin { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorName { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentEmail { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public bool CanCancel { get; set; }

    /// <summary>
    /// The topic the student holds today, when this is a <c>Pending</c> request from a student
    /// who already has one — that is, a change request. Null otherwise. It lets a teacher see
    /// what the student would give up before deciding, and the student's own card name both.
    /// </summary>
    public Guid? CurrentTopicId { get; set; }
    public string? CurrentTopicTitle { get; set; }
}
