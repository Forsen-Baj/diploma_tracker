using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Tests.Services;

public class PasswordHasherTests
{
    [Fact]
    public void HashPassword_ThenVerifyWithSamePassword_ReturnsTrue()
    {
        var hasher = new PasswordHasher();
        const string password = "MyStrongPassword123!";

        var hash = hasher.HashPassword(password);
        var isValid = hasher.VerifyPassword(password, hash);

        Assert.True(isValid);
    }

    [Fact]
    public void VerifyPassword_WithWrongPassword_ReturnsFalse()
    {
        var hasher = new PasswordHasher();
        var hash = hasher.HashPassword("CorrectPassword123!");

        var isValid = hasher.VerifyPassword("WrongPassword123!", hash);

        Assert.False(isValid);
    }

    [Fact]
    public void VerifyPassword_WithInvalidHashFormat_ReturnsFalse()
    {
        var hasher = new PasswordHasher();

        var isValid = hasher.VerifyPassword("AnyPassword", "not-a-valid-hash");

        Assert.False(isValid);
    }
}
