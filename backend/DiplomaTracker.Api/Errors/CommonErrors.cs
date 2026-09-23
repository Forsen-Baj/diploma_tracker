namespace DiplomaTracker.Api.Errors;

public static class CommonErrors
{
    public const string ValidationFailed = "validation.failed";
    public const string Forbidden = "access.forbidden";
    public const string TooManyRequests = "request.tooMany";
    public const string Unexpected = "server.unexpected";
    public const string NotFound = "request.notFound";
    public const string MethodNotAllowed = "request.methodNotAllowed";
    public const string UnsupportedMediaType = "request.unsupportedMediaType";
    public const string RequestTooLarge = "request.tooLarge";

    public static readonly ErrorDefinition[] All =
    [
        new(ValidationFailed, StatusCodes.Status400BadRequest, "One or more fields are invalid."),
        new(Forbidden, StatusCodes.Status403Forbidden, "You do not have access to this resource."),
        new(TooManyRequests, StatusCodes.Status429TooManyRequests, "Too many attempts. Wait a minute and try again."),
        new(Unexpected, StatusCodes.Status500InternalServerError, "An unexpected error occurred."),
        new(NotFound, StatusCodes.Status404NotFound, "The requested resource was not found."),
        new(MethodNotAllowed, StatusCodes.Status405MethodNotAllowed, "This method is not allowed for the requested resource."),
        new(UnsupportedMediaType, StatusCodes.Status415UnsupportedMediaType, "The request content type is not supported."),
        new(RequestTooLarge, StatusCodes.Status413PayloadTooLarge, "The upload is larger than this form allows.")
    ];
}
