namespace DiplomaTracker.Api.DTOs.Archive;

public class ArchivedGroupSummaryResponse
{
    public Guid Id { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;
    public DateTime? GroupDeletedAt { get; set; }
    public int StudentCount { get; set; }
    public int FileCount { get; set; }
    public long TotalSizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ArchivedFileResponse
{
    public Guid Id { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public string? Decision { get; set; }
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}

public class ArchivedGroupDetailsResponse : ArchivedGroupSummaryResponse
{
    public IReadOnlyList<string> ReviewerNames { get; set; } = [];
    public IReadOnlyList<ArchivedFileResponse> Files { get; set; } = [];
}

public class ArchiveUsageResponse
{
    public int GroupCount { get; set; }
    public int FileCount { get; set; }
    public long TotalSizeBytes { get; set; }
}
