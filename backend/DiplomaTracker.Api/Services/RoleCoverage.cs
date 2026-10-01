using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §3-§4: who covers which place in which role. Always read from the
/// database. A faculty assignment covers its departments and groups, a department assignment its
/// groups, and only an active staff account covers anything.
public static class RoleCoverage
{
    /// The assignments of `role` that cover the group: scoped to it, to its department or to its faculty.
    public static IQueryable<RoleAssignment> CoveringGroup(this AppDbContext dbContext, StaffRole role, Guid groupId) =>
        dbContext.RoleAssignments.Where(a => a.Role == role
            && a.User.IsActive
            && a.User.Role == AccountRoles.Staff
            && dbContext.Groups.Any(g => g.Id == groupId
                && ((a.ScopeKind == RoleScopeKind.Group && a.ScopeId == g.Id)
                    || (a.ScopeKind == RoleScopeKind.Department && a.ScopeId == g.DepartmentId)
                    || (a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == g.Department.FacultyId))));

    /// The assignments of `role` that cover the department: scoped to it or to its faculty. A group
    /// assignment never covers a department.
    public static IQueryable<RoleAssignment> CoveringDepartment(this AppDbContext dbContext, StaffRole role, Guid departmentId) =>
        dbContext.RoleAssignments.Where(a => a.Role == role
            && a.User.IsActive
            && a.User.Role == AccountRoles.Staff
            && dbContext.Departments.Any(d => d.Id == departmentId
                && ((a.ScopeKind == RoleScopeKind.Department && a.ScopeId == d.Id)
                    || (a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == d.FacultyId))));

    /// The ids of the departments the account covers in `role` - CoveringDepartment turned round,
    /// for filtering a list by coverage in one query (EF cannot call CoveringDepartment per row).
    public static IQueryable<Guid> DepartmentsCoveredBy(this AppDbContext dbContext, Guid userId, StaffRole role)
    {
        var held = dbContext.RoleAssignments.Where(a => a.UserId == userId
            && a.Role == role
            && a.User.IsActive
            && a.User.Role == AccountRoles.Staff);
        return dbContext.Departments
            .Where(d => held.Any(a => (a.ScopeKind == RoleScopeKind.Department && a.ScopeId == d.Id)
                || (a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == d.FacultyId)))
            .Select(d => d.Id);
    }

    public static Task<bool> CoversGroupAsync(this AppDbContext dbContext, Guid userId, StaffRole role, Guid groupId) =>
        dbContext.CoveringGroup(role, groupId).AnyAsync(a => a.UserId == userId);

    public static Task<bool> CoversDepartmentAsync(this AppDbContext dbContext, Guid userId, StaffRole role, Guid departmentId) =>
        dbContext.CoveringDepartment(role, departmentId).AnyAsync(a => a.UserId == userId);

    /// Whether the account holds the role anywhere - what a session in that role needs (§5).
    public static Task<bool> HoldsRoleAsync(this AppDbContext dbContext, Guid userId, StaffRole role) =>
        dbContext.RoleAssignments.AnyAsync(a => a.UserId == userId && a.Role == role);

    /// In memory: whether one assignment covers a place given by its faculty, department and, for a
    /// group, group id. For candidates already loaded (§6, the removal check).
    public static bool Covers(RoleAssignment assignment, Guid facultyId, Guid departmentId, Guid? groupId) =>
        assignment.ScopeKind switch
        {
            RoleScopeKind.Faculty => assignment.ScopeId == facultyId,
            RoleScopeKind.Department => assignment.ScopeId == departmentId,
            _ => groupId is not null && assignment.ScopeId == groupId
        };
}
