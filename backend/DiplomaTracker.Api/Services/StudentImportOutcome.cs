using DiplomaTracker.Api.DTOs.Students;

namespace DiplomaTracker.Api.Services;

public sealed class StudentImportOutcome
{
    public StudentImportResult? Result { get; private init; }
    public string? Error { get; private init; }
    public IReadOnlyList<ImportRowError> RowErrors { get; private init; } = [];

    public static StudentImportOutcome Succeeded(StudentImportResult result) => new() { Result = result };

    public static StudentImportOutcome Failed(string error) => new() { Error = error };

    public static StudentImportOutcome Invalid(IReadOnlyList<ImportRowError> rowErrors) =>
        new() { Error = OnboardingErrors.ImportHasRowErrors, RowErrors = rowErrors };
}
