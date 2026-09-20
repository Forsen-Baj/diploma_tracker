using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Errors;

public static class ErrorCatalog
{
    private static readonly Dictionary<string, ErrorDefinition> Definitions = BuildDefinitions();

    public static IReadOnlyCollection<ErrorDefinition> All => Definitions.Values;

    public static ErrorDefinition Get(string? code) =>
        code is not null && Definitions.TryGetValue(code, out var definition)
            ? definition
            : Definitions[CommonErrors.Unexpected];

    private static Dictionary<string, ErrorDefinition> BuildDefinitions()
    {
        ErrorDefinition[][] areas =
        [
            CommonErrors.All,
            AcademicStructureErrors.All,
            GroupErrors.All,
            TaskErrors.All,
            OnboardingErrors.All,
            AdminErrors.All,
            TopicErrors.All,
            WorkflowErrors.All,
            TemplateErrors.All
        ];

        var definitions = new Dictionary<string, ErrorDefinition>(StringComparer.Ordinal);
        foreach (var definition in areas.SelectMany(area => area))
        {
            if (!definitions.TryAdd(definition.Code, definition))
            {
                throw new InvalidOperationException($"Error code '{definition.Code}' is defined more than once.");
            }
        }

        return definitions;
    }
}
