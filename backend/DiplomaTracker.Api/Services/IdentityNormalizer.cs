using System.Net.Mail;

namespace DiplomaTracker.Api.Services;

public static class IdentityNormalizer
{
    public static string Email(string value) => value.Trim().ToLowerInvariant();

    public static string StudentNumber(string value) => value.Trim().ToUpperInvariant();

    /// Phase 8 §5.1. A student number is typed from a printed list or pasted from a spreadsheet,
    /// in a country where Latin and Cyrillic share a dozen glyphs: "KB123", "KB 123" and Cyrillic
    /// "КВ123" are one student on paper and three rows in a database that compares strings. This
    /// is the comparison form - stored beside the number as entered, never shown.
    private static readonly Dictionary<char, char> CyrillicLookalikes = new()
    {
        ['А'] = 'A', ['В'] = 'B', ['Е'] = 'E', ['І'] = 'I', ['К'] = 'K', ['М'] = 'M',
        ['Н'] = 'H', ['О'] = 'O', ['Р'] = 'P', ['С'] = 'C', ['Т'] = 'T', ['У'] = 'Y',
        ['Х'] = 'X'
    };

    private static readonly char[] StrippedSeparators = ['-', '_', '/', '.'];

    public static string StudentNumberCanonical(string value)
    {
        var upper = value.Trim().ToUpperInvariant();
        var builder = new System.Text.StringBuilder(upper.Length);

        foreach (var character in upper)
        {
            if (char.IsWhiteSpace(character) || Array.IndexOf(StrippedSeparators, character) >= 0)
            {
                continue;
            }

            builder.Append(CyrillicLookalikes.TryGetValue(character, out var latin) ? latin : character);
        }

        return builder.ToString();
    }

    public static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static bool IsValidEmail(string value) =>
        MailAddress.TryCreate(value, out var address) && address.Address == value;
}
