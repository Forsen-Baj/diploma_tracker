namespace DiplomaTracker.Api.Errors;

public sealed record ErrorDefinition(string Code, int Status, string Message);
