using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §6: role assignments as the interface shows them, with the place's
/// name and path. Four queries whatever the number of people.
public static class RoleAssignmentReader
{
    public static async Task<Dictionary<Guid, List<RoleAssignmentResponse>>> ReadAsync(AppDbContext dbContext, IReadOnlyCollection<Guid> userIds)
    {
        var assignments = await dbContext.RoleAssignments.AsNoTracking()
            .Where(a => userIds.Contains(a.UserId))
            .ToListAsync();

        var facultyIds = assignments.Where(a => a.ScopeKind == RoleScopeKind.Faculty).Select(a => a.ScopeId).Distinct().ToList();
        var departmentIds = assignments.Where(a => a.ScopeKind == RoleScopeKind.Department).Select(a => a.ScopeId).Distinct().ToList();
        var groupIds = assignments.Where(a => a.ScopeKind == RoleScopeKind.Group).Select(a => a.ScopeId).Distinct().ToList();

        var faculties = await dbContext.Faculties.AsNoTracking()
            .Where(f => facultyIds.Contains(f.Id))
            .Select(f => new { f.Id, f.Name, f.ShortName })
            .ToDictionaryAsync(f => f.Id);
        var departments = await dbContext.Departments.AsNoTracking()
            .Where(d => departmentIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Name, d.ShortName, d.FacultyId, FacultyShortName = d.Faculty.ShortName })
            .ToDictionaryAsync(d => d.Id);
        var groups = await dbContext.Groups.AsNoTracking()
            .Where(g => groupIds.Contains(g.Id))
            .Select(g => new
            {
                g.Id,
                g.Code,
                g.DepartmentId,
                g.Department.FacultyId,
                DepartmentShortName = g.Department.ShortName,
                FacultyShortName = g.Department.Faculty.ShortName
            })
            .ToDictionaryAsync(g => g.Id);

        RoleAssignmentResponse? ToResponse(RoleAssignment a)
        {
            var response = new RoleAssignmentResponse
            {
                Id = a.Id,
                Role = a.Role.ToString(),
                ScopeKind = a.ScopeKind.ToString(),
                ScopeId = a.ScopeId,
                CreatedAt = a.CreatedAt
            };

            if (a.ScopeKind == RoleScopeKind.Faculty && faculties.TryGetValue(a.ScopeId, out var faculty))
            {
                response.ScopeName = faculty.Name;
                response.ScopePath = faculty.ShortName;
                response.FacultyId = faculty.Id;
                return response;
            }

            if (a.ScopeKind == RoleScopeKind.Department && departments.TryGetValue(a.ScopeId, out var department))
            {
                response.ScopeName = department.Name;
                response.ScopePath = $"{department.FacultyShortName} / {department.ShortName}";
                response.FacultyId = department.FacultyId;
                response.DepartmentId = department.Id;
                return response;
            }

            if (a.ScopeKind == RoleScopeKind.Group && groups.TryGetValue(a.ScopeId, out var group))
            {
                response.ScopeName = group.Code;
                response.ScopePath = $"{group.FacultyShortName} / {group.DepartmentShortName} / {group.Code}";
                response.FacultyId = group.FacultyId;
                response.DepartmentId = group.DepartmentId;
                response.GroupId = group.Id;
                return response;
            }

            // A place is deleted together with its assignments, so this does not happen; a row that
            // names nothing is left out rather than shown half empty.
            return null;
        }

        return assignments
            .OrderBy(a => a.Role)
            .ThenBy(a => a.ScopeKind)
            .Select(a => (a.UserId, Response: ToResponse(a)))
            .Where(x => x.Response is not null)
            .GroupBy(x => x.UserId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => x.Response!).ToList());
    }
}
