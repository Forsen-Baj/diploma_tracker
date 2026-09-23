namespace DiplomaTracker.Api.DTOs.Workflow;

public class StudentProgressResponse
{
    public Guid StudentProfileId { get; set; }
    public int Approved { get; set; }
    public int Total { get; set; }
    /// Steps whose current submission was late. A student who submits one step late three times
    /// is late on ONE step (§7.2).
    public int LateSteps { get; set; }
    public double? AverageMark { get; set; }
    public DateTime? NextDeadline { get; set; }
}
