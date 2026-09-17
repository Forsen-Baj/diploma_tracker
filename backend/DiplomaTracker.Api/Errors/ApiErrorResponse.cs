using System.Text.Json.Serialization;

namespace DiplomaTracker.Api.Errors;

public sealed record ApiErrorResponse(string Code, string Message)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyDictionary<string, string[]>? Fields { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? Errors { get; init; }

    public static ApiErrorResponse From(ErrorDefinition definition) => new(definition.Code, definition.Message);
}
