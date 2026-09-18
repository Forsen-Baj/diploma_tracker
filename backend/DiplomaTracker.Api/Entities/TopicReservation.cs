namespace DiplomaTracker.Api.Entities;

public class TopicReservation
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }
    public Topic? Topic { get; set; }
    public string TopicTitle { get; set; } = string.Empty;
    public Guid StudentProfileId { get; set; }
    public StudentProfile StudentProfile { get; set; } = null!;
    public ReservationStatus Status { get; set; }
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
}
