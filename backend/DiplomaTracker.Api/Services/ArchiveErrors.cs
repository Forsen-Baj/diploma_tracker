using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class ArchiveErrors
{
    public const string NotFound = "archive.notFound";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Archived item not found.")
    ];
}
