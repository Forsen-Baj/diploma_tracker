using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Tests.Configuration;

public class StartupValidationTests
{
    [Fact]
    public void ValidateJwtSettings_WithValidSettings_DoesNotThrow()
    {
        var exception = Record.Exception(() => StartupValidation.ValidateJwtSettings(ValidJwtSettings()));

        Assert.Null(exception);
    }

    [Theory]
    [InlineData("")]
    [InlineData("only-thirty-one-bytes-long-key!")]
    public void ValidateJwtSettings_WithSecretShorterThan32Bytes_Throws(string secret)
    {
        var settings = ValidJwtSettings();
        settings.Secret = secret;

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:Secret", exception.Message);
    }

    [Fact]
    public void ValidateJwtSettings_WithMissingIssuer_Throws()
    {
        var settings = ValidJwtSettings();
        settings.Issuer = " ";

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:Issuer", exception.Message);
    }

    [Fact]
    public void ValidateJwtSettings_WithNonPositiveExpiry_Throws()
    {
        var settings = ValidJwtSettings();
        settings.ExpiresInMinutes = 0;

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:ExpiresInMinutes", exception.Message);
    }

    [Fact]
    public void ValidateCorsSettings_WithNoOrigins_Throws()
    {
        var exception = Assert.Throws<InvalidOperationException>(
            () => StartupValidation.ValidateCorsSettings(new CorsSettings()));

        Assert.Contains("Cors:AllowedOrigins", exception.Message);
    }

    [Fact]
    public void ValidateCorsSettings_WithOrigin_DoesNotThrow()
    {
        var settings = new CorsSettings { AllowedOrigins = ["http://localhost:5173"] };

        var exception = Record.Exception(() => StartupValidation.ValidateCorsSettings(settings));

        Assert.Null(exception);
    }

    private static JwtSettings ValidJwtSettings() => new()
    {
        Issuer = "DiplomaTracker.Api",
        Audience = "DiplomaTracker.Web",
        Secret = new string('k', StartupValidation.MinimumJwtSecretBytes),
        ExpiresInMinutes = 60
    };
}
