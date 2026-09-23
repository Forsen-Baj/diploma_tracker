using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// <summary>
/// Archives and restores <see cref="StudentProfile"/> entities that are already tracked by the
/// caller's <c>DbContext</c>. Archiving sets <see cref="StudentProfile.ArchivedAt"/> and clears the
/// user's <see cref="AppUser.IsActive"/> flag; restoring does the reverse. Does not call
/// <c>SaveChangesAsync</c> — the caller commits the change.
/// </summary>
public static class StudentArchiver
{
    public static IReadOnlyList<Guid> Archive(IReadOnlyCollection<StudentProfile> profiles, DateTime now)
    {
        var archivedIds = new List<Guid>();
        foreach (var profile in profiles)
        {
            if (profile.ArchivedAt is not null)
            {
                continue;
            }

            profile.ArchivedAt = now;
            profile.UpdatedAt = now;
            profile.User.IsActive = false;
            profile.User.UpdatedAt = now;
            archivedIds.Add(profile.Id);
        }

        return archivedIds;
    }

    public static IReadOnlyList<Guid> Restore(IReadOnlyCollection<StudentProfile> profiles, DateTime now)
    {
        var restoredIds = new List<Guid>();
        foreach (var profile in profiles)
        {
            if (profile.ArchivedAt is null)
            {
                continue;
            }

            profile.ArchivedAt = null;
            profile.UpdatedAt = now;
            profile.User.IsActive = true;
            profile.User.UpdatedAt = now;
            restoredIds.Add(profile.Id);
        }

        return restoredIds;
    }
}
