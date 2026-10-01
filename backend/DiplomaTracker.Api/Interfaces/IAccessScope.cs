using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IAccessScope
{
    IQueryable<Group> VisibleGroups(UserContext user);
    Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId);

    /// Phase 12 §4.2: the students the caller opens in full in the role they act in - a teacher their
    /// supervised students, a direction manager the students of their directions; an administrator
    /// every student.
    IQueryable<StudentProfile> ReviewableStudents(UserContext user);
    Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId);

    /// O3, phase 12 §4.2: every active student the caller works with in the role they act in - the
    /// students they open in full (ReviewableStudents), plus, for a teacher, students on whose steps
    /// they sit as an extra reviewer, and for a standards controller, students of the group steps
    /// they control. An administrator gets every active student. It decides whether a student's row
    /// appears and which groups the caller sees, not whether the caller may open a given step - run
    /// CanSeeStudentTaskAsync's rule for that.
    IQueryable<StudentProfile> ReviewOverviewStudents(UserContext user);

    /// Design 2026-09-24 §3.4, phase 12 §4.2: who may open one student step. The student's supervisor
    /// acting as teacher and the manager of their topic's direction acting as direction manager open
    /// every step of the student; an extra reviewer (as teacher) and a standards controller only the
    /// step they sit on; an administrator every step.
    Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId);
}
