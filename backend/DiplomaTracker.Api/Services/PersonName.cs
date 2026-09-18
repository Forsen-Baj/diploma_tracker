using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class PersonName
{
    public static string Full(AppUser user) =>
        string.Join(' ', new[] { user.LastName, user.FirstName, user.Patronymic }.Where(part => !string.IsNullOrWhiteSpace(part)));
}
