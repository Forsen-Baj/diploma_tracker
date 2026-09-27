using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IAccessScope
{
    IQueryable<Group> VisibleGroups(UserContext user);
    Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId);
    IQueryable<StudentProfile> ReviewableStudents(UserContext user);
    Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId);

    /// O3: every active, non-archived student a reviewer's Review tab LISTS - the students
    /// ReviewableStudents already gives (supervised, or in a group they review), plus students
    /// for whom the caller holds an extra-reviewer seat on any step. An administrator sees every
    /// active student. This is deliberately broader than CanSeeStudentTaskAsync below: it decides
    /// whether a student's row appears at all, not whether the caller may open that row's current
    /// step - an extra seat on step 2 lists the student even while their current step is step 3,
    /// which the caller cannot open. Callers must run CanSeeStudentTaskAsync's own rule (or its
    /// equivalent) per row against the actual step being linked to, never infer openability from
    /// membership in this query.
    IQueryable<StudentProfile> ReviewOverviewStudents(UserContext user);

    /// Design 2026-09-24 §3.4: who may open one student step. Today's rule (the student's
    /// supervisor, a reviewer of their group, an administrator), or an extra seat on that very step.
    /// An extra seat grants nothing else - not the group, not the student's other steps. This is
    /// the narrower, per-task rule ReviewOverviewStudents' own doc comment above points back to.
    Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId);
}
