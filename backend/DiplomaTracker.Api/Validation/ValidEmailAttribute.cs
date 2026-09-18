using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Validation;

/// <summary>
/// Validates email syntax the same way <see cref="IdentityNormalizer.IsValidEmail"/> does, so the
/// API and the CSV import agree on which addresses are valid.
/// </summary>
public sealed class ValidEmailAttribute : ValidationAttribute
{
    public ValidEmailAttribute()
        : base("The {0} field is not a valid e-mail address.")
    {
    }

    public override bool IsValid(object? value) =>
        value is null || (value is string email && IdentityNormalizer.IsValidEmail(email));
}
