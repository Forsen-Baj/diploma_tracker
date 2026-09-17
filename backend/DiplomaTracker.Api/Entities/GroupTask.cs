namespace DiplomaTracker.Api.Entities;

public class GroupTask
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid DiplomaTaskTemplateId { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime Deadline { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public Group Group { get; set; } = null!;
    public DiplomaTaskTemplate DiplomaTaskTemplate { get; set; } = null!;
    public ICollection<StudentTask> StudentTasks { get; set; } = new List<StudentTask>();
}
