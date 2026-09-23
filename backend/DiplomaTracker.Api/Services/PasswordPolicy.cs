namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.2: an administrator can create and delete accounts, reassign topics, delete
/// groups and purge the archive, so that account carries a longer minimum than a student's.
/// The two rules have their own error codes so each message can state its own number without
/// interpolation.
public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int ElevatedMinimumLength = 12;
    public const int MaximumLength = 128;
    public const string Violation = "password.policy";
    public const string ElevatedViolation = "password.policyElevated";

    public static bool IsSatisfiedBy(string? password) =>
        password is not null && password.Length is >= MinimumLength and <= MaximumLength;

    public static bool IsSatisfiedByElevated(string? password) =>
        password is not null && password.Length is >= ElevatedMinimumLength and <= MaximumLength;
}
