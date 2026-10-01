namespace DiplomaTracker.Api.Entities;

/// An extra reviewer on one student's step (design 2026-09-24 §3.1). The supervisor is never a row
/// here: their seat is the student's current supervisor, worked out when the panel is read.
public class StudentTaskReviewer
{
    public Guid Id { get; set; }
    public Guid StudentTaskId { get; set; }
    public Guid ReviewerId { get; set; }
    public Guid AddedById { get; set; }
    public DateTime AddedAt { get; set; }
    public StudentTask StudentTask { get; set; } = null!;
    public AppUser Reviewer { get; set; } = null!;
    public AppUser AddedBy { get; set; } = null!;
}
