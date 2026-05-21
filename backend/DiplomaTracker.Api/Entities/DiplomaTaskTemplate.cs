namespace DiplomaTracker.Api.Entities;

public class DiplomaTaskTemplate
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<GroupTask> GroupTasks { get; set; } = new List<GroupTask>();
}
