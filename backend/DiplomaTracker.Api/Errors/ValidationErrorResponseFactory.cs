using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace DiplomaTracker.Api.Errors;

public static class ValidationErrorResponseFactory
{
    public static ApiErrorResponse Create(ModelStateDictionary modelState)
    {
        var fields = modelState
            .Where(entry => entry.Value is { Errors.Count: > 0 })
            .GroupBy(entry => ToFieldName(entry.Key))
            .ToDictionary(
                group => group.Key,
                group => group
                    .SelectMany(entry => entry.Value!.Errors.Select(error => Classify(error.ErrorMessage)))
                    .Distinct()
                    .ToArray());

        return ApiErrorResponse.From(ErrorCatalog.Get(CommonErrors.ValidationFailed)) with { Fields = fields };
    }

    private static string ToFieldName(string key)
    {
        var name = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
        return name.Length == 0 ? "request" : char.ToLowerInvariant(name[0]) + name[1..];
    }

    private static string Classify(string message)
    {
        if (message.Contains("required", StringComparison.OrdinalIgnoreCase)) return "required";
        if (message.Contains("maximum length", StringComparison.OrdinalIgnoreCase)) return "maxLength";
        if (message.Contains("minimum length", StringComparison.OrdinalIgnoreCase)) return "minLength";
        if (message.Contains("e-mail", StringComparison.OrdinalIgnoreCase)) return "format";
        if (message.Contains("format", StringComparison.OrdinalIgnoreCase)) return "format";
        return "invalid";
    }
}
