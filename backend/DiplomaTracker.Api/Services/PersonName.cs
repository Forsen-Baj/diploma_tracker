using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class PersonName
{
    public static string Full(AppUser user) => Full(user.LastName, user.FirstName, user.Patronymic);

    /// M13: lets callers project a user down to just the name fields (skipping PasswordHash and
    /// the rest of AppUser) before building the display name.
    public static string Full(string lastName, string firstName, string? patronymic) =>
        string.Join(' ', new[] { lastName, firstName, patronymic }.Where(part => !string.IsNullOrWhiteSpace(part)));
}
