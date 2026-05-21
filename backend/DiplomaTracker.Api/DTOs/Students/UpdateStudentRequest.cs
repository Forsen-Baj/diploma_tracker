namespace DiplomaTracker.Api.DTOs.Students;

public class UpdateStudentRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DiplomaTopic { get; set; } = string.Empty;
    public Guid? GroupId { get; set; }
    public Guid? SupervisorId { get; set; }
}
