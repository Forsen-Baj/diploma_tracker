namespace DiplomaTracker.Api.DTOs.Students;

public sealed record SkippedImportRow(int Line, string Email);

public sealed record ImportRowError(int Line, string Message);

public class StudentImportResult
{
    public int Created { get; set; }
    public IReadOnlyList<SkippedImportRow> Skipped { get; set; } = [];
}
