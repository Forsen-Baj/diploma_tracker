using System.Text;
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Configuration;

public static class StartupValidation
{
    public const int MinimumJwtSecretBytes = 32;

    public static void ValidateJwtSettings(JwtSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.Issuer) || string.IsNullOrWhiteSpace(settings.Audience))
        {
            throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
        }

        if (Encoding.UTF8.GetByteCount(settings.Secret) < MinimumJwtSecretBytes)
        {
            throw new InvalidOperationException(
                $"Jwt:Secret must be at least {MinimumJwtSecretBytes} bytes. " +
                "Set it with user-secrets locally or the Jwt__Secret environment variable when hosted.");
        }

        if (settings.ExpiresInMinutes <= 0)
        {
            throw new InvalidOperationException("Jwt:ExpiresInMinutes must be greater than zero.");
        }
    }

    public static void ValidateCorsSettings(CorsSettings settings)
    {
        if (settings.AllowedOrigins.Length == 0 || settings.AllowedOrigins.Any(string.IsNullOrWhiteSpace))
        {
            throw new InvalidOperationException(
                "Cors:AllowedOrigins must list at least one origin. Set Cors__AllowedOrigins__0 when hosted.");
        }
    }
}
