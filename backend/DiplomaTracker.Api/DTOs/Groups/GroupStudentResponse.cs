namespace DiplomaTracker.Api.DTOs.Groups;

public class GroupStudentResponse
{
    public Guid StudentProfileId { get; set; }
    public Guid UserId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string? DiplomaTopic { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorFirstName { get; set; }
    public string? SupervisorLastName { get; set; }
    public string? SupervisorEmail { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
