namespace DiplomaTracker.Api.Entities;

public class DocumentTemplate
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public AppUser Owner { get; set; } = null!;
    public string StorageKey { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<DocumentTemplateGroup> Groups { get; set; } = new List<DocumentTemplateGroup>();
    public ICollection<DocumentTemplateTeacher> Teachers { get; set; } = new List<DocumentTemplateTeacher>();
}
