namespace DiplomaTracker.Api.Services;

public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int MaximumLength = 128;
    public const string Violation = "password.policy";

    public static bool IsSatisfiedBy(string? password) =>
        password is not null && password.Length is >= MinimumLength and <= MaximumLength;
}
