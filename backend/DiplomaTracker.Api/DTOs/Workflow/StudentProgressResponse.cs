namespace DiplomaTracker.Api.DTOs.Workflow;

public class StudentProgressResponse
{
    public Guid StudentProfileId { get; set; }
    public int Approved { get; set; }
    public int Total { get; set; }
    public int LateSubmissions { get; set; }
    public double? AverageMark { get; set; }
    public DateTime? NextDeadline { get; set; }
}
