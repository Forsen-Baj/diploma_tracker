namespace DiplomaTracker.Api.Services;

public sealed record UserContext(Guid UserId, string Role)
{
    public bool IsAdmin => Role == "Admin";
    public bool IsTeacher => Role == "Teacher";
    public bool IsStudent => Role == "Student";
}
