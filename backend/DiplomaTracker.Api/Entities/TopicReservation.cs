namespace DiplomaTracker.Api.Entities;

public class TopicReservation
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }
    public Topic? Topic { get; set; }
    public string TopicTitle { get; set; } = string.Empty;

    /// The topic's description when the request was made. With TopicTitle, what a catalogue topic
    /// goes back to when the request ends without approval (§5.3).
    public string? TopicDescription { get; set; }
    public Guid StudentProfileId { get; set; }
    public StudentProfile StudentProfile { get; set; } = null!;
    public ReservationStatus Status { get; set; }
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }

    /// When the wording last changed while the request was open - set when it is made, on every
    /// approver's edit and on the student's resubmission. Approvals older than this do not count.
    public DateTime ContentChangedAt { get; set; }
    public ICollection<ReservationDecision> Decisions { get; set; } = new List<ReservationDecision>();
}
