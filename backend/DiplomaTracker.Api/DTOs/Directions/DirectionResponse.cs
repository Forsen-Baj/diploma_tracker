namespace DiplomaTracker.Api.DTOs.Directions;

public class DirectionResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public Guid ManagerId { get; set; }
    public string ManagerName { get; set; } = string.Empty;
    public int TopicsAvailable { get; set; }
    public int TopicsReserved { get; set; }
    public int TopicsApproved { get; set; }

    /// The caller may edit or delete it: its manager or an administrator.
    public bool CanManage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
