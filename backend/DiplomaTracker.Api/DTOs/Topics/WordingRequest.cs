using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

/// A topic's title and description, as an approver edits them or a returned student resubmits them.
public class WordingRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }
}
