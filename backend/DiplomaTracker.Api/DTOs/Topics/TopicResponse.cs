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
    public Guid DirectionId { get; set; }
    public string DirectionName { get; set; } = string.Empty;
    public Guid DirectionManagerId { get; set; }
    public string DirectionManagerName { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public Guid? ActiveReservationId { get; set; }
    public string? ActiveReservationStatus { get; set; }
    public Guid? StudentProfileId { get; set; }
    public string? StudentName { get; set; }
    public string? GroupCode { get; set; }

    /// True when the topic's holder has at least one Submission on any of their steps -
    /// releasing this topic would then be refused with reservation.hasSubmissions (O1).
    public bool HasSubmissions { get; set; }

    /// Whether the caller may open the topic form (an administrator at any status; the supervisor
    /// or the direction's manager while the topic is an available catalogue topic).
    public bool CanEdit { get; set; }

    /// Whether the caller may delete it: the same people, and only while it is available.
    public bool CanDelete { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
