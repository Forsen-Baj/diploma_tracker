namespace DiplomaTracker.Api.DTOs.Students;

public sealed record SkippedImportRow(int Line, string Email);

public sealed record ImportRowError(int Line, string Code, string Message, IReadOnlyDictionary<string, string>? Params = null)
{
    public static ImportRowError Create(int line, string code, IReadOnlyDictionary<string, string>? parameters = null)
    {
        var message = Services.OnboardingErrors.RowMessages[code];
        if (parameters is not null)
        {
            foreach (var (name, value) in parameters)
            {
                message = message.Replace("{" + name + "}", value, StringComparison.Ordinal);
            }
        }

        return new ImportRowError(line, code, message, parameters);
    }
}

public class StudentImportResult
{
    public int Created { get; set; }
    public IReadOnlyList<SkippedImportRow> Skipped { get; set; } = [];
}
