using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace DiplomaTracker.Api.Validation;

/// <summary>
/// Validates that an academic year, once trimmed, is non-empty, at most 20 characters, and
/// contains only ASCII digits, '/', '\', '-', '.', and whitespace.
/// </summary>
public sealed class ValidAcademicYearAttribute : ValidationAttribute
{
    private static readonly Regex AllowedCharacters = new(@"^[0-9/\\\-. \t]+$", RegexOptions.Compiled);

    public ValidAcademicYearAttribute()
        : base("The {0} field is not in a valid academic year format.")
    {
    }

    public override bool IsValid(object? value)
    {
        if (value is null)
        {
            return true;
        }

        if (value is not string academicYear)
        {
            return false;
        }

        var trimmed = academicYear.Trim();
        return trimmed.Length > 0 && trimmed.Length <= 20 && AllowedCharacters.IsMatch(trimmed);
    }
}
