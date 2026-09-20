namespace DiplomaTracker.Api.Entities;

public class DocumentTemplateTeacher
{
    public Guid TemplateId { get; set; }
    public DocumentTemplate Template { get; set; } = null!;
    public Guid TeacherId { get; set; }
    public AppUser Teacher { get; set; } = null!;
}
