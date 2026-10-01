using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Documents;

public class CreateDocumentForm
{
    [Required]
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    public IFormFile? File { get; set; }
}

public class UpdateDocumentRequest
{
    [Required]
    [MaxLength(200)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class AddVersionForm
{
    public IFormFile? File { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class SendDocumentRequest
{
    [Required]
    public Guid? RecipientId { get; set; }

    /// "Review" or "Signing".
    [Required]
    public string? Purpose { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class ForwardDocumentForm
{
    [Required]
    public Guid? RecipientId { get; set; }

    [Required]
    public string? Purpose { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }

    public IFormFile? File { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class RejectDocumentRequest
{
    /// Empty means the default: whoever handed the document over.
    public Guid? TargetId { get; set; }

    [Required]
    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class DoneDocumentForm
{
    [MaxLength(2000)]
    public string? Comment { get; set; }

    public IFormFile? File { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}

public class RecallDocumentRequest
{
    [MaxLength(2000)]
    public string? Comment { get; set; }

    [Required]
    public int? ExpectedSequence { get; set; }
}
