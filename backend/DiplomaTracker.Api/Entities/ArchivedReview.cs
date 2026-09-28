namespace DiplomaTracker.Api.Entities;

/// A reviewer's decision copied into the archive as text (design 2026-09-24 §3.6). Like the rest of
/// the archive it refers to nothing live: every name is copied in at the moment of archiving.
public class ArchivedReview
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;

    /// The live review this row was copied from, kept only so a second archiving event for the same
    /// group does not copy it twice. Deliberately NOT a foreign key: the review is usually gone.
    public Guid SourceReviewId { get; set; }

    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;

    /// The student's supervisor when this file was archived (design 2026-09-27, phase 12, §4.1): an
    /// acting teacher reads the rows that carry their id. Not a foreign key - the archive refers to
    /// nothing live.
    public Guid? SupervisorId { get; set; }
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }
    public string ReviewerName { get; set; } = string.Empty;

    /// "Supervisor" or "Extra".
    public string Seat { get; set; } = string.Empty;

    /// "Approved" or "Returned".
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public DateTime ArchivedAt { get; set; }
}
