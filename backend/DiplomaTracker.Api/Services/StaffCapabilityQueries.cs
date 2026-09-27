using DiplomaTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §3: the two capabilities of a teacher account, always read from the database.
public static class StaffCapabilityQueries
{
    public static Task<bool> IsDirectionManagerAsync(this AppDbContext dbContext, Guid userId) =>
        dbContext.Users.AnyAsync(u => u.Id == userId && u.Role == "Teacher" && u.IsActive && u.IsDirectionManager);

    public static Task<bool> IsStandardsControllerAsync(this AppDbContext dbContext, Guid userId) =>
        dbContext.Users.AnyAsync(u => u.Id == userId && u.Role == "Teacher" && u.IsActive && u.IsStandardsController);
}
