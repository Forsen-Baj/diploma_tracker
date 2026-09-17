using System.Net.Mail;

namespace DiplomaTracker.Api.Services;

public static class IdentityNormalizer
{
    public static string Email(string value) => value.Trim().ToLowerInvariant();

    public static string StudentNumber(string value) => value.Trim().ToUpperInvariant();

    public static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static bool IsValidEmail(string value) =>
        MailAddress.TryCreate(value, out var address) && address.Address == value;
}
