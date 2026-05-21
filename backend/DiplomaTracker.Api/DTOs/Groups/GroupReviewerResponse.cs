namespace DiplomaTracker.Api.DTOs.Groups;

public class GroupReviewerResponse
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid ReviewerId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
