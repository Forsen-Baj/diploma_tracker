namespace DiplomaTracker.Api.Entities;

public class Faculty
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<Department> Departments { get; set; } = new List<Department>();
    public ICollection<DiplomaTaskTemplate> TaskTemplates { get; set; } = new List<DiplomaTaskTemplate>();
}
