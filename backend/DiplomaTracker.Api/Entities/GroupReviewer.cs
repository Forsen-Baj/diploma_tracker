namespace DiplomaTracker.Api.Entities;

public class GroupReviewer
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid ReviewerId { get; set; }
    public DateTime CreatedAt { get; set; }
    public Group Group { get; set; } = null!;
    public AppUser Reviewer { get; set; } = null!;
}
