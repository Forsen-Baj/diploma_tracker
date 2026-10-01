using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §6: what keeps an assignment from being removed - work in its scope
/// that no other assignment of the same person and role covers. The candidates are the person's own
/// work, loaded with the place they sit in and judged in memory.
public static class RoleAssignmentUsage
{
    public const string SupervisedStudent = "supervisedStudent";
    public const string SupervisedTopic = "supervisedTopic";
    public const string PanelSeat = "panelSeat";
    public const string ManagedDirection = "managedDirection";
    public const string ControlledStep = "controlledStep";

    public static async Task<List<RoleAssignmentBlocker>> FindBlockersAsync(AppDbContext dbContext, RoleAssignment removing)
    {
        var others = await dbContext.RoleAssignments.AsNoTracking()
            .Where(a => a.UserId == removing.UserId && a.Role == removing.Role && a.Id != removing.Id)
            .ToListAsync();

        // In the scope being removed, and covered by nothing else of the same role.
        bool Stranded(Guid facultyId, Guid departmentId, Guid? groupId) =>
            RoleCoverage.Covers(removing, facultyId, departmentId, groupId)
            && !others.Any(a => RoleCoverage.Covers(a, facultyId, departmentId, groupId));

        var me = removing.UserId;
        var blockers = new List<RoleAssignmentBlocker>();

        if (removing.Role == StaffRole.Teacher)
        {
            var students = await dbContext.StudentProfiles.AsNoTracking()
                .Where(p => p.SupervisorId == me && p.ArchivedAt == null)
                .Select(p => new { p.User.LastName, p.User.FirstName, p.Group.Code, p.GroupId, p.Group.DepartmentId, p.Group.Department.FacultyId })
                .ToListAsync();
            blockers.AddRange(students
                .Where(s => Stranded(s.FacultyId, s.DepartmentId, s.GroupId))
                .Select(s => new RoleAssignmentBlocker(SupervisedStudent, $"{s.LastName} {s.FirstName} · {s.Code}")));

            // A topic someone has asked for is judged by the asking student's group (§4: supervision
            // follows the student's group); a catalogue topic nobody has asked for by its department.
            var requested = await dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.Topic != null
                    && r.Topic.SupervisorId == me
                    && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned))
                .Select(r => new
                {
                    r.Topic!.Title,
                    r.StudentProfile.GroupId,
                    r.StudentProfile.Group.DepartmentId,
                    r.StudentProfile.Group.Department.FacultyId
                })
                .ToListAsync();
            blockers.AddRange(requested
                .Where(t => Stranded(t.FacultyId, t.DepartmentId, t.GroupId))
                .Select(t => new RoleAssignmentBlocker(SupervisedTopic, t.Title)));

            var available = await dbContext.Topics.AsNoTracking()
                .Where(t => t.SupervisorId == me && t.Status == TopicStatus.Available)
                .Select(t => new { t.Title, t.Direction.DepartmentId, t.Direction.Department.FacultyId })
                .ToListAsync();
            blockers.AddRange(available
                .Where(t => Stranded(t.FacultyId, t.DepartmentId, null))
                .Select(t => new RoleAssignmentBlocker(SupervisedTopic, t.Title)));

            var seats = await dbContext.StudentTaskReviewers.AsNoTracking()
                .Where(r => r.ReviewerId == me
                    && r.StudentTask.Status != StudentTaskStatus.Approved
                    && r.StudentTask.StudentProfile.ArchivedAt == null)
                .Select(r => new
                {
                    Step = r.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                    r.StudentTask.StudentProfile.User.LastName,
                    r.StudentTask.StudentProfile.User.FirstName,
                    r.StudentTask.StudentProfile.GroupId,
                    r.StudentTask.StudentProfile.Group.DepartmentId,
                    r.StudentTask.StudentProfile.Group.Department.FacultyId
                })
                .ToListAsync();
            blockers.AddRange(seats
                .Where(s => Stranded(s.FacultyId, s.DepartmentId, s.GroupId))
                .Select(s => new RoleAssignmentBlocker(PanelSeat, $"{s.Step} · {s.LastName} {s.FirstName}")));
        }
        else if (removing.Role == StaffRole.DirectionManager)
        {
            var directions = await dbContext.Directions.AsNoTracking()
                .Where(d => d.ManagerId == me)
                .Select(d => new { d.Name, d.DepartmentId, d.Department.FacultyId })
                .ToListAsync();
            blockers.AddRange(directions
                .Where(d => Stranded(d.FacultyId, d.DepartmentId, null))
                .Select(d => new RoleAssignmentBlocker(ManagedDirection, d.Name)));
        }
        else
        {
            var steps = await dbContext.GroupTasks.AsNoTracking()
                .Where(g => g.StandardsControllerId == me)
                .Select(g => new { g.DiplomaTaskTemplate.Title, g.Group.Code, g.GroupId, g.Group.DepartmentId, g.Group.Department.FacultyId })
                .ToListAsync();
            blockers.AddRange(steps
                .Where(s => Stranded(s.FacultyId, s.DepartmentId, s.GroupId))
                .Select(s => new RoleAssignmentBlocker(ControlledStep, $"{s.Title} · {s.Code}")));
        }

        return blockers;
    }
}
