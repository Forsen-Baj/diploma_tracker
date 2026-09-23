namespace DiplomaTracker.Api.DTOs.Topics;

public class TopicQuery
{
    public string? Search { get; set; }
    public Guid? SupervisorId { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? Status { get; set; }
}
