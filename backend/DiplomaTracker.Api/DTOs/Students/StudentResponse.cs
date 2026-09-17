namespace DiplomaTracker.Api.DTOs.Students;

public class StudentResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool IsClaimed { get; set; }
    public string? DiplomaTopic { get; set; }
    public Guid? GroupId { get; set; }
    public string? GroupName { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorFirstName { get; set; }
    public string? SupervisorLastName { get; set; }
    public string? SupervisorEmail { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
