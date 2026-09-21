namespace DiplomaTracker.Api.Entities;

public class DocumentTemplateGroup
{
    public Guid TemplateId { get; set; }
    public DocumentTemplate Template { get; set; } = null!;
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
}
