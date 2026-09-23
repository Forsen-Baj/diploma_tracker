namespace DiplomaTracker.Api.Entities;

/// Phase 8 §4.2. The archive refers to nothing: every name, code and decision is copied in as
/// text at the moment of archiving, and there is no foreign key to a group, a student, a step or
/// a user - because each of those may be deleted afterwards, and the archive must still answer.
public class ArchivedGroup
{
    public Guid Id { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;

    /// Set when the group itself was deleted; null when the archive holds only copies made as
    /// individual students were archived.
    public DateTime? GroupDeletedAt { get; set; }

    /// The live group this archive was built from, kept only so a second archiving event for the
    /// same group finds the same row. It is deliberately NOT a foreign key: the group it names
    /// is usually gone.
    public Guid SourceGroupId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<ArchivedGroupReviewer> Reviewers { get; set; } = new List<ArchivedGroupReviewer>();
    public ICollection<ArchivedFile> Files { get; set; } = new List<ArchivedFile>();
}
