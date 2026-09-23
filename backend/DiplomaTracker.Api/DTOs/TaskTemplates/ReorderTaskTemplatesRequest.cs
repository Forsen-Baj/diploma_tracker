using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class ReorderTaskTemplatesRequest
{
    public Guid FacultyId { get; set; }

    /// The faculty's templates in their new order, first to last. The complete set: same
    /// members, no duplicates, nothing missing.
    [Required]
    public IReadOnlyList<Guid> TemplateIds { get; set; } = [];
}
