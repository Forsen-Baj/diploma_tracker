namespace DiplomaTracker.Api.DTOs.Students;

public class MyStudentTaskDetailsResponse
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
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public List<MyStudentTaskSubmissionItemResponse> Submissions { get; set; } = [];
    public List<MyStudentTaskReviewItemResponse> Reviews { get; set; } = [];
}

public class MyStudentTaskSubmissionItemResponse
{
    public Guid Id { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public string? Comment { get; set; }
}

public class MyStudentTaskReviewItemResponse
{
    public Guid Id { get; set; }
    public string ReviewerFirstName { get; set; } = string.Empty;
    public string ReviewerLastName { get; set; } = string.Empty;
    public decimal? Mark { get; set; }
    public string? Comment { get; set; }
    public string? Decision { get; set; }
    public DateTime CreatedAt { get; set; }
}
