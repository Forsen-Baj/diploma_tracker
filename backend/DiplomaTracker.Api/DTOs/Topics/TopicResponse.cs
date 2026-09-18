namespace DiplomaTracker.Api.DTOs.Topics;

public class TopicResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SupervisorId { get; set; }
    public string SupervisorName { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public Guid? ActiveReservationId { get; set; }
    public string? ActiveReservationStatus { get; set; }
    public Guid? StudentProfileId { get; set; }
    public string? StudentName { get; set; }
    public string? GroupCode { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
