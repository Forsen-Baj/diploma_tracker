namespace DiplomaTracker.Api.Services;

public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int MaximumLength = 128;
    public const string Violation = "Password must be between 8 and 128 characters.";

    public static bool IsSatisfiedBy(string? password) =>
        password is not null && password.Length is >= MinimumLength and <= MaximumLength;
}
