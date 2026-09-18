using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// <summary>
/// Ensures a student who becomes a member of a group (created, imported, moved or restored)
/// receives a <see cref="StudentTask"/> for every <see cref="GroupTask"/> of that group they do
/// not already have. Adds the missing entities to the context without saving; the caller commits
/// them in the same <c>SaveChangesAsync</c> call as the membership change.
/// </summary>
public static class LateJoinerTaskAssigner
{
    public static async Task AssignMissingGroupTasksAsync(
        AppDbContext dbContext,
        IReadOnlyCollection<(Guid StudentProfileId, Guid GroupId)> memberships)
    {
        if (memberships.Count == 0)
        {
            return;
        }

        var groupIds = memberships.Select(m => m.GroupId).Distinct().ToList();

        var groupTasksByGroup = await dbContext.GroupTasks
            .AsNoTracking()
            .Where(gt => groupIds.Contains(gt.GroupId))
            .Select(gt => new { gt.Id, gt.GroupId })
            .ToListAsync();

        if (groupTasksByGroup.Count == 0)
        {
            return;
        }

        var profileIds = memberships.Select(m => m.StudentProfileId).Distinct().ToList();
        var allGroupTaskIds = groupTasksByGroup.Select(x => x.Id).ToList();

        var existingPairs = await dbContext.StudentTasks
            .AsNoTracking()
            .Where(st => profileIds.Contains(st.StudentProfileId) && allGroupTaskIds.Contains(st.GroupTaskId))
            .Select(st => new { st.StudentProfileId, st.GroupTaskId })
            .ToListAsync();
        var existingSet = existingPairs.Select(p => (p.StudentProfileId, p.GroupTaskId)).ToHashSet();

        var groupTaskIdsByGroup = groupTasksByGroup.ToLookup(x => x.GroupId, x => x.Id);
        var now = DateTime.UtcNow;

        foreach (var (studentProfileId, groupId) in memberships)
        {
            foreach (var groupTaskId in groupTaskIdsByGroup[groupId])
            {
                if (!existingSet.Add((studentProfileId, groupTaskId)))
                {
                    continue;
                }

                dbContext.StudentTasks.Add(new StudentTask
                {
                    Id = Guid.NewGuid(),
                    StudentProfileId = studentProfileId,
                    GroupTaskId = groupTaskId,
                    Status = StudentTaskStatus.Pending,
                    CreatedAt = now
                });
            }
        }
    }
}
