namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record NamedOption(Guid Id, string Name);

public class TemplateAudience
{
    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public IReadOnlyList<NamedOption> Groups { get; set; } = [];
    public IReadOnlyList<NamedOption> Teachers { get; set; } = [];
}

public class TemplateResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool CanManage { get; set; }
    public TemplateAudience? Audience { get; set; }
}
