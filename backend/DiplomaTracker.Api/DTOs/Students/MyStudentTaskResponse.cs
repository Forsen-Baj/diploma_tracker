namespace DiplomaTracker.Api.DTOs.Students;

public class MyStudentTaskResponse
{
    public Guid Id { get; set; }
    public Guid GroupTaskId { get; set; }
    public Guid TaskTemplateId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public DateTime Deadline { get; set; }
    public string Status { get; set; } = string.Empty;
    public string DisplayStatus { get; set; } = string.Empty;
    public decimal? CurrentMark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? LatestSubmissionAt { get; set; }
    public string? LatestReviewerComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
