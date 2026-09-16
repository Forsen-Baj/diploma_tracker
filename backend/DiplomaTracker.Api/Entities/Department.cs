namespace DiplomaTracker.Api.Entities;

public class Department
{
    public Guid Id { get; set; }
    public Guid FacultyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Faculty Faculty { get; set; } = null!;
    public ICollection<Group> Groups { get; set; } = new List<Group>();
}
