# Scoped Staff Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teacher, direction manager and standards controller become roles an administrator assigns per faculty, department or group. A staff member acts in one role at a time and switches from the user menu. Group reviewers are removed. The plan also carries the phase 11 follow-up O1: completing an administrator's topic replacement refreshes the student's unfinished steps.

**Architecture:** `AppUser.Role` becomes `Admin`, `Staff` or `Student`. A `RoleAssignment` row gives a staff account one role for one place, and `RoleCoverage` answers "does this person cover this group or department in this role" from the database on every call. The token's role claim is the acting role (`Teacher`, `DirectionManager`, `StandardsController`, or `Staff` for none), so `[Authorize(Roles = ...)]` and `UserContext` keep working. `SessionStateValidator` refuses a claim the account no longer holds. Every visibility rule in `IAccessScope`, the review queue, the panels and the topic requests keys on the acting role. Coverage is checked only when someone takes work on. Removing an assignment is refused while work in its scope depends on it.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-27-scoped-staff-roles-design.md` (amended 2026-09-28). The O1 follow-up is described in `docs/superpowers/PROJECT_MEMORY.md`, log entry of 2026-09-27 (phase 11 implemented).

**Prerequisites:** phases 1–11 implemented and committed; branch `phase11-12` at `de264f6` or later.

## Global Constraints

- `AppUser.Role` is `Admin`, `Staff` or `Student`. `AppUser.IsDirectionManager`, `AppUser.IsStandardsController`, `GroupReviewer`, `ArchivedGroupReviewer` and their tables no longer exist.
- `RoleAssignment`: `Id`, `UserId` (a `Staff` account), `Role` (`Teacher` | `DirectionManager` | `StandardsController`, stored as its name), `ScopeKind` (`Faculty` | `Department` | `Group`, stored as its name), `ScopeId`, `CreatedById`, `CreatedAt`. Unique on (`UserId`, `Role`, `ScopeKind`, `ScopeId`). A direction manager is never assigned at group level.
- A faculty assignment covers its departments and groups; a department assignment covers its groups. Coverage counts only active `Staff` accounts.
- The token's role claim is the acting role: `Admin`, `Student`, `Teacher`, `DirectionManager`, `StandardsController`, or `Staff` for a staff member acting in no role. At sign-in a staff member acts in the first role they hold, in the order Teacher, DirectionManager, StandardsController.
- `SessionStateValidator` refuses a staff token whose claim is a role the account holds nowhere (reason `RoleWithdrawn`).
- Coverage is checked when work is taken on (publishing a topic, becoming a supervisor, a manager, an extra reviewer or a group step's controller, opening a direction), never when held work is decided.
- A caller outside their own scope gets `scope.notCovered` (403). Naming another person who does not cover the place gets that field's existing `…Invalid` code (400).
- Removing an assignment is refused with `roleAssignment.inUse` (409) and `errors: [{ kind, label }]` while work in its scope depends on it and no other assignment of the same person and role covers it.
- Error bodies follow the `{ code, message }` contract. Every new code goes into its C# catalogue **and** into both `src/i18n/uk.json` and `src/i18n/en.json`.
- Every `DateTime` is UTC; never `DateTime.Now`.
- **No unit tests.** The existing test project must still compile and pass.
- **Commits: exactly one**, in the final task: `Implement scoped staff roles`. One bare title line, no body, no trailer.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, anything under `App_Data/`, or `.superpowers/sdd/`.
- The local database is recreated (regenerated `InitialCreate`), with the owner's permission.

## Rulings recorded while planning

- **The acting role is the token's role claim.** A staff member with no assignment carries `Staff`, which only `[Authorize]`-without-roles endpoints and the template and document endpoints accept. `UserContext.IsTeacher` now means "acting as teacher"; `UserContext.IsStaff` means "a staff account, in any role or none".
- **Staff administration moves from `/api/teachers` to `/api/staff`.** `GET/POST /api/staff`, `GET/PUT /api/staff/{id}`, `PATCH /api/staff/{id}/deactivate`, `PUT /api/staff/{id}/password`, `POST /api/staff/{id}/roles`, `DELETE /api/staff/{id}/roles/{assignmentId}` are the administrator's. `GET /api/staff/options` stays open to every staff role and replaces its `capability` filter with `role`, `groupId`, `departmentId` and `studentTaskId`. `GET /api/staff` takes `role`, `groupId` and `departmentId` too, for the student form's supervisor list.
- **Enum values travel as their names.** Request bodies carry `role` and `scopeKind` as strings, parsed by name; responses send names.
- **Deleting a faculty, department or group deletes the assignments scoped to it,** in the same save. `ScopeId` is not a foreign key, because it names a row in one of three tables.
- **A group move keeps the supervisor,** even when their teacher role does not cover the new group (spec §4, *When coverage is checked*).
- **One dashboard endpoint for the three staff roles.** `GET /api/dashboard/teacher` answers `Teacher`, `DirectionManager` and `StandardsController` with the same shape, filled from what the acting role holds.
- **Staff routes move from `/teacher/*` to `/staff/*`** in the interface: `/staff/dashboard`, `/staff/groups`, `/staff/groups/:groupId`, `/staff/topics` (teacher), `/staff/directions` (direction manager). A staff member acting in no role lands on `/documents`. The Staff page is `/admin/staff`, a person's page `/admin/staff/:id`.
- **A group's progress page lists every active student of a visible group,** split into *My students* and *Others* as before; only students the caller opens in full (supervised, or in a managed direction) open. A standards controller sees the groups of the steps they control and opens those steps from the *Review* tab.
- **The archive stamps `SupervisorId` on every archived file and review** — the student's supervisor at the moment of archiving, not a foreign key. An acting teacher reads an archived group when any row there carries their id, and sees only those rows.
- **Topic approvals are by person.** `TopicApprovalPanel.Evaluate` is unchanged: one approval fills every seat its author holds. `SeatsOf` follows the acting role, so a request appears and can be decided in each role that holds a seat on it.
- **O1 refresh runs only when a completing request replaces a held topic.** A student with no topic has never submitted, so their steps have nothing to refresh.
- **Deactivation keeps the phase 11 guards** (`staff.managesDirections`, `staff.controlsSteps`). A deactivated account's assignments stay; coverage ignores inactive accounts.
- **`GET /api/directions?covered=true`** returns the directions of departments the caller's acting role covers, for the teacher's topic form. **`GET /api/topics/supervisors?departmentId=`** returns the teachers who cover that department; for a student it returns the teachers who cover the student's group.
- **Group-step writes are the administrators'.** `POST /api/group-tasks`, `POST /api/groups/{id}/assign-all-task-templates` and `PUT /api/group-tasks/{id}` answer 403 to staff.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/StaffRole.cs`, `RoleScopeKind.cs`, `RoleAssignment.cs` (new) | Role model |
| `backend/DiplomaTracker.Api/Entities/AppUser.cs`, `Group.cs`, `ArchivedGroup.cs`, `ArchivedFile.cs`, `ArchivedReview.cs` | Adjusted domain |
| `backend/DiplomaTracker.Api/Entities/GroupReviewer.cs`, `ArchivedGroupReviewer.cs` | Deleted |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Services/AccountRoles.cs` (new), `UserContext.cs` | Role names and the caller |
| `backend/DiplomaTracker.Api/Services/RoleCoverage.cs` (new, replaces `StaffCapabilityQueries.cs`) | Who covers what |
| `backend/DiplomaTracker.Api/Services/RoleAssignmentReader.cs`, `RoleAssignmentUsage.cs` (new) | Assignment display and the removal check |
| `backend/DiplomaTracker.Api/Services/RoleErrors.cs` (new), `StaffErrors.cs`, `OnboardingErrors.cs`, `GroupErrors.cs`, `TopicErrors.cs`, `DirectionErrors.cs`, `TaskErrors.cs`, `WorkflowErrors.cs`, `Errors/ErrorCatalog.cs` | Error codes |
| `backend/DiplomaTracker.Api/Services/StaffService.cs`, `Interfaces/IStaffService.cs`, `Controllers/StaffController.cs`, `DTOs/Staff/*` (replace the teacher service, interface, controller and DTOs) | Staff administration and the picker |
| `backend/DiplomaTracker.Api/Services/AuthService.cs`, `SessionStateValidator.cs`, `Interfaces/IAuthService.cs`, `Controllers/AuthController.cs`, `Models/CurrentUserResponse.cs`, `Models/ActingRoleRequest.cs` (new) | Sign-in and the acting role |
| `backend/DiplomaTracker.Api/Services/AccessScope.cs`, `Interfaces/IAccessScope.cs` | Visibility by acting role |
| `backend/DiplomaTracker.Api/Services/ReviewPanel.cs`, `TopicApprovalPanel.cs`, `StudentWorkflowService.cs` | Seats by acting role, the queue, the extra-reviewer rule |
| `backend/DiplomaTracker.Api/Services/GroupService.cs`, `GroupTaskService.cs`, `Interfaces/IGroupService.cs`, `DTOs/Groups/*Reviewer*`, `Controllers/GroupsController.cs`, `Controllers/GroupTasksController.cs` | Group reviewers removed; group-step writes admin-only |
| `backend/DiplomaTracker.Api/Services/ArchiveService.cs`, `DTOs/Archive/ArchiveResponses.cs` | The archive by supervisor |
| `backend/DiplomaTracker.Api/Services/DashboardService.cs`, `DocumentTemplateService.cs`, `DocumentService.cs` | Dashboards, templates and recipients |
| `backend/DiplomaTracker.Api/Services/DirectionService.cs`, `TopicService.cs`, `ReservationService.cs`, `StudentService.cs`, `DTOs/Directions/DirectionQuery.cs`, `Interfaces/ITopicService.cs` | Taking work on within scope; O1 |
| `backend/DiplomaTracker.Api/Services/FacultyService.cs`, `DepartmentService.cs`, `DbSeeder.cs`, `SecurityLog.cs`, `Program.cs` | Supporting changes |
| `backend/DiplomaTracker.Api/Controllers/*.cs` (role lists) | Endpoint roles |
| `backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs`, `GroupServiceTests.cs` | Keep the suite compiling and green |
| `.superpowers/checks/checkCleanup.mjs`, every `*-check.mjs`, `scoped-roles-check.mjs` (new) | Endpoint verification |
| `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md` | Demo data |
| `frontend/diploma-tracker-web/src/api/types.ts`, `staffApi.ts` (new, replaces `teachersApi.ts`), `authApi.ts`, `groupsApi.ts`, `workflowApi.ts`, `topicsApi.ts`, `directionsApi.ts` | Client |
| `frontend/diploma-tracker-web/src/auth/*`, `components/layout/navigation.ts`, `AppShell.tsx`, `UserMenu.tsx`, `App.tsx`, `pages/LoginPage.tsx` | Acting role, navigation, routes |
| `frontend/diploma-tracker-web/src/pages/StaffPage.tsx` (renamed from `TeachersPage.tsx`), `StaffMemberPage.tsx` (new), `components/staff/AddRoleModal.tsx` (new), `components/staff/RoleBadges.tsx` (new) | Staff administration |
| `frontend/diploma-tracker-web/src/pages/*` and `components/*` listed in Task 6 | Pages that change |
| `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json` | Translations |
| `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md` | Project records |

## Execution notes

- Tasks 1–3 (backend) go to `csharp-developer` (or `dotnet-core-expert`). Each ends with a green `dotnet build` and a green test run.
- Task 4 (check scripts and demo) goes to a general agent or the controller. It can be written before the database is recreated, but runs only in Task 7.
- Tasks 5–6 (frontend) go to `react-specialist`. Task 5 ends with a clean `tsc -b`; Task 6 with the full frontend gate.
- No task needs the database until Task 7, which drops and regenerates it: **ask the owner first**.
- Task 7 runs one `code-reviewer` pass over the whole phase and fixes its findings in one wave, before the single commit.

---

### Task 1: Role model, sign-in and staff administration

This task lays down the whole phase's schema changes except the removal of group reviewers (Task 2), and makes roles work end to end on the server: assigning and removing them, signing in with an acting role, switching it, and the session check. Directions and standards controllers move from the flags to coverage here, because the flags are gone. The build is green at the end.

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/StaffRole.cs`, `RoleScopeKind.cs`, `RoleAssignment.cs`
- Create: `backend/DiplomaTracker.Api/Services/AccountRoles.cs`, `RoleCoverage.cs`, `RoleAssignmentReader.cs`, `RoleAssignmentUsage.cs`, `RoleErrors.cs`, `StaffService.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IStaffService.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Staff/StaffResponse.cs`, `CreateStaffRequest.cs`, `UpdateStaffRequest.cs`, `SetStaffPasswordRequest.cs`, `StaffOptionResponse.cs`, `StaffOptionsQuery.cs`, `StaffListQuery.cs`, `AddRoleAssignmentRequest.cs`, `RoleAssignmentResponse.cs`, `RoleAssignmentBlocker.cs`
- Create: `backend/DiplomaTracker.Api/Models/ActingRoleRequest.cs`
- Delete: `backend/DiplomaTracker.Api/Services/StaffCapabilityQueries.cs`, `Services/TeacherService.cs`, `Interfaces/ITeacherService.cs`, `Controllers/TeachersController.cs`, the whole `DTOs/Teachers/` folder
- Replace: `backend/DiplomaTracker.Api/Controllers/StaffController.cs`, `Services/AuthService.cs`, `Services/SessionStateValidator.cs`, `Services/UserContext.cs`, `Models/CurrentUserResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/AppUser.cs`, `ArchivedFile.cs`, `ArchivedReview.cs`, `Direction.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StaffErrors.cs`, `OnboardingErrors.cs`, `Errors/ErrorCatalog.cs`, `Services/SecurityLog.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IAuthService.cs`, `Controllers/AuthController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DirectionService.cs`, `DTOs/Directions/DirectionQuery.cs`, `Controllers/DirectionsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs` (one method)
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs`, `FacultyService.cs`, `DepartmentService.cs`, `GroupService.cs` (deletion only), `Program.cs`
- Modify: `backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs`

**Interfaces:**
- Produces entities `StaffRole`, `RoleScopeKind`, `RoleAssignment`, `AppDbContext.RoleAssignments`, `AppUser.RoleAssignments`, `ArchivedFile.SupervisorId`, `ArchivedReview.SupervisorId` (both `Guid?`).
- Produces constants `AccountRoles.{Admin, Staff, Student}`, `ActingRoles.{Teacher, DirectionManager, StandardsController, None}`, `AuthRoles.{Admin, AnyStaffRole, AdminOrAnyStaffRole, AdminOrStaff, AdminOrTeacher, AdminOrDirectionManager, AdminTeacherOrManager}`.
- Produces `UserContext.{IsAdmin, IsStudent, IsTeacher, IsDirectionManager, IsStandardsController, IsStaff, ActingRole}` (`ActingRole` is `StaffRole?`).
- Produces `RoleCoverage` extension methods on `AppDbContext`: `CoveringGroup(StaffRole, Guid groupId)` and `CoveringDepartment(StaffRole, Guid departmentId)` (both `IQueryable<RoleAssignment>`), `CoversGroupAsync(Guid userId, StaffRole, Guid groupId)`, `CoversDepartmentAsync(Guid userId, StaffRole, Guid departmentId)`, `HoldsRoleAsync(Guid userId, StaffRole)` (all `Task<bool>`), and the static `RoleCoverage.Covers(RoleAssignment, Guid facultyId, Guid departmentId, Guid? groupId)`.
- Produces error constants `RoleErrors.{ScopeInvalid, ScopeNotAllowed, Exists, NotFound, InUse, RoleNotHeld, NotCovered}` and `StaffErrors.NotFound`.
- Produces `IStaffService` (below) and `IAuthService.GetCurrentUserAsync(Guid userId, string actingRole)` and `SwitchActingRoleAsync(Guid userId, string role)`.
- Wire shapes, camelCase:
  - `RoleAssignmentResponse`: `id`, `role`, `scopeKind`, `scopeId`, `scopeName`, `scopePath`, `facultyId`, `departmentId`, `groupId`, `createdAt`.
  - `StaffResponse`: `id`, `firstName`, `lastName`, `patronymic`, `email`, `isActive`, `assignments`, `createdAt`, `updatedAt`.
  - `CurrentUserResponse`: `id`, `firstName`, `lastName`, `email`, `role` (acting), `accountRole`, `assignments`.
  - `RoleAssignmentBlocker`: `kind` (`supervisedStudent` | `supervisedTopic` | `panelSeat` | `managedDirection` | `controlledStep`), `label`.
  - `POST /api/auth/acting-role` `{ role }` answers `{ token, user }` like sign-in.

- [ ] **Step 1: The role entities and the adjusted entities**

`Entities/StaffRole.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-27 (phase 12) §3: the roles an administrator assigns to a staff account, each for
/// one faculty, department or group. Stored as its name. The order is the sign-in order (§5): a
/// staff member starts in the first role they hold.
public enum StaffRole
{
    Teacher,
    DirectionManager,
    StandardsController
}
```

`Entities/RoleScopeKind.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Where a role assignment applies. A faculty covers its departments and groups; a department its
/// groups (design 2026-09-27, phase 12, §3). Stored as its name.
public enum RoleScopeKind
{
    Faculty,
    Department,
    Group
}
```

`Entities/RoleAssignment.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Design 2026-09-27 (phase 12) §3: one role for one place. A person may hold several - a teacher in
/// one group and a direction manager in another department.
public class RoleAssignment
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public StaffRole Role { get; set; }
    public RoleScopeKind ScopeKind { get; set; }

    /// The faculty, department or group. Not a foreign key, because it names a row in one of three
    /// tables; deleting the place deletes the assignments scoped to it (§3).
    public Guid ScopeId { get; set; }

    public Guid CreatedById { get; set; }
    public DateTime CreatedAt { get; set; }
    public AppUser User { get; set; } = null!;
    public AppUser CreatedBy { get; set; } = null!;
}
```

`Entities/AppUser.cs`: delete the comment block and the two lines

```csharp
    /// Design 2026-09-27 §3: capabilities of a Teacher account. Read from the database on every
    /// request, never from the token.
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
```

and replace

```csharp
    public string Role { get; set; } = string.Empty;
```

with

```csharp
    /// Admin, Staff or Student (design 2026-09-27, phase 12, §3). A staff member's roles are their
    /// RoleAssignments; the role a session acts in is the token's role claim.
    public string Role { get; set; } = string.Empty;
```

Add after `ManagedDirections`:

```csharp
    public ICollection<RoleAssignment> RoleAssignments { get; set; } = new List<RoleAssignment>();
```

`GroupReviews` stays until Task 2.

`Entities/ArchivedFile.cs`: add after `StudentNumber`:

```csharp
    /// The student's supervisor when this file was archived (design 2026-09-27, phase 12, §4.1): an
    /// acting teacher reads the rows that carry their id. Not a foreign key - the archive refers to
    /// nothing live.
    public Guid? SupervisorId { get; set; }
```

`Entities/ArchivedReview.cs`: add the same property, with the same comment, after `StudentNumber`.

`Entities/Direction.cs`: replace the comment line

```csharp
    /// An active teacher with IsDirectionManager. They approve every topic request in this
```

with

```csharp
    /// An active staff member whose direction-manager role covers the department. They approve every topic request in this
```

- [ ] **Step 2: Mapping**

`Data/AppDbContext.cs`:
- Add after `public DbSet<Direction> Directions => Set<Direction>();`:

```csharp
    public DbSet<RoleAssignment> RoleAssignments => Set<RoleAssignment>();
```

- In the `user` block delete the two lines

```csharp
        user.Property(x => x.IsDirectionManager).IsRequired();
        user.Property(x => x.IsStandardsController).IsRequired();
```

- Add right after the `user` block:

```csharp
        // Design 2026-09-27 (phase 12) §3. ScopeId names a faculty, a department or a group, so it is
        // not a foreign key; the services that delete those places delete the assignments with them.
        var roleAssignment = modelBuilder.Entity<RoleAssignment>();
        roleAssignment.ToTable("RoleAssignments");
        roleAssignment.HasKey(x => x.Id);
        roleAssignment.Property(x => x.Role).HasConversion<string>().HasMaxLength(50).IsRequired();
        roleAssignment.Property(x => x.ScopeKind).HasConversion<string>().HasMaxLength(50).IsRequired();
        roleAssignment.Property(x => x.CreatedAt).IsRequired();
        roleAssignment.HasIndex(x => new { x.UserId, x.Role, x.ScopeKind, x.ScopeId }).IsUnique();
        roleAssignment.HasIndex(x => new { x.ScopeKind, x.ScopeId });
        roleAssignment.HasOne(x => x.User)
            .WithMany(x => x.RoleAssignments)
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);
        roleAssignment.HasOne(x => x.CreatedBy)
            .WithMany()
            .HasForeignKey(x => x.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);
```

- In the `archivedFile` block, after `archivedFile.HasIndex(x => new { x.ArchivedGroupId, x.StudentName, x.StepOrder, x.Version });`, add:

```csharp
        archivedFile.HasIndex(x => x.SupervisorId);
```

- In the `archivedReview` block, after its unique index, add:

```csharp
        archivedReview.HasIndex(x => x.SupervisorId);
```

- [ ] **Step 3: Role names and the caller**

`Services/AccountRoles.cs`:

```csharp
namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §3: the account role stored on AppUser.
public static class AccountRoles
{
    public const string Admin = "Admin";
    public const string Staff = "Staff";
    public const string Student = "Student";
}

/// Design 2026-09-27 (phase 12) §5: the role a token carries. An administrator's and a student's
/// token carry their account role; a staff member's carries the staff role they act in, or Staff
/// while they hold none. The three role names are StaffRole's.
public static class ActingRoles
{
    public const string Teacher = "Teacher";
    public const string DirectionManager = "DirectionManager";
    public const string StandardsController = "StandardsController";
    public const string None = AccountRoles.Staff;
}

/// Role lists for [Authorize(Roles = ...)], which takes constants.
public static class AuthRoles
{
    public const string Admin = AccountRoles.Admin;
    public const string AnyStaffRole = "Teacher,DirectionManager,StandardsController";
    public const string AdminOrAnyStaffRole = "Admin,Teacher,DirectionManager,StandardsController";

    /// A staff member acting in no role too: templates and documents are every staff member's.
    public const string AdminOrStaff = "Admin,Teacher,DirectionManager,StandardsController,Staff";

    public const string AdminOrTeacher = "Admin,Teacher";
    public const string AdminOrDirectionManager = "Admin,DirectionManager";

    /// Topic approvals and step panels: a supervisor acts as teacher, a direction manager as one.
    public const string AdminTeacherOrManager = "Admin,Teacher,DirectionManager";
}
```

`Services/UserContext.cs` (whole file):

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// The caller: their id and the role their token carries (design 2026-09-27, phase 12, §5).
public sealed record UserContext(Guid UserId, string Role)
{
    public bool IsAdmin => Role == AccountRoles.Admin;
    public bool IsStudent => Role == AccountRoles.Student;

    /// A staff member acts in one role at a time; these name it.
    public bool IsTeacher => Role == ActingRoles.Teacher;
    public bool IsDirectionManager => Role == ActingRoles.DirectionManager;
    public bool IsStandardsController => Role == ActingRoles.StandardsController;

    /// A staff account, whatever role it acts in, or none.
    public bool IsStaff => IsTeacher || IsDirectionManager || IsStandardsController || Role == ActingRoles.None;

    public StaffRole? ActingRole =>
        IsTeacher ? StaffRole.Teacher
        : IsDirectionManager ? StaffRole.DirectionManager
        : IsStandardsController ? StaffRole.StandardsController
        : null;
}
```

- [ ] **Step 4: Coverage**

Delete `Services/StaffCapabilityQueries.cs`. Create `Services/RoleCoverage.cs`:

```csharp
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
```

- [ ] **Step 5: Error codes**

Create `Services/RoleErrors.cs`:

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §5-§6.
public static class RoleErrors
{
    public const string ScopeInvalid = "roleAssignment.scopeInvalid";
    public const string ScopeNotAllowed = "roleAssignment.scopeNotAllowed";
    public const string Exists = "roleAssignment.exists";
    public const string NotFound = "roleAssignment.notFound";
    public const string InUse = "roleAssignment.inUse";
    public const string RoleNotHeld = "actingRole.notHeld";
    public const string NotCovered = "scope.notCovered";

    public static readonly ErrorDefinition[] All =
    [
        new(ScopeInvalid, StatusCodes.Status400BadRequest, "The selected faculty, department or group does not exist."),
        new(ScopeNotAllowed, StatusCodes.Status400BadRequest, "A direction manager is assigned to a faculty or a department."),
        new(Exists, StatusCodes.Status409Conflict, "This person already holds this role there."),
        new(NotFound, StatusCodes.Status404NotFound, "Role assignment not found."),
        new(InUse, StatusCodes.Status409Conflict, "The role is in use there. Reassign the work listed first."),
        new(RoleNotHeld, StatusCodes.Status403Forbidden, "You do not hold this role."),
        new(NotCovered, StatusCodes.Status403Forbidden, "This is outside the faculty, department or group your role covers.")
    ];
}
```

`Services/StaffErrors.cs` (whole file):

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class StaffErrors
{
    public const string NotFound = "staff.notFound";
    public const string ManagesDirections = "staff.managesDirections";
    public const string ControlsSteps = "staff.controlsSteps";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Staff member not found."),
        new(ManagesDirections, StatusCodes.Status409Conflict, "This staff member manages a direction. Hand it to another manager first."),
        new(ControlsSteps, StatusCodes.Status409Conflict, "This staff member is the standards controller of a group step. Assign someone else first.")
    ];
}
```

`Services/OnboardingErrors.cs`: delete the constant `TeacherNotFound` and its definition line `new(TeacherNotFound, StatusCodes.Status404NotFound, "Teacher not found."),`.

`Errors/ErrorCatalog.cs`: add `RoleErrors.All,` after `StaffErrors.All,`.

- [ ] **Step 6: Staff DTOs**

Delete the folder `DTOs/Teachers/`. Create the following files in `DTOs/Staff/`, all in `namespace DiplomaTracker.Api.DTOs.Staff;`.

`CreateStaffRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;
using DiplomaTracker.Api.Validation;

namespace DiplomaTracker.Api.DTOs.Staff;

public class CreateStaffRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, ValidEmail, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
```

`UpdateStaffRequest.cs`: the same class named `UpdateStaffRequest` without `Password`.

`SetStaffPasswordRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Staff;

public class SetStaffPasswordRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}
```

`StaffOptionResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Staff;

/// A staff member or an administrator offered by a picker (design 2026-09-24 §3.5). Role is the
/// account role, Admin or Staff.
public sealed record StaffOptionResponse(Guid Id, string Name, string Role, string Email);
```

`StaffOptionsQuery.cs`:

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.DTOs.Staff;

/// The pickers (design 2026-09-27, phase 12, §4). `studentTaskId` asks for the extra-reviewer
/// picker of that step: administrators and teachers who cover the student's group. Otherwise `role`
/// narrows to staff holding it - for `groupId` or `departmentId` when given, anywhere when not.
/// Bound from the query string; enum names are matched without regard to case.
public class StaffOptionsQuery
{
    public string? Search { get; set; }
    public StaffRole? Role { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? StudentTaskId { get; set; }
}
```

`StaffListQuery.cs`:

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.DTOs.Staff;

/// The administrator's staff list. With `role`, only staff holding it - for `groupId` or
/// `departmentId` when given (the student form's supervisor list).
public class StaffListQuery
{
    public StaffRole? Role { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? DepartmentId { get; set; }
}
```

`AddRoleAssignmentRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Staff;

/// `role` is Teacher, DirectionManager or StandardsController; `scopeKind` Faculty, Department or
/// Group. Both by name.
public class AddRoleAssignmentRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;

    [Required]
    public string ScopeKind { get; set; } = string.Empty;

    [Required]
    public Guid? ScopeId { get; set; }
}
```

`RoleAssignmentResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Staff;

public class RoleAssignmentResponse
{
    public Guid Id { get; set; }
    public string Role { get; set; } = string.Empty;
    public string ScopeKind { get; set; } = string.Empty;
    public Guid ScopeId { get; set; }

    /// The faculty's or department's name, or the group's code.
    public string ScopeName { get; set; } = string.Empty;

    /// Short names from the faculty down, e.g. "ФІОТ / ІПЗ / ІП-21".
    public string ScopePath { get; set; } = string.Empty;

    /// The place's faculty, and its department and group where it has them, so the interface can
    /// tell what the assignment covers without another request.
    public Guid FacultyId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? GroupId { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

`RoleAssignmentBlocker.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Staff;

/// One piece of work that keeps an assignment from being removed (design 2026-09-27, phase 12, §6).
/// Kind is supervisedStudent, supervisedTopic, panelSeat, managedDirection or controlledStep; Label
/// names it for the administrator.
public sealed record RoleAssignmentBlocker(string Kind, string Label);
```

`StaffResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Staff;

public class StaffResponse
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public IReadOnlyList<RoleAssignmentResponse> Assignments { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

- [ ] **Step 7: Reading assignments and the removal check**

`Services/RoleAssignmentReader.cs`:

```csharp
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
```

`Services/RoleAssignmentUsage.cs`:

```csharp
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
```

- [ ] **Step 8: The staff service**

Delete `Services/TeacherService.cs` and `Interfaces/ITeacherService.cs`. Create `Interfaces/IStaffService.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Staff;

namespace DiplomaTracker.Api.Interfaces;

public interface IStaffService
{
    Task<IReadOnlyList<StaffResponse>> GetStaffAsync(StaffListQuery query);
    Task<StaffResponse?> GetStaffMemberAsync(Guid id);
    Task<(StaffResponse? staff, string? error)> CreateStaffAsync(CreateStaffRequest request, Guid administratorId);
    Task<(StaffResponse? staff, string? error)> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid administratorId);
    Task<(bool success, string? error)> DeactivateStaffAsync(Guid id, Guid administratorId);
    Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId);
    Task<IReadOnlyList<StaffOptionResponse>> SearchOptionsAsync(StaffOptionsQuery query);
    Task<(RoleAssignmentResponse? assignment, string? error)> AddAssignmentAsync(Guid staffId, AddRoleAssignmentRequest request, Guid administratorId);
    Task<(bool success, string? error, IReadOnlyList<RoleAssignmentBlocker>? blockers)> RemoveAssignmentAsync(Guid staffId, Guid assignmentId, Guid administratorId);
}
```

Create `Services/StaffService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 (phase 12) §6: staff accounts, and the roles an administrator assigns them for a
/// faculty, a department or a group.
public class StaffService : IStaffService
{
    private const int OptionLimit = 20;
    private const int SearchMaxLength = 100;

    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ILogger<StaffService> _logger;

    public StaffService(AppDbContext dbContext, IPasswordHasher passwordHasher, ILogger<StaffService> logger)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task<IReadOnlyList<StaffResponse>> GetStaffAsync(StaffListQuery query)
    {
        var users = _dbContext.Users.AsNoTracking().Where(u => u.Role == AccountRoles.Staff);

        // The student form's supervisor list: the teachers who cover the student's group (§4).
        if (query.Role is { } role)
        {
            var holders = HoldersOf(role, query.GroupId, query.DepartmentId);
            users = users.Where(u => holders.Contains(u.Id));
        }

        var rows = await users.OrderBy(u => u.LastName).ThenBy(u => u.FirstName).ToListAsync();
        var assignments = await RoleAssignmentReader.ReadAsync(_dbContext, rows.Select(u => u.Id).ToList());
        return rows.Select(u => Map(u, assignments)).ToList();
    }

    public async Task<StaffResponse?> GetStaffMemberAsync(Guid id)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return null;
        }

        return Map(user, await RoleAssignmentReader.ReadAsync(_dbContext, [user.Id]));
    }

    public async Task<(StaffResponse? staff, string? error)> CreateStaffAsync(CreateStaffRequest request, Guid administratorId)
    {
        var email = IdentityNormalizer.Email(request.Email);
        if (await _dbContext.Users.AnyAsync(u => u.Email == email))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (!PasswordPolicy.IsSatisfiedBy(request.Password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Patronymic = IdentityNormalizer.Optional(request.Patronymic),
            Email = email,
            PasswordHash = _passwordHasher.HashPassword(request.Password),
            Role = AccountRoles.Staff,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Staff", user.Id);
        return (Map(user, new Dictionary<Guid, List<RoleAssignmentResponse>>()), null);
    }

    public async Task<(StaffResponse? staff, string? error)> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (null, StaffErrors.NotFound);
        }

        var email = IdentityNormalizer.Email(request.Email);
        if (await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != id))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        user.Email = email;
        user.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Staff", user.Id);
        return (await GetStaffMemberAsync(id), null);
    }

    public async Task<(bool success, string? error)> DeactivateStaffAsync(Guid id, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (false, StaffErrors.NotFound);
        }

        // Phase 11 §3, kept: a deactivated manager or controller would hold a seat nobody can fill.
        if (await _dbContext.Directions.AnyAsync(d => d.ManagerId == id))
        {
            return (false, StaffErrors.ManagesDirections);
        }

        if (await _dbContext.GroupTasks.AnyAsync(g => g.StandardsControllerId == id))
        {
            return (false, StaffErrors.ControlsSteps);
        }

        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        SecurityLog.AdministratorAction(_logger, administratorId, "Deactivated", "Staff", user.Id);
        return (true, null);
    }

    public async Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password, Guid administratorId)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == AccountRoles.Staff && u.Id == id);
        if (user is null)
        {
            return (false, StaffErrors.NotFound);
        }

        if (!PasswordPolicy.IsSatisfiedBy(password))
        {
            return (false, PasswordPolicy.Violation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "PasswordSet", "Staff", user.Id);
        return (true, null);
    }

    /// Design 2026-09-24 §3.5 and 2026-09-27 (phase 12) §4: the pickers. Active staff and
    /// administrators, narrowed by what the picker is for.
    public async Task<IReadOnlyList<StaffOptionResponse>> SearchOptionsAsync(StaffOptionsQuery query)
    {
        var users = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == AccountRoles.Staff || u.Role == AccountRoles.Admin));

        if (query.StudentTaskId is { } studentTaskId)
        {
            // The extra-reviewer picker: administrators, and teachers who cover the student's group.
            var groupId = await _dbContext.StudentTasks.AsNoTracking()
                .Where(t => t.Id == studentTaskId)
                .Select(t => (Guid?)t.StudentProfile.GroupId)
                .FirstOrDefaultAsync();
            if (groupId is null)
            {
                return [];
            }

            var teachers = _dbContext.CoveringGroup(StaffRole.Teacher, groupId.Value).Select(a => a.UserId);
            users = users.Where(u => u.Role == AccountRoles.Admin || teachers.Contains(u.Id));
        }
        else if (query.Role is { } role)
        {
            var holders = HoldersOf(role, query.GroupId, query.DepartmentId);
            users = users.Where(u => u.Role == AccountRoles.Staff && holders.Contains(u.Id));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var trimmed = query.Search.Trim();
            if (trimmed.Length > SearchMaxLength)
            {
                trimmed = trimmed[..SearchMaxLength];
            }

            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = trimmed.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            users = users.Where(u => EF.Functions.Like(u.LastName, $"%{term}%")
                || EF.Functions.Like(u.FirstName, $"%{term}%")
                || EF.Functions.Like(u.Email, $"%{term}%"));
        }

        var rows = await users
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Take(OptionLimit)
            .Select(u => new { u.Id, u.LastName, u.FirstName, u.Patronymic, u.Role, u.Email })
            .ToListAsync();

        return rows
            .Select(u => new StaffOptionResponse(u.Id, PersonName.Full(u.LastName, u.FirstName, u.Patronymic), u.Role, u.Email))
            .ToList();
    }

    public async Task<(RoleAssignmentResponse? assignment, string? error)> AddAssignmentAsync(Guid staffId, AddRoleAssignmentRequest request, Guid administratorId)
    {
        if (!await _dbContext.Users.AnyAsync(u => u.Id == staffId && u.Role == AccountRoles.Staff))
        {
            return (null, StaffErrors.NotFound);
        }

        // By name only: Enum.TryParse would also take "1".
        if (!Enum.GetNames<StaffRole>().Contains(request.Role) || !Enum.GetNames<RoleScopeKind>().Contains(request.ScopeKind))
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var role = Enum.Parse<StaffRole>(request.Role);
        var kind = Enum.Parse<RoleScopeKind>(request.ScopeKind);
        var scopeId = request.ScopeId!.Value;

        // §3: a direction lives in a department, so its manager covers a department or a faculty.
        if (role == StaffRole.DirectionManager && kind == RoleScopeKind.Group)
        {
            return (null, RoleErrors.ScopeNotAllowed);
        }

        var scopeExists = kind switch
        {
            RoleScopeKind.Faculty => await _dbContext.Faculties.AnyAsync(f => f.Id == scopeId),
            RoleScopeKind.Department => await _dbContext.Departments.AnyAsync(d => d.Id == scopeId),
            _ => await _dbContext.Groups.AnyAsync(g => g.Id == scopeId)
        };
        if (!scopeExists)
        {
            return (null, RoleErrors.ScopeInvalid);
        }

        if (await _dbContext.RoleAssignments.AnyAsync(a => a.UserId == staffId && a.Role == role && a.ScopeKind == kind && a.ScopeId == scopeId))
        {
            return (null, RoleErrors.Exists);
        }

        var assignment = new RoleAssignment
        {
            Id = Guid.NewGuid(),
            UserId = staffId,
            Role = role,
            ScopeKind = kind,
            ScopeId = scopeId,
            CreatedById = administratorId,
            CreatedAt = DateTime.UtcNow
        };
        _dbContext.RoleAssignments.Add(assignment);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, RoleErrors.Exists);
        }

        SecurityLog.RoleAssignmentChanged(_logger, administratorId, "Added", staffId, role.ToString(), kind.ToString(), scopeId);

        var read = await RoleAssignmentReader.ReadAsync(_dbContext, [staffId]);
        return (read[staffId].First(a => a.Id == assignment.Id), null);
    }

    public async Task<(bool success, string? error, IReadOnlyList<RoleAssignmentBlocker>? blockers)> RemoveAssignmentAsync(Guid staffId, Guid assignmentId, Guid administratorId)
    {
        var assignment = await _dbContext.RoleAssignments.FirstOrDefaultAsync(a => a.Id == assignmentId && a.UserId == staffId);
        if (assignment is null)
        {
            return (false, RoleErrors.NotFound, null);
        }

        // §6: refused while work in its scope depends on it; the refusal names that work.
        var blockers = await RoleAssignmentUsage.FindBlockersAsync(_dbContext, assignment);
        if (blockers.Count > 0)
        {
            return (false, RoleErrors.InUse, blockers);
        }

        _dbContext.RoleAssignments.Remove(assignment);
        await _dbContext.SaveChangesAsync();

        SecurityLog.RoleAssignmentChanged(_logger, administratorId, "Removed", staffId, assignment.Role.ToString(), assignment.ScopeKind.ToString(), assignment.ScopeId);
        return (true, null, null);
    }

    private IQueryable<Guid> HoldersOf(StaffRole role, Guid? groupId, Guid? departmentId) =>
        groupId is { } group ? _dbContext.CoveringGroup(role, group).Select(a => a.UserId)
        : departmentId is { } department ? _dbContext.CoveringDepartment(role, department).Select(a => a.UserId)
        : _dbContext.RoleAssignments.Where(a => a.Role == role).Select(a => a.UserId);

    private static StaffResponse Map(AppUser user, IReadOnlyDictionary<Guid, List<RoleAssignmentResponse>> assignments) => new()
    {
        Id = user.Id,
        FirstName = user.FirstName,
        LastName = user.LastName,
        Patronymic = user.Patronymic,
        Email = user.Email,
        IsActive = user.IsActive,
        Assignments = assignments.TryGetValue(user.Id, out var list) ? list : [],
        CreatedAt = user.CreatedAt,
        UpdatedAt = user.UpdatedAt
    };
}
```

- [ ] **Step 9: The staff controller**

Delete `Controllers/TeachersController.cs`. Replace `Controllers/StaffController.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Staff;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

/// Design 2026-09-27 (phase 12) §6: staff accounts and their roles are the administrators'; the
/// picker is every staff role's. Roles are set per action because the two rules differ.
[Route("api/staff")]
[Authorize]
public class StaffController : ApiControllerBase
{
    private readonly IStaffService _staff;

    public StaffController(IStaffService staff)
    {
        _staff = staff;
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] StaffListQuery query)
    {
        return Ok(await _staff.GetStaffAsync(query));
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var staff = await _staff.GetStaffMemberAsync(id);
        return staff is null ? ErrorResult(StaffErrors.NotFound) : Ok(staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStaffRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (staff, error) = await _staff.CreateStaffAsync(request, administratorId);
        return staff is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = staff.Id }, staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStaffRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (staff, error) = await _staff.UpdateStaffAsync(id, request, administratorId);
        return staff is null ? ErrorResult(error) : Ok(staff);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _staff.DeactivateStaffAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, [FromBody] SetStaffPasswordRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _staff.SetPasswordAsync(id, request.Password, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpPost("{id:guid}/roles")]
    public async Task<IActionResult> AddRole(Guid id, [FromBody] AddRoleAssignmentRequest request)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (assignment, error) = await _staff.AddAssignmentAsync(id, request, administratorId);
        return assignment is null ? ErrorResult(error) : StatusCode(StatusCodes.Status201Created, assignment);
    }

    [Authorize(Roles = AuthRoles.Admin)]
    [HttpDelete("{id:guid}/roles/{assignmentId:guid}")]
    public async Task<IActionResult> RemoveRole(Guid id, Guid assignmentId)
    {
        if (!TryGetUserContext(out _, out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error, blockers) = await _staff.RemoveAssignmentAsync(id, assignmentId, administratorId);
        return success ? NoContent() : ErrorResult(error, blockers);
    }

    [Authorize(Roles = AuthRoles.AdminOrAnyStaffRole)]
    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] StaffOptionsQuery query)
    {
        return Ok(await _staff.SearchOptionsAsync(query));
    }
}
```

`Program.cs`: replace `builder.Services.AddScoped<ITeacherService, TeacherService>();` with `builder.Services.AddScoped<IStaffService, StaffService>();`.

- [ ] **Step 10: Sign-in, the acting role and the session check**

`Models/CurrentUserResponse.cs` (whole file):

```csharp
using DiplomaTracker.Api.DTOs.Staff;

namespace DiplomaTracker.Api.Models;

public class CurrentUserResponse
{
    public string Id { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// The role this session acts in: Admin, Student, Teacher, DirectionManager,
    /// StandardsController, or Staff for a staff member acting in none (design 2026-09-27, phase 12, §5).
    public string Role { get; set; } = string.Empty;

    /// Admin, Staff or Student.
    public string AccountRole { get; set; } = string.Empty;

    /// A staff member's roles and where they hold them; empty for everyone else.
    public IReadOnlyList<RoleAssignmentResponse> Assignments { get; set; } = [];
}
```

`Models/ActingRoleRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.Models;

/// Design 2026-09-27 (phase 12) §5: Teacher, DirectionManager or StandardsController.
public class ActingRoleRequest
{
    [Required]
    public string Role { get; set; } = string.Empty;
}
```

`Interfaces/IAuthService.cs` (whole file):

```csharp
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
    Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, string actingRole);
    Task<(LoginResponse? result, string? error)> SwitchActingRoleAsync(Guid userId, string role);
    Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request);
    Task<(bool success, string? error)> ChangePasswordAsync(Guid userId, ChangePasswordRequest request);
}
```

`Services/AuthService.cs`: keep the class, its fields, its constructor, `RefuseClaim` and the body of `ChangePasswordAsync` as they are, and change the rest as follows.

In `LoginAsync`, replace the tail from `SecurityLog.SignInSucceeded(_logger, user.Id, user.Role);` to the end of the method with:

```csharp
        var actingRole = await DefaultActingRoleAsync(user);
        SecurityLog.SignInSucceeded(_logger, user.Id, actingRole);

        return new LoginResponse
        {
            Token = CreateToken(user, actingRole),
            User = await MapCurrentUserAsync(user, actingRole)
        };
```

Replace `GetCurrentUserAsync` with:

```csharp
    public async Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, string actingRole)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        return user is null ? null : await MapCurrentUserAsync(user, actingRole);
    }

    /// Design 2026-09-27 (phase 12) §5: a new token in another role the staff member holds. The
    /// session check re-reads the role on every request, so the old token stays valid only while
    /// its own role is still held.
    public async Task<(LoginResponse? result, string? error)> SwitchActingRoleAsync(Guid userId, string role)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        if (user is null)
        {
            return (null, OnboardingErrors.UserNotFound);
        }

        if (user.Role != AccountRoles.Staff
            || !Enum.GetNames<StaffRole>().Contains(role)
            || !await _dbContext.HoldsRoleAsync(userId, Enum.Parse<StaffRole>(role)))
        {
            return (null, RoleErrors.RoleNotHeld);
        }

        SecurityLog.ActingRoleSwitched(_logger, userId, role);
        return (new LoginResponse
        {
            Token = CreateToken(user, role),
            User = await MapCurrentUserAsync(user, role)
        }, null);
    }
```

In `ClaimAccountAsync`, replace the returned object with:

```csharp
        return (new LoginResponse
        {
            Token = CreateToken(profile.User, AccountRoles.Student),
            User = await MapCurrentUserAsync(profile.User, AccountRoles.Student)
        }, null);
```

In `ChangePasswordAsync`, replace both `user.Role == "Admin"` with `user.Role == AccountRoles.Admin`. In the claim query and its `ExecuteUpdateAsync` filter, replace `"Student"` with `AccountRoles.Student`.

Replace `CreateToken` and `MapCurrentUser` with:

```csharp
    private string CreateToken(AppUser user, string actingRole)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.GivenName, user.FirstName),
            new(JwtRegisteredClaimNames.FamilyName, user.LastName),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Role, actingRole)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpiresInMinutes);

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// Design 2026-09-27 (phase 12) §5: a staff member starts in the first role they hold - teacher,
    /// direction manager, standards controller - or in none. Everyone else acts in their account role.
    private async Task<string> DefaultActingRoleAsync(AppUser user)
    {
        if (user.Role != AccountRoles.Staff)
        {
            return user.Role;
        }

        var held = await _dbContext.RoleAssignments.AsNoTracking()
            .Where(a => a.UserId == user.Id)
            .Select(a => a.Role)
            .Distinct()
            .ToListAsync();

        return held.Count == 0 ? ActingRoles.None : held.Min().ToString();
    }

    private async Task<CurrentUserResponse> MapCurrentUserAsync(AppUser user, string actingRole)
    {
        var assignments = user.Role == AccountRoles.Staff
            ? await RoleAssignmentReader.ReadAsync(_dbContext, [user.Id])
            : new Dictionary<Guid, List<RoleAssignmentResponse>>();

        return new CurrentUserResponse
        {
            Id = user.Id.ToString(),
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email,
            Role = actingRole,
            AccountRole = user.Role,
            Assignments = assignments.TryGetValue(user.Id, out var list) ? list : []
        };
    }
```

Add `using DiplomaTracker.Api.DTOs.Staff;` to the file.

`Controllers/AuthController.cs`: in `Me`, replace

```csharp
        if (!TryGetUserContext(out _, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var user = await _authService.GetCurrentUserAsync(userId);
```

with

```csharp
        if (!TryGetUserContext(out var role, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var user = await _authService.GetCurrentUserAsync(userId, role);
```

and add after `Me`:

```csharp
    /// Design 2026-09-27 (phase 12) §5: a new token acting in another role the caller holds.
    [Authorize]
    [HttpPost("acting-role")]
    public async Task<IActionResult> SwitchActingRole([FromBody] ActingRoleRequest request)
    {
        if (!TryGetUserContext(out _, out var userId))
        {
            return ErrorResult(OnboardingErrors.UserNotFound);
        }

        var (result, error) = await _authService.SwitchActingRoleAsync(userId, request.Role);
        return result is null ? ErrorResult(error) : Ok(result);
    }
```

`Services/SessionStateValidator.cs`: keep the header comment, the class, its fields and constructor. Replace the tail of `IsSessionValidAsync` from `if (!string.Equals(state.Role, role, StringComparison.Ordinal))` to the end of the method with:

```csharp
        if (!ClaimFitsAccount(state.Role, role))
        {
            SecurityLog.SessionRejected(_logger, userId, "RoleChanged");
            return false;
        }

        // Design 2026-09-27 (phase 12) §5: a staff session acts in a role the account must still hold
        // somewhere. Removing the last assignment of a role ends the sessions acting in it at once.
        if (state.Role == AccountRoles.Staff
            && role != ActingRoles.None
            && !await _dbContext.HoldsRoleAsync(userId, Enum.Parse<StaffRole>(role)))
        {
            SecurityLog.SessionRejected(_logger, userId, "RoleWithdrawn");
            return false;
        }

        return true;
    }

    /// An administrator's and a student's claim is their account role; a staff member's is one of the
    /// three staff roles or Staff (acting in none).
    private static bool ClaimFitsAccount(string accountRole, string claim) =>
        accountRole == AccountRoles.Staff
            ? claim is ActingRoles.None or ActingRoles.Teacher or ActingRoles.DirectionManager or ActingRoles.StandardsController
            : string.Equals(accountRole, claim, StringComparison.Ordinal);
```

Add `using DiplomaTracker.Api.Entities;` to the file.

`Services/SecurityLog.cs`:
- Change the `SessionRejected` comment to `/// Reason is one of Missing, Inactive, Unclaimed, RoleChanged, RoleWithdrawn, Malformed.`
- In the `AdministratorAction` comment, replace `Teacher,` with `Staff,`.
- Add after `SignInFailed`:

```csharp
    public static void ActingRoleSwitched(ILogger logger, Guid userId, string role) =>
        logger.LogInformation("Acting role switched: UserId={UserId}, Role={Role}", userId, role);
```

- Add after `AdministratorAction`:

```csharp
    /// Action is Added or Removed (design 2026-09-27, phase 12, §6).
    public static void RoleAssignmentChanged(ILogger logger, Guid administratorId, string action, Guid userId, string role, string scopeKind, Guid scopeId) =>
        logger.LogInformation(
            "Role assignment changed: AdministratorId={AdministratorId}, Action={Action}, UserId={UserId}, Role={Role}, ScopeKind={ScopeKind}, ScopeId={ScopeId}",
            administratorId, action, userId, role, scopeKind, scopeId);
```

- [ ] **Step 11: Directions and standards controllers by coverage**

`DTOs/Directions/DirectionQuery.cs`: add after `Mine`:

```csharp
    /// Only directions of departments the caller's acting role covers - the ones a teacher may
    /// publish topics under (design 2026-09-27, phase 12, §4).
    public bool Covered { get; set; }
```

`Services/DirectionService.cs`:
- Replace the class comment with:

```csharp
/// Design 2026-09-27 §4, and phase 12 §4: a direction manager opens directions in the departments
/// their role covers and manages their own; an administrator manages every direction and names or
/// changes its manager, who must cover the direction's department.
```

- In `GetDirectionsAsync`, replace `else if (user.IsAdmin || user.IsTeacher)` with `else if (user.IsAdmin || user.IsStaff)`, and add at the end of that branch, after the `query.Mine` filter:

```csharp
            if (query.Covered && !user.IsAdmin)
            {
                if (user.ActingRole is { } role)
                {
                    var me = user.UserId;
                    directions = directions.Where(d => _dbContext.RoleAssignments.Any(a => a.UserId == me
                        && a.Role == role
                        && ((a.ScopeKind == RoleScopeKind.Department && a.ScopeId == d.DepartmentId)
                            || (a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == d.Department.FacultyId))));
                }
                else
                {
                    directions = directions.Where(_ => false);
                }
            }
```

- Replace the start of `CreateDirectionAsync`, from its first line through the department check, with:

```csharp
    public async Task<(DirectionResponse? direction, string? error)> CreateDirectionAsync(UserContext user, CreateDirectionRequest request)
    {
        if (!user.IsAdmin && !user.IsDirectionManager)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!await _dbContext.Departments.AnyAsync(d => d.Id == request.DepartmentId))
        {
            return (null, DirectionErrors.DepartmentInvalid);
        }

        // Phase 12 §4: the manager covers the direction's department. An administrator names one who
        // does; a direction manager opens a direction only where their own role reaches.
        Guid managerId;
        if (user.IsAdmin)
        {
            if (request.ManagerId is not { } named
                || !await _dbContext.CoversDepartmentAsync(named, StaffRole.DirectionManager, request.DepartmentId))
            {
                return (null, DirectionErrors.ManagerInvalid);
            }

            managerId = named;
        }
        else
        {
            if (!await _dbContext.CoversDepartmentAsync(user.UserId, StaffRole.DirectionManager, request.DepartmentId))
            {
                return (null, RoleErrors.NotCovered);
            }

            managerId = user.UserId;
        }
```

  The rest of the method (from `var name = request.Name.Trim();`) stays.
- In `UpdateDirectionAsync`, replace the block from `var managerChanged = false;` through the closing brace of the `if (request.ManagerId is { } managerId && ...)` block with:

```csharp
        var managerChanged = false;
        var managerId = editable.ManagerId;
        if (request.ManagerId is { } requestedManager && requestedManager != editable.ManagerId)
        {
            if (!user.IsAdmin)
            {
                return (null, CommonErrors.Forbidden);
            }

            managerId = requestedManager;
            managerChanged = true;
        }

        // Phase 12 §4: the manager - a new one, or the current one when the direction moves - covers
        // the department. A manager who moves their own direction outside their role is refused.
        if ((managerChanged || request.DepartmentId != editable.DepartmentId)
            && !await _dbContext.CoversDepartmentAsync(managerId, StaffRole.DirectionManager, request.DepartmentId))
        {
            return (null, user.IsAdmin ? DirectionErrors.ManagerInvalid : RoleErrors.NotCovered);
        }

        if (managerChanged)
        {
            // §4.2: the direction's approval seat and its step-panel seats move to the new manager
            // at once - both are derived from ManagerId whenever they are read.
            editable.ManagerId = managerId;
        }
```

- Replace `CheckManageable`'s body after the null check with:

```csharp
        if (user.IsAdmin || (user.IsDirectionManager && direction.ManagerId == user.UserId))
        {
            return null;
        }

        return user.IsDirectionManager ? DirectionErrors.NotManager : CommonErrors.Forbidden;
```

`Controllers/DirectionsController.cs`: on `POST`, `PUT` and `DELETE` replace `[Authorize(Roles = "Admin,Teacher")]` with `[Authorize(Roles = AuthRoles.AdminOrDirectionManager)]`, and add `using DiplomaTracker.Api.Services;` if it is missing.

`Services/StudentWorkflowService.cs`, `SetStandardsControllerAsync`: replace

```csharp
        if (controllerId is not null && !await _dbContext.IsStandardsControllerAsync(controllerId.Value))
```

with

```csharp
        // Phase 12 §4: a controller whose role covers the group.
        if (controllerId is not null && !await _dbContext.CoversGroupAsync(controllerId.Value, StaffRole.StandardsController, groupTask.GroupId))
```

- [ ] **Step 12: Seeds and the places that take their assignments with them**

`Services/DbSeeder.cs`:
- Replace the two first lines of `SeedAsync` that ensure the administrator and the teacher with:

```csharp
        var administrator = await EnsureUserAsync(dbContext, passwordHasher, "admin@diploma.local", "System", "Admin", "Admin123!", AccountRoles.Admin, now);
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", AccountRoles.Staff, now);
```

  and `"Student"` in the student line with `AccountRoles.Student`.
- Replace the closing block of `SeedAsync` with:

```csharp
        // Only on a database with no direction yet, and only for an active staff member: after that
        // the roles and the directions are the administrator's, and a restart must not re-add a
        // removed role or recreate a deleted direction under a manager who may have left.
        if (teacher.IsActive && !await dbContext.Directions.AnyAsync())
        {
            await EnsureTeacherRolesAsync(dbContext, teacher.Id, faculty.Id, administrator.Id, now);
            await EnsureDirectionAsync(dbContext, department.Id, "Software Engineering", teacher.Id, now);
        }
```

- Replace `EnsureTeacherCapabilitiesAsync` with:

```csharp
    // Design 2026-09-27 (phase 12) §3: the seeded staff member holds all three roles for the seeded
    // faculty, so the check scripts have one of each to work with.
    private static async Task EnsureTeacherRolesAsync(AppDbContext dbContext, Guid teacherId, Guid facultyId, Guid administratorId, DateTime now)
    {
        foreach (var role in Enum.GetValues<StaffRole>())
        {
            if (await dbContext.RoleAssignments.AnyAsync(a => a.UserId == teacherId && a.Role == role
                && a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == facultyId))
            {
                continue;
            }

            dbContext.RoleAssignments.Add(new RoleAssignment
            {
                Id = Guid.NewGuid(),
                UserId = teacherId,
                Role = role,
                ScopeKind = RoleScopeKind.Faculty,
                ScopeId = facultyId,
                CreatedById = administratorId,
                CreatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
```

`Services/FacultyService.cs`, `DeleteFacultyAsync`: right before `_dbContext.Faculties.Remove(faculty);` add:

```csharp
        // Design 2026-09-27 (phase 12) §3: the roles assigned for this faculty go with it.
        _dbContext.RoleAssignments.RemoveRange(await _dbContext.RoleAssignments
            .Where(a => a.ScopeKind == RoleScopeKind.Faculty && a.ScopeId == id)
            .ToListAsync());
```

`Services/DepartmentService.cs`, `DeleteDepartmentAsync`: the same block right before `_dbContext.Departments.Remove(department);`, with `RoleScopeKind.Department` and the comment naming the department.

`Services/GroupService.cs`, `DeleteGroupAsync`: the same block right before `_dbContext.Groups.Remove(group);`, with `RoleScopeKind.Group` and `a.ScopeId == id`, and the comment naming the group.

Add `using DiplomaTracker.Api.Entities;` to any of the three files that lacks it.

- [ ] **Step 13: Keep the tests compiling**

`backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs`:
- In the two tests that add a user with `Role = "Teacher"`, change it to `Role = "Staff"`.
- In `GetCurrentUserAsync_ForActiveUser_ReturnsMappedUser`, replace `var result = await service.GetCurrentUserAsync(userId);` with `var result = await service.GetCurrentUserAsync(userId, "Staff");`, and the last assertion with:

```csharp
        Assert.Equal("Staff", result.Role);
        Assert.Equal("Staff", result.AccountRole);
```

- [ ] **Step 14: Build and test**

The API must not be running (see `PROJECT_MEMORY.md`, *Gotchas*).

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`. Any compile error left points at a file this task missed (`grep -rn "IsDirectionManager\|IsStandardsController\|ITeacherService\|DTOs.Teachers\|StaffCapability" backend/DiplomaTracker.Api --include=*.cs | grep -v /obj/ | grep -v Migrations` must print nothing).

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: every test passes.

---

### Task 2: Access by acting role, and group reviewers removed

Everything a staff member sees and decides now follows the role they act in. Group reviewers go, with their tables and endpoints, and group-step writes become the administrators'. The archive is read by the supervisors recorded in it. The build is green at the end.

**Files:**
- Delete: `backend/DiplomaTracker.Api/Entities/GroupReviewer.cs`, `ArchivedGroupReviewer.cs`, `DTOs/Groups/AddGroupReviewerRequest.cs`, `DTOs/Groups/GroupReviewerResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/AppUser.cs`, `Group.cs`, `ArchivedGroup.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Replace: `backend/DiplomaTracker.Api/Services/AccessScope.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IAccessScope.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ReviewPanel.cs`, `TopicApprovalPanel.cs`, `StudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`, `Interfaces/IGroupService.cs`, `Services/GroupErrors.cs`, `Controllers/GroupsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupTaskService.cs`, `Controllers/GroupTasksController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ArchiveService.cs`, `DTOs/Archive/ArchiveResponses.cs`, `Controllers/ArchiveController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DashboardService.cs`, `Controllers/DashboardController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DocumentTemplateService.cs`, `DocumentService.cs`, `Controllers/TemplatesController.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/ProgressController.cs`, `ReviewController.cs`, `SubmissionsController.cs`, `StudentTasksController.cs`, `ReservationsController.cs`, `TopicsController.cs`, `TaskTemplatesController.cs`
- Modify: `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`

**Interfaces:**
- Consumes (Task 1): `UserContext.{IsTeacher, IsDirectionManager, IsStandardsController, IsStaff, ActingRole}`, `AccountRoles`, `AuthRoles`, `RoleCoverage.CoversGroupAsync`, `ArchivedFile.SupervisorId`, `ArchivedReview.SupervisorId`.
- Produces: `ReviewPanel.ActsFor(UserContext, ReviewSeat)` (`bool`), used by `SeatFor`.
- Produces: `IAccessScope` unchanged in shape; its four queries follow the acting role (below). `ReviewOverviewStudents` is "every active student the caller works with in their role"; `ReviewableStudents` is "every student the caller opens in full".
- Wire shapes: `ArchivedGroupDetailsResponse` loses `reviewerNames`. The `GET/POST/DELETE /api/groups/{id}/reviewers` endpoints no longer exist.

- [ ] **Step 1: Group reviewers leave the model**

Delete `Entities/GroupReviewer.cs` and `Entities/ArchivedGroupReviewer.cs`.

- `Entities/AppUser.cs`: delete `public ICollection<GroupReviewer> GroupReviews { get; set; } = new List<GroupReviewer>();`.
- `Entities/Group.cs`: delete `public ICollection<GroupReviewer> Reviewers { get; set; } = new List<GroupReviewer>();`.
- `Entities/ArchivedGroup.cs`: delete `public ICollection<ArchivedGroupReviewer> Reviewers { get; set; } = new List<ArchivedGroupReviewer>();`.
- `Data/AppDbContext.cs`: delete the `GroupReviewers` and `ArchivedGroupReviewers` `DbSet` lines, the whole `var groupReviewer = modelBuilder.Entity<GroupReviewer>();` block, and the whole `var archivedReviewer = modelBuilder.Entity<ArchivedGroupReviewer>();` block. Leave the `StudentTaskReviewer` mapping (its `.WithMany(x => x.Reviewers)` is `StudentTask.Reviewers`) untouched.

Delete `DTOs/Groups/AddGroupReviewerRequest.cs` and `DTOs/Groups/GroupReviewerResponse.cs`.

`Services/GroupErrors.cs`: delete the four `Reviewer…` constants and their four definitions.

`Interfaces/IGroupService.cs`: delete `GetGroupReviewersAsync`, `AddGroupReviewerAsync` and `RemoveGroupReviewerAsync`.

`Services/GroupService.cs`: delete `GetGroupReviewersAsync`, `AddGroupReviewerAsync`, `RemoveGroupReviewerAsync` and `MapReviewer`. In `DeleteGroupAsync`, the comment line `// takes its reviewers, group tasks and template links.` becomes `// takes its group tasks and template links.`

`Controllers/GroupsController.cs`: delete the actions `GetReviewers`, `AddReviewer` and `RemoveReviewer`. Replace the class attribute `[Authorize(Roles = "Admin,Teacher")]` with `[Authorize(Roles = AuthRoles.AdminOrAnyStaffRole)]` and add `using DiplomaTracker.Api.Services;` if missing.

- [ ] **Step 2: Visibility by acting role**

`Services/AccessScope.cs` (whole file):

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27, phase 12 §4.1-§4.2. What a caller sees follows the role they act in. A
/// student's supervisor (acting as teacher) and the manager of their topic's direction (acting as
/// direction manager) open the student in full. An extra reviewer (acting as teacher) and a
/// standards controller open only the steps they sit on. A staff member's groups are the groups of
/// the students they work with; nothing grants a whole group.
public class AccessScope : IAccessScope
{
    private readonly AppDbContext _dbContext;

    public AccessScope(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public IQueryable<Group> VisibleGroups(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.Groups;
        }

        var working = ReviewOverviewStudents(user);
        return _dbContext.Groups.Where(g => working.Any(s => s.GroupId == g.Id));
    }

    public Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId)
    {
        return VisibleGroups(user).AnyAsync(g => g.Id == groupId);
    }

    public IQueryable<StudentProfile> ReviewableStudents(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.StudentProfiles;
        }

        var me = user.UserId;

        if (user.IsTeacher)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null && s.SupervisorId == me);
        }

        if (user.IsDirectionManager)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && s.Topic != null && s.Topic.Direction.ManagerId == me);
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId)
    {
        return ReviewableStudents(user).AnyAsync(s => s.Id == studentProfileId);
    }

    public IQueryable<StudentProfile> ReviewOverviewStudents(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null);
        }

        var me = user.UserId;

        if (user.IsTeacher)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && (s.SupervisorId == me || s.StudentTasks.Any(t => t.Reviewers.Any(r => r.ReviewerId == me))));
        }

        if (user.IsDirectionManager)
        {
            return ReviewableStudents(user);
        }

        if (user.IsStandardsController)
        {
            return _dbContext.StudentProfiles.Where(s => s.ArchivedAt == null
                && s.StudentTasks.Any(t => t.GroupTask.StandardsControllerId == me && t.GroupTask.GroupId == s.GroupId));
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId)
    {
        var task = _dbContext.StudentTasks.Where(t => t.Id == studentTaskId);

        if (user.IsAdmin)
        {
            return task.AnyAsync();
        }

        var me = user.UserId;
        var reviewable = ReviewableStudents(user).Select(s => s.Id);

        if (user.IsTeacher)
        {
            return task.AnyAsync(t => reviewable.Contains(t.StudentProfileId)
                || (t.StudentProfile.ArchivedAt == null && t.Reviewers.Any(r => r.ReviewerId == me)));
        }

        if (user.IsDirectionManager)
        {
            return task.AnyAsync(t => reviewable.Contains(t.StudentProfileId));
        }

        if (user.IsStandardsController)
        {
            return task.AnyAsync(t => t.StudentProfile.ArchivedAt == null && t.GroupTask.StandardsControllerId == me);
        }

        return Task.FromResult(false);
    }
}
```

`Interfaces/IAccessScope.cs`: keep the four members and rewrite the two doc comments:

```csharp
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
```

and add above `ReviewableStudents`:

```csharp
    /// Phase 12 §4.2: the students the caller opens in full in the role they act in - a teacher their
    /// supervised students, a direction manager the students of their directions; an administrator
    /// every student.
```

- [ ] **Step 3: Seats belong to roles**

`Services/ReviewPanel.cs`: replace `SeatFor` with:

```csharp
    /// The seat the caller's decision fills, or null when they have none. Their own seat wins, but
    /// only while they act in the role that seat belongs to (design 2026-09-27, phase 12, §5): one
    /// person still holds one seat on a step, and that seat decides the role they decide in. An
    /// administrator with no seat of their own stands in for the supervisor by default
    /// (`allowAdminStandIn: true`) - that power drives `canDecide` and the decision form. "Your
    /// decision" (`isMyDecision`) passes `allowAdminStandIn: false`, so it counts only a seat the
    /// caller actually holds.
    public static ReviewSeat? SeatFor(UserContext user, PanelState panel, bool allowAdminStandIn = true)
    {
        var own = panel.Seats.FirstOrDefault(s => s.ReviewerId == user.UserId);
        if (own is not null)
        {
            return ActsFor(user, own.Seat) ? own.Seat : null;
        }

        return allowAdminStandIn && user.IsAdmin ? ReviewSeat.Supervisor : null;
    }

    /// Whether the caller's acting role is the one a seat is decided in: the supervisor and extra
    /// seats are a teacher's (an administrator may sit as an extra reviewer too), the direction
    /// manager's and the standards control seats their own roles'.
    public static bool ActsFor(UserContext user, ReviewSeat seat) => seat switch
    {
        ReviewSeat.Supervisor or ReviewSeat.Extra => user.IsTeacher || user.IsAdmin,
        ReviewSeat.DirectionManager => user.IsDirectionManager,
        ReviewSeat.StandardsControl => user.IsStandardsController,
        _ => false
    };
```

`Services/TopicApprovalPanel.cs`: replace `SeatsOf` and its comment with:

```csharp
    /// The seats a caller holds on a request in the role they act in (§5.3, phase 12 §5):
    /// administrators the administration seat, the direction's manager acting as direction manager
    /// the direction seat, the supervisor acting as teacher the supervision seat. Evaluate still
    /// counts one person's approval in every seat they hold, whichever role they gave it in.
    public static IReadOnlyList<Seat> SeatsOf(UserContext user, Guid supervisorId, Guid directionManagerId)
    {
        var seats = new List<Seat>(3);
        if (user.IsAdmin)
        {
            seats.Add(Seat.Administration);
        }

        if (user.IsDirectionManager && directionManagerId == user.UserId)
        {
            seats.Add(Seat.Direction);
        }

        if (user.IsTeacher && supervisorId == user.UserId)
        {
            seats.Add(Seat.Supervision);
        }

        return seats;
    }
```

- [ ] **Step 4: The workflow by acting role**

`Services/StudentWorkflowService.cs`:

1. Replace the comment block above `WaitingForCallerQuery` and the method itself with:

```csharp
    // Design 2026-09-24 §3.5, phase 12 §5. The queue is the steps where the caller holds an OPEN seat
    // in the role they act in: a teacher's supervisor and extra seats, a direction manager's seat, a
    // standards controller's seat. An administrator sees every submission still awaiting its panel.
    // Shared by GetReviewQueueAsync and GetLateAwaitingReviewAsync (task 7 bug 5) so both agree
    // exactly on what "the caller's open seat" means - explicit panel membership only, never an
    // administrator's stand-in (moot here: an administrator's query is deliberately unfiltered).
    // M14: a student who moved groups while a version was pending leaves a queue item that opens
    // as studentTask.notFound - agree with the admin dashboard's waiting count.
    private IQueryable<Submission> WaitingForCallerQuery(UserContext user)
    {
        var query = _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null
                && s.StudentTask.Status == StudentTaskStatus.Submitted
                && s.StudentTask.GroupTask.GroupId == s.StudentTask.StudentProfile.GroupId);

        if (user.IsAdmin)
        {
            return query;
        }

        var me = user.UserId;
        query = query.Where(s => s.StudentTask.StudentProfile.ArchivedAt == null);

        // One predicate per seat, in ReviewPanel.Evaluate's order, each excluding the seats an
        // earlier one absorbs - a person decides once, in their first seat (design 2026-09-27 §6),
        // and in the role that seat belongs to.
        if (user.IsTeacher)
        {
            return query.Where(s =>
                (s.StudentTask.StudentProfile.SupervisorId == me
                    && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                        r.Seat == ReviewSeat.Supervisor
                        && r.Decision == SubmissionDecision.Approved
                        && (r.ReviewerId == me || r.Reviewer.Role == AccountRoles.Admin)))
                || (s.StudentTask.StudentProfile.SupervisorId != me
                    && (s.StudentTask.StudentProfile.Topic == null || s.StudentTask.StudentProfile.Topic.Direction.ManagerId != me)
                    && s.StudentTask.Reviewers.Any(x => x.ReviewerId == me
                        && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                            r.Seat == ReviewSeat.Extra
                            && r.Decision == SubmissionDecision.Approved
                            && r.ReviewerId == me
                            && r.DecidedAt >= x.AddedAt))));
        }

        if (user.IsDirectionManager)
        {
            return query.Where(s =>
                s.StudentTask.StudentProfile.SupervisorId != me
                && s.StudentTask.StudentProfile.Topic != null
                && s.StudentTask.StudentProfile.Topic.Direction.ManagerId == me
                && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                    r.Seat == ReviewSeat.DirectionManager
                    && r.Decision == SubmissionDecision.Approved
                    && r.ReviewerId == me));
        }

        if (user.IsStandardsController)
        {
            return query.Where(s =>
                s.StudentTask.GroupTask.StandardsControllerId == me
                && s.StudentTask.StudentProfile.SupervisorId != me
                && (s.StudentTask.StudentProfile.Topic == null || s.StudentTask.StudentProfile.Topic.Direction.ManagerId != me)
                && !s.StudentTask.Reviewers.Any(x => x.ReviewerId == me)
                && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                    r.Seat == ReviewSeat.StandardsControl
                    && r.Decision == SubmissionDecision.Approved
                    && r.ReviewerId == me
                    && r.DecidedAt >= s.StudentTask.GroupTask.StandardsControllerAssignedAt));
        }

        return query.Where(_ => false);
    }
```

2. In `GetGroupProgressAsync`, replace the comment above `reviewableIds` with:

```csharp
        // Design 2026-09-24, phase 12 §4.2: a row opens for an administrator, the student's
        // supervisor acting as teacher, and the manager of the student's topic's direction acting as
        // direction manager - exactly `ReviewableStudents`. Computed once for the whole group.
```

   and replace the whole `mineIds` statement and its comment with:

```csharp
        // Bug 3 (task 7), phase 12 §4.1: "mine" for the My students / Others split - the students the
        // caller works with in their acting role (`ReviewOverviewStudents`): a teacher's supervised
        // students and students on whose steps they sit, a direction manager's direction students, a
        // standards controller's students of the steps they control. For an administrator every
        // active student is theirs, so the page shows one list. Others never open.
        var mineIds = (await _accessScope.ReviewOverviewStudents(user).AsNoTracking()
                .Where(p => studentIds.Contains(p.Id))
                .Select(p => p.Id)
                .ToListAsync())
            .ToHashSet();
```

3. In `AddReviewerAsync`, delete the whole `// M5: …` comment and the `if (reviewerId == user.UserId && …)` block under it (it guarded group reviewers, who no longer exist; a supervisor naming themselves still gets `panel.reviewerIsSupervisor` and a direction manager `panel.reviewerExists`). Replace

```csharp
        var reviewer = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == reviewerId);
        if (reviewer is null || !reviewer.IsActive || (reviewer.Role != "Teacher" && reviewer.Role != "Admin"))
        {
            return (null, WorkflowErrors.PanelReviewerInvalid);
        }

        if (reviewer.Id == task.StudentProfile.SupervisorId)
```

   with

```csharp
        // Phase 12 §4: an extra reviewer is an administrator, or a teacher whose role covers the
        // student's group.
        var reviewer = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == reviewerId)
            .Select(u => new { u.Id, u.IsActive, u.Role })
            .FirstOrDefaultAsync();
        var eligible = reviewer is not null
            && reviewer.IsActive
            && (reviewer.Role == AccountRoles.Admin
                || (reviewer.Role == AccountRoles.Staff
                    && await _dbContext.CoversGroupAsync(reviewer.Id, StaffRole.Teacher, task.StudentProfile.GroupId)));
        if (!eligible)
        {
            return (null, WorkflowErrors.PanelReviewerInvalid);
        }

        if (reviewerId == task.StudentProfile.SupervisorId)
```

4. Replace the comment above `LoadTaskForPanelChangeAsync` with:

```csharp
    /// Design 2026-09-24 §3.1, phase 12 §4.1: the student's supervisor (acting as teacher), the manager
    /// of their topic's direction (acting as direction manager) or an administrator may change a
    /// panel, while the step is not approved and the student is not archived.
```

5. In `BuildReviewStudentProjection`, add after `var isAdmin = user.IsAdmin;`:

```csharp
        var isTeacher = user.IsTeacher;
        var isManager = user.IsDirectionManager;
        var isController = user.IsStandardsController;
```

   and replace **both** `CanOpen = …` expressions (in `CurrentOpen` and in `LastStep`) with:

```csharp
                    CanOpen = isAdmin
                        || (isTeacher && (p.SupervisorId == callerId || t.Reviewers.Any(r => r.ReviewerId == callerId)))
                        || (isManager && p.Topic != null && p.Topic.Direction.ManagerId == callerId)
                        || (isController && t.GroupTask.StandardsControllerId == callerId),
```

6. In `LoadPanelFactsAsync`, replace `ReviewerIsAdmin = r.Reviewer.Role == "Admin",` with `ReviewerIsAdmin = r.Reviewer.Role == AccountRoles.Admin,`.

- [ ] **Step 5: Group steps are the administrators' to assign**

`Services/GroupTaskService.cs`:
- In `CreateGroupTaskAsync`, delete the whole `if (role == "Teacher") { … }` block.
- In `AssignAllTaskTemplatesAsync`, delete the whole `if (role == "Teacher") { … }` block.
- In `UpdateGroupTaskAsync`, delete the whole `if (role == "Teacher") { … }` block.
- Delete `IsTeacherReviewerOfGroupAsync`.
- The `role` and `userId` parameters stay (`userId` is logged); the reads keep using `_accessScope`.
- In `GetGroupTasksAsync`, replace `if (role != "Admin")` with `if (role != AccountRoles.Admin)`.

`Controllers/GroupTasksController.cs`:
- Replace the class attribute `[Authorize(Roles = "Admin,Teacher")]` with `[Authorize(Roles = AuthRoles.AdminOrAnyStaffRole)]`.
- Add `[Authorize(Roles = AuthRoles.Admin)]` to `POST` (create), `POST /api/groups/{groupId}/assign-all-task-templates` and `PUT {id}`. Design phase 12 §4.1: assigning steps to a group and changing their dates are the administrators'.
- Replace the literal `"Admin"` in the existing `DELETE` and `standards-controller` attributes with `AuthRoles.Admin`.
- Add `using DiplomaTracker.Api.Services;` if missing.

- [ ] **Step 6: The archive by supervisor**

`Services/ArchiveService.cs`:
1. In the `rows` projection of `ArchiveAsync`, add after `f.Submission.StudentTask.StudentProfile.StudentNumber,`:

```csharp
                // Phase 12 §4.1: the supervisor at the moment of archiving reads these rows later.
                SupervisorId = f.Submission.StudentTask.StudentProfile.SupervisorId,
```

2. In the `reviewRows` projection, add after `r.Submission.StudentTask.StudentProfile.StudentNumber,`:

```csharp
                SupervisorId = r.Submission.StudentTask.StudentProfile.SupervisorId,
```

3. Replace

```csharp
        var archive = await _dbContext.ArchivedGroups
            .Include(a => a.Reviewers)
            .FirstOrDefaultAsync(a => a.SourceGroupId == groupId, cancellationToken);
```

   with

```csharp
        var archive = await _dbContext.ArchivedGroups
            .FirstOrDefaultAsync(a => a.SourceGroupId == groupId, cancellationToken);
```

   and in the comment below it replace `because its metadata (group deleted, reviewers) can change` with `because its metadata (the group deleted) can change`.
4. Delete the whole block that starts with `// The live reviewer rows go with the group, so who may read this archive is copied in` and ends with the `foreach` that adds `ArchivedGroupReviewer` rows.
5. In the `new ArchivedFile { … }` initializer add `SupervisorId = row.SupervisorId,` after `StudentNumber = row.StudentNumber,`; in the `new ArchivedReview { … }` initializer add `SupervisorId = review.SupervisorId,` after `StudentNumber = review.StudentNumber,`.
6. Replace `Visible` and its comment with:

```csharp
    /// Phase 8 §4.5, phase 12 §4.1: an administrator sees every archive; a caller acting as teacher
    /// the ones holding work of a student they supervised when it was archived, and only those rows
    /// (see RowsFor). Everyone else sees nothing - and an archive they may not see answers exactly
    /// like one that does not exist.
    private IQueryable<ArchivedGroup> Visible(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.ArchivedGroups;
        }

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.ArchivedGroups.Where(a => a.Files.Any(f => f.SupervisorId == me) || a.Reviews.Any(r => r.SupervisorId == me));
        }

        return _dbContext.ArchivedGroups.Where(_ => false);
    }
```

7. In `GetGroupsAsync`, add at the top `var isAdmin = user.IsAdmin; var me = user.UserId;` (two statements), replace the search filter's `a.Files.Any(f => EF.Functions.Like(f.StudentName, $"%{term}%"))` with `a.Files.Any(f => (isAdmin || f.SupervisorId == me) && EF.Functions.Like(f.StudentName, $"%{term}%"))`, and the three counts in the projection with:

```csharp
                StudentCount = a.Files.Where(f => isAdmin || f.SupervisorId == me).Select(f => f.StudentNumber).Distinct().Count(),
                FileCount = a.Files.Count(f => isAdmin || f.SupervisorId == me),
                TotalSizeBytes = a.Files.Where(f => isAdmin || f.SupervisorId == me).Sum(f => (long?)f.SizeBytes) ?? 0,
```

8. In `GetGroupAsync`, add the same two locals at the top, make the same three count replacements, delete the `ReviewerNames = …` line, replace `Files = a.Files` with `Files = a.Files.Where(f => isAdmin || f.SupervisorId == me)`, and `Reviews = a.Reviews` with `Reviews = a.Reviews.Where(r => isAdmin || r.SupervisorId == me)` (the `.OrderBy` chains that follow stay).
9. In `OpenFileAsync`, replace

```csharp
        var file = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.Id == fileId)
            .Where(f => Visible(user).Any(a => a.Id == f.ArchivedGroupId))
```

   with

```csharp
        var isAdmin = user.IsAdmin;
        var isTeacher = user.IsTeacher;
        var me = user.UserId;
        var file = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.Id == fileId && (isAdmin || (isTeacher && f.SupervisorId == me)))
```

`DTOs/Archive/ArchiveResponses.cs`: delete `public IReadOnlyList<string> ReviewerNames { get; set; } = [];`.

`Controllers/ArchiveController.cs`: replace the class attribute's `"Admin,Teacher"` with `AuthRoles.AdminOrTeacher`, and the two `"Admin"` with `AuthRoles.Admin`; add `using DiplomaTracker.Api.Services;` if missing.

- [ ] **Step 7: Dashboards**

`Services/DashboardService.cs`:
1. In `GetTeacherAsync`, replace

```csharp
        var supervised = await _dbContext.StudentProfiles.AsNoTracking()
            // Design 2026-09-27 §6.2: a direction manager is treated as a supervisor for the students
            // whose topic is in their direction.
            .Where(p => (p.SupervisorId == user.UserId
                    || (p.Topic != null && p.Topic.Direction.ManagerId == user.UserId))
                && p.ArchivedAt == null)
```

   with

```csharp
        // Phase 12 §4.2: the students the acting role opens in full - a teacher's supervised students,
        // a direction manager's direction students. A standards controller has none.
        var supervised = await _accessScope.ReviewableStudents(user).AsNoTracking()
```

2. Replace `GroupRowsAsync` and its comment with:

```csharp
    /// The per-group breakdown. An administrator's covers every group and every student. A staff
    /// member's covers the groups `IAccessScope.VisibleGroups` returns for their acting role - the
    /// Groups tab's set - and within each group only the students they work with in that role
    /// (`ReviewOverviewStudents`; design 2026-09-27, phase 12, §4.1: "the teacher's group figures
    /// count only the caller's own students"). So a row agrees with the caller's own Overdue list and
    /// with the group page's My students split.
    private async Task<IReadOnlyList<DashboardGroupRow>> GroupRowsAsync(UserContext user, DateTime now)
    {
        var groups = _accessScope.VisibleGroups(user);
        var working = _accessScope.ReviewOverviewStudents(user).Select(s => s.Id);

        return await groups.AsNoTracking()
            .OrderByDescending(g => g.AcademicYear)
            .ThenBy(g => g.Code)
            .Select(g => new DashboardGroupRow
            {
                GroupId = g.Id,
                GroupCode = g.Code,
                AcademicYear = g.AcademicYear,
                DepartmentName = g.Department.Name,
                StudentCount = g.Students.Count(s => s.ArchivedAt == null && working.Contains(s.Id)),
                ApprovedTopicCount = g.Students.Count(s => s.ArchivedAt == null && s.TopicId != null && working.Contains(s.Id)),
                StepsApproved = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Approved
                        && working.Contains(t.StudentProfileId)),
                StepsTotal = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && working.Contains(t.StudentProfileId)),
                WaitingReviews = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Submitted
                        && working.Contains(t.StudentProfileId)),
                LateSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Submissions.OrderByDescending(s => s.Version).Select(s => s.IsLate).FirstOrDefault()
                        && working.Contains(t.StudentProfileId)),
                OverdueSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Status != StudentTaskStatus.Approved
                        && t.Status != StudentTaskStatus.Submitted
                        && t.GroupTask.Deadline < now
                        && working.Contains(t.StudentProfileId))
            })
            .ToListAsync();
    }
```

3. In `GetAdminAsync`, replace `Teachers = await _dbContext.Users.CountAsync(u => u.Role == "Teacher" && u.IsActive),` with `Teachers = await _dbContext.Users.CountAsync(u => u.Role == AccountRoles.Staff && u.IsActive),`.

`Controllers/DashboardController.cs`: replace `[Authorize(Roles = "Teacher")]` with `[Authorize(Roles = AuthRoles.AnyStaffRole)]` (design phase 12 §4.2: every staff role has this dashboard), and the `"Admin"` / `"Student"` literals with `AuthRoles.Admin` / `AccountRoles.Student`; add `using DiplomaTracker.Api.Services;` if missing.

- [ ] **Step 8: Templates and documents are every staff member's**

`Services/DocumentTemplateService.cs`: every `user.IsTeacher` in this file becomes `user.IsStaff` (templates are owned by staff accounts whatever role they act in; `ValidateGroupsAsync` still narrows a staff member's groups to `VisibleGroups`, which follows the acting role). In `ValidateTeachersAsync`, replace `u.Role == "Teacher"` with `u.Role == AccountRoles.Staff`. Where a comment in this file says "teacher" for the owner, leave it; the audience fields keep their names (`VisibleToAllTeachers`, `TeacherIds`) and mean staff accounts.

`Services/DocumentService.cs`, `RecipientsFor`: replace `query.Where(u => u.Role == "Teacher" || u.Role == "Admin")` with `query.Where(u => u.Role == AccountRoles.Staff || u.Role == AccountRoles.Admin)`, and `u.Role != "Student"` with `u.Role != AccountRoles.Student`.

`Controllers/TemplatesController.cs`: every `[Authorize(Roles = "Admin,Teacher")]` becomes `[Authorize(Roles = AuthRoles.AdminOrStaff)]`; add `using DiplomaTracker.Api.Services;` if missing.

- [ ] **Step 9: Endpoint roles**

Add `using DiplomaTracker.Api.Services;` to each controller below if it is missing, then:

| Controller | Action(s) | Attribute becomes |
|---|---|---|
| `ProgressController` | group progress, student progress | `AuthRoles.AdminOrAnyStaffRole` (student's own: `AccountRoles.Student`) |
| `ReviewController` | class | `AuthRoles.AdminOrAnyStaffRole` |
| `SubmissionsController` | approve, return | `AuthRoles.AdminOrAnyStaffRole` |
| `StudentTasksController` | add reviewer, remove reviewer | `AuthRoles.AdminTeacherOrManager` (the other `"Student"` attributes: `AccountRoles.Student`) |
| `ReservationsController` | approve, return, reject, wording, release, pending | `AuthRoles.AdminTeacherOrManager` (the `"Student"` ones: `AccountRoles.Student`) |
| `TopicsController` | create, update, delete | `AuthRoles.AdminTeacherOrManager` |
| `TaskTemplatesController` | class `"Admin,Teacher"` | `AuthRoles.AdminOrTeacher` (the `"Admin"` ones: `AuthRoles.Admin`) |

The attribute strings resolve to the same role lists the design names: a supervisor acts as teacher, a direction manager as one, a standards controller decides steps and nothing else.

- [ ] **Step 10: Comments that still describe group reviewers**

```bash
grep -rn -i "group reviewer\|reviewers of the group\|reviewer of the group\|reviews the group\|GroupReviewer" backend/DiplomaTracker.Api --include=*.cs | grep -v /obj/ | grep -v Migrations
```

Rewrite each comment still describing group reviewers so it states today's rule (phase 12 §4.1: supervisors, direction managers, standards controllers and administrators); a comment that only records history ("until phase 11 …") may stay. No code may remain.

- [ ] **Step 11: Keep the tests compiling**

`backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`:
- In `AddGroupWithOneStudent`, change `TestData.AddUser(context, "Teacher", "supervisor@kpi.ua")` to `TestData.AddUser(context, "Staff", "supervisor@kpi.ua")`.
- In `GetGroupStudentsAsync_ForTeacherWhoIsNotAReviewer_ReturnsGroupNotFound`, change `TestData.AddUser(context, "Teacher", "outsider@kpi.ua")` to `TestData.AddUser(context, "Staff", "outsider@kpi.ua")`, and rename the test `GetGroupStudentsAsync_ForTeacherWithNoStudentThere_ReturnsGroupNotFound`.
- Replace `GetGroupStudentsAsync_ForAssignedReviewer_ReturnsStudents` with:

```csharp
    [Fact]
    public async Task GetGroupStudentsAsync_ForTheSupervisor_ReturnsStudents()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);
        var supervisor = await context.Users.SingleAsync(u => u.Email == "supervisor@kpi.ua");

        var (students, error) = await CreateService(context).GetGroupStudentsAsync(new UserContext(supervisor.Id, "Teacher"), group.Id);

        Assert.Null(error);
        var student = Assert.Single(students!);
        Assert.Equal("student@kpi.ua", student.Email);
    }
```

- [ ] **Step 12: Build and test**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`.

```bash
grep -rn "\"Teacher\"" backend/DiplomaTracker.Api --include=*.cs | grep -v /obj/ | grep -v Migrations
```

Expected: only `AccountRoles.cs` (`ActingRoles.Teacher`), `DbSeeder.cs` (the seeded account's last name), and the lines Task 3 changes in `TopicService.cs`, `ReservationService.cs` and `StudentService.cs`.

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: every test passes.

---

### Task 3: Topics, requests and supervision within scope; the O1 refresh

Topics and topic requests follow the acting role, and every place that takes on supervision checks coverage: publishing and editing a topic, a proposal's supervisor, the student form's supervisor. Completing a request that replaces a held topic now refreshes the student's unfinished steps (phase 11 follow-up O1). The build is green at the end.

**Files:**
- Modify: `backend/DiplomaTracker.Api/Services/TopicService.cs`, `Interfaces/ITopicService.cs`, `Controllers/TopicsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ReservationService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TopicErrors.cs`, `OnboardingErrors.cs`, `DirectionErrors.cs`, `TaskErrors.cs`, `WorkflowErrors.cs` (messages only)
- Modify: `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`

**Interfaces:**
- Consumes (Task 1): `RoleCoverage.{CoversGroupAsync, CoversDepartmentAsync, CoveringGroup, CoveringDepartment}`, `RoleErrors.NotCovered`, `UserContext` role properties.
- Consumes (phase 11): `IStudentWorkflowService.RefreshStudentPanelsAsync(IReadOnlyCollection<Guid> studentProfileIds, DateTime now, Func<ReviewPanel.Facts, ReviewPanel.Facts> adjust)`.
- Produces: `ITopicService.GetSupervisorsAsync(UserContext user, Guid? departmentId)`; `GET /api/topics/supervisors?departmentId=`.
- Produces: `ReservationService`'s constructor `(AppDbContext, ITopicSettingsService, IStudentWorkflowService, ILogger<ReservationService>)`.

- [ ] **Step 1: Topics by acting role and coverage**

`Services/TopicService.cs`:

1. In `GetTopicsAsync`, replace

```csharp
        else if (user.IsTeacher)
        {
            // §5.4: a direction manager also sees every topic in their directions, at any status.
            topics = topics.Where(t => t.SupervisorId == user.UserId || t.Direction.ManagerId == user.UserId);
        }
```

   with

```csharp
        else if (user.IsTeacher)
        {
            // Phase 12 §4.2: acting as teacher, the topics they supervise.
            topics = topics.Where(t => t.SupervisorId == user.UserId);
        }
        else if (user.IsDirectionManager)
        {
            // §5.4: acting as direction manager, every topic in their directions, at any status.
            topics = topics.Where(t => t.Direction.ManagerId == user.UserId);
        }
```

2. In `GetTopicAsync`, replace

```csharp
        if (user.IsTeacher && row.SupervisorId != user.UserId && row.DirectionManagerId != user.UserId)
```

   with

```csharp
        if (!user.IsAdmin && !user.IsStudent && !Manages(user, row.SupervisorId, row.DirectionManagerId))
```

3. In `CreateTopicAsync`, replace

```csharp
        if (supervisorId is null || !await IsActiveTeacherAsync(supervisorId.Value))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }
```

   with

```csharp
        // Phase 12 §4: a catalogue topic's supervisor covers its department. A teacher publishing
        // outside their own role's reach is told so; anyone else named is not a valid choice.
        if (supervisorId is null || !await _dbContext.CoversDepartmentAsync(supervisorId.Value, StaffRole.Teacher, direction.DepartmentId))
        {
            return (null, user.IsTeacher && supervisorId == user.UserId ? RoleErrors.NotCovered : TopicErrors.TopicSupervisorInvalid);
        }
```

4. In `UpdateTopicAsync`, replace

```csharp
        if (supervisorId is null || !await IsActiveTeacherAsync(supervisorId.Value))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }
```

   with

```csharp
        if (supervisorId is null)
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }

        // Phase 12 §4: coverage is checked for what is taken on - a new supervisor, or the topic moving
        // to another department. Work already held is not re-checked.
        if ((supervisorId != editable.SupervisorId || direction.DepartmentId != editable.Direction.DepartmentId)
            && !await _dbContext.CoversDepartmentAsync(supervisorId.Value, StaffRole.Teacher, direction.DepartmentId))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }
```

5. Replace `GetSupervisorsAsync` with:

```csharp
    /// Phase 12 §4: the teachers a picker offers. A student's proposal names one who covers the
    /// student's group; a topic form one who covers the direction's department; with neither, every
    /// active staff member holding the teacher role (a template's named audience).
    public async Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync(UserContext user, Guid? departmentId)
    {
        IQueryable<Guid> teachers;
        if (user.IsStudent)
        {
            var groupId = await _dbContext.StudentProfiles.AsNoTracking()
                .Where(p => p.UserId == user.UserId)
                .Select(p => (Guid?)p.GroupId)
                .FirstOrDefaultAsync();
            if (groupId is null)
            {
                return [];
            }

            teachers = _dbContext.CoveringGroup(StaffRole.Teacher, groupId.Value).Select(a => a.UserId);
        }
        else if (departmentId is { } department)
        {
            teachers = _dbContext.CoveringDepartment(StaffRole.Teacher, department).Select(a => a.UserId);
        }
        else
        {
            teachers = _dbContext.RoleAssignments.Where(a => a.Role == StaffRole.Teacher).Select(a => a.UserId);
        }

        var rows = await _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && u.Role == AccountRoles.Staff && teachers.Contains(u.Id))
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return rows.Select(t => new SupervisorOption(t.Id, PersonName.Full(t))).ToList();
    }
```

6. Replace `ChooseSupervisor` and its comment with:

```csharp
    /// §4.3, phase 12 §5: acting as teacher, a teacher supervises what they create; acting as
    /// direction manager, a manager names any teacher under their own direction (themselves when they
    /// name nobody); an administrator names anyone. `current` is the topic's supervisor on an edit and
    /// null on a create.
    private static (Guid? id, string? error) ChooseSupervisor(UserContext user, Guid directionManagerId, Guid? requested, Guid? current)
    {
        if (user.IsAdmin)
        {
            return (requested ?? current, null);
        }

        if (user.IsDirectionManager)
        {
            return directionManagerId == user.UserId
                ? (requested ?? current ?? user.UserId, null)
                : (null, DirectionErrors.NotManager);
        }

        var unchanged = current ?? user.UserId;
        return requested is null || requested == unchanged
            ? (unchanged, null)
            : (null, DirectionErrors.NotManager);
    }
```

7. Delete `IsActiveTeacherAsync`.
8. In `CheckTopicAccess`, replace everything after the `user.IsAdmin` check with:

```csharp
        if (!user.IsTeacher && !user.IsDirectionManager)
        {
            return CommonErrors.Forbidden;
        }

        return Manages(user, topic.SupervisorId, topic.Direction.ManagerId)
            ? null
            : TopicErrors.TopicNotOwner;
```

9. In `ToResponse`, replace the `var manages = …;` statement with `var manages = Manages(user, row.SupervisorId, row.DirectionManagerId);`.
10. Add, next to `CheckTopicAccess`:

```csharp
    /// Phase 12 §5: a topic is a teacher's to manage when they supervise it, a direction manager's when
    /// it lies in their direction - each in their own acting role; an administrator manages every topic.
    private static bool Manages(UserContext user, Guid supervisorId, Guid directionManagerId) =>
        user.IsAdmin
        || (user.IsTeacher && supervisorId == user.UserId)
        || (user.IsDirectionManager && directionManagerId == user.UserId);
```

`Interfaces/ITopicService.cs`: replace `Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync();` with `Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync(UserContext user, Guid? departmentId);` (add `using DiplomaTracker.Api.Services;` if missing).

`Controllers/TopicsController.cs`: replace the `GetSupervisors` action with:

```csharp
    [HttpGet("supervisors")]
    public async Task<IActionResult> GetSupervisors([FromQuery] Guid? departmentId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _topicService.GetSupervisorsAsync(user, departmentId));
    }
```

- [ ] **Step 2: Requests by acting role, proposals within scope, and the O1 refresh**

`Services/ReservationService.cs`:

1. Constructor and fields:

```csharp
    private readonly AppDbContext _dbContext;
    private readonly ITopicSettingsService _settings;
    private readonly IStudentWorkflowService _workflow;
    private readonly ILogger<ReservationService> _logger;

    public ReservationService(AppDbContext dbContext, ITopicSettingsService settings, IStudentWorkflowService workflow, ILogger<ReservationService> logger)
    {
        _dbContext = dbContext;
        _settings = settings;
        _workflow = workflow;
        _logger = logger;
    }
```

   (`StudentWorkflowService` does not depend on this service, so there is no cycle.)
2. In `ProposeAsync`, replace

```csharp
        if (!await _dbContext.Users.AnyAsync(u => u.Id == request.SupervisorId && u.Role == "Teacher" && u.IsActive))
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }
```

   with

```csharp
        // Phase 12 §4: the proposal picker lists the teachers who cover the student's group; the named
        // supervisor must be one of them.
        if (!await _dbContext.CoversGroupAsync(request.SupervisorId, StaffRole.Teacher, student.GroupId))
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }
```

3. In `GetAsync`, replace

```csharp
                || (user.IsTeacher && (row.SupervisorId == user.UserId || row.DirectionManagerId == user.UserId)));
```

   with

```csharp
                || (user.IsTeacher && row.SupervisorId == user.UserId)
                || (user.IsDirectionManager && row.DirectionManagerId == user.UserId));
```

4. In `GetForDecisionAsync`, replace the comment above the method with

```csharp
    /// §5.4, phase 12 §5. "Pending" asks for every open request - those waiting for approvers and
    /// those returned to the student. Acting as teacher, a teacher sees requests for the topics they
    /// supervise; acting as direction manager, every request in their directions. An administrator
    /// sees them all, including the history of proposals whose topic was deleted by design.
```

   and replace

```csharp
        if (!user.IsAdmin)
        {
            query = query.Where(r => r.Topic != null && (r.Topic.SupervisorId == me || r.Topic.Direction.ManagerId == me));
        }
```

   with

```csharp
        if (user.IsTeacher)
        {
            query = query.Where(r => r.Topic != null && r.Topic.SupervisorId == me);
        }
        else if (user.IsDirectionManager)
        {
            query = query.Where(r => r.Topic != null && r.Topic.Direction.ManagerId == me);
        }
        else if (!user.IsAdmin)
        {
            query = query.Where(_ => false);
        }
```

5. In `SetStudentTopicAsync` and `LoadStudentForActionAsync`, replace `"Student"` with `AccountRoles.Student`; in `AddCreatorApprovalAsync`, replace `creator.Role == "Admin"` with `creator.Role == AccountRoles.Admin`; in `SetStudentTopicAsync`'s last line, replace `new UserContext(administratorId, "Admin")` with `new UserContext(administratorId, AccountRoles.Admin)`.
6. Replace `CompleteAsync` and its comment with:

```csharp
    /// §5.2: every seat is satisfied - the request becomes the student's topic. A topic the student
    /// already holds is released first, in its own save inside the caller's transaction: both rows
    /// belong to the same student under IX_TopicReservations_ApprovedPerStudent, and one save
    /// would transiently violate it whenever EF emits the new row's UPDATE first.
    ///
    /// Phase 11 follow-up O1: when the request replaces a held topic, the student has unfinished
    /// steps whose supervisor and direction-manager seats move to the new topic's now. They are
    /// touched, and a Submitted step the new seats leave fully satisfied is approved in the caller's
    /// save - exactly as when an administrator moves a held topic to another supervisor (§4.2).
    /// Without this, a step whose only open seat disappears (the new supervisor also manages the new
    /// direction, and an administrator already stood in for the supervisor) would wait for nobody. A
    /// student with no topic has never submitted, so a first topic needs no refresh.
    private async Task<string?> CompleteAsync(TopicReservation reservation, DateTime now)
    {
        var replacing = reservation.StudentProfile.TopicId is not null;

        await ReleaseCurrentTopicAsync(reservation.StudentProfileId, now, null);

        // The student always has this very request open here, so a unique violation in phase 1 is
        // a lost race, never "you already have a request": both conflicts are reservation.changed.
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return TopicErrors.ReservationChanged;
        }

        reservation.Status = ReservationStatus.Approved;
        reservation.DecidedAt = now;
        reservation.Topic!.Status = TopicStatus.Approved;
        reservation.Topic.UpdatedAt = now;
        reservation.StudentProfile.TopicId = reservation.Topic.Id;
        reservation.StudentProfile.SupervisorId = reservation.Topic.SupervisorId;
        reservation.StudentProfile.UpdatedAt = now;

        if (replacing)
        {
            // Read from the topic and its direction, which every caller loads: the profile's new
            // values are not saved yet, and the panel facts are read from the database.
            var supervisorId = reservation.Topic.SupervisorId;
            var managerId = reservation.Topic.Direction.ManagerId;
            await _workflow.RefreshStudentPanelsAsync([reservation.StudentProfileId], now,
                facts => facts with { SupervisorId = supervisorId, DirectionManagerId = managerId });
        }

        return null;
    }
```

   `replacing` is read before `ReleaseCurrentTopicAsync` clears `TopicId` on the same tracked profile. The touched steps join the caller's save, so a racing decision on one of them fails that save as `reservation.changed` (in `ApproveAsync` and `SetStudentTopicAsync`) or is skipped (in `CompleteSatisfiedRequestsAsync`), and the student's topic and steps never disagree.

- [ ] **Step 3: The student form's supervisor within scope**

`Services/StudentService.cs`:

1. In `AssignSupervisorAsync`, replace

```csharp
        if (supervisor.Role != "Teacher" || !supervisor.IsActive)
        {
            return (null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }
```

   with

```csharp
        // Phase 12 §4: an administrator names a supervisor whose teacher role covers the student's
        // group. Naming the current supervisor again takes nothing new on.
        if (supervisor.Role != AccountRoles.Staff
            || !supervisor.IsActive
            || (supervisorId != profile.SupervisorId
                && !await _dbContext.CoversGroupAsync(supervisorId, StaffRole.Teacher, profile.GroupId)))
        {
            return (null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }
```

2. In `ResolveAssignmentAsync`, replace

```csharp
        if (supervisor.Role != "Teacher" || (!supervisor.IsActive && !isUnchangedSupervisor))
        {
            return (null, null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }
```

   with

```csharp
        // Phase 12 §4: a new supervisor's teacher role covers the student's group. The current one is
        // kept as they are - also across a move to a group their role does not cover, because
        // coverage is checked only for what is taken on.
        if (supervisor.Role != AccountRoles.Staff
            || (!isUnchangedSupervisor
                && (!supervisor.IsActive || !await _dbContext.CoversGroupAsync(supervisor.Id, StaffRole.Teacher, groupId))))
        {
            return (null, null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }
```

3. Replace every remaining `"Student"` literal in the file with `AccountRoles.Student`.

- [ ] **Step 4: Messages that name the rule**

The codes stay; their English messages now say what coverage asks for. Update the `ErrorDefinition` messages:

| File | Code | Message |
|---|---|---|
| `TopicErrors.cs` | `topic.supervisorInvalid` | `The supervisor must be an active teacher whose role covers the topic's department.` |
| `TopicErrors.cs` | `proposal.teacherInvalid` | `Choose an active teacher whose role covers your group.` |
| `OnboardingErrors.cs` | `student.supervisorInvalid` | `The supervisor must be an active teacher whose role covers the student's group.` |
| `DirectionErrors.cs` | `direction.managerInvalid` | `Choose an active direction manager whose role covers the department.` |
| `TaskErrors.cs` | `groupTask.controllerInvalid` | `Choose an active standards controller whose role covers the group.` |
| `WorkflowErrors.cs` | `panel.reviewerInvalid` | `Choose an administrator or an active teacher whose role covers the student's group.` |

- [ ] **Step 5: Keep the tests compiling**

`backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`, `CreateService`: replace

```csharp
            new ReservationService(context, new TopicSettingsService(context, NullLogger<TopicSettingsService>.Instance), NullLogger<ReservationService>.Instance),
```

with

```csharp
            new ReservationService(
                context,
                new TopicSettingsService(context, NullLogger<TopicSettingsService>.Instance),
                new StudentWorkflowService(context, new AccessScope(context), new LocalFileStorage(Path.GetTempPath()), NullLogger<StudentWorkflowService>.Instance),
                NullLogger<ReservationService>.Instance),
```

Search the test project for any other `new ReservationService(` and change it the same way:

```bash
grep -rn "new ReservationService(" backend/DiplomaTracker.Api.Tests
```

- [ ] **Step 6: Build and test**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`.

```bash
grep -rn "\"Teacher\"\|\"Admin,Teacher\"" backend/DiplomaTracker.Api --include=*.cs | grep -v /obj/ | grep -v Migrations
```

Expected: only `Services/AccountRoles.cs` and `Services/DbSeeder.cs` (the seeded account's last name, `"Demo", "Teacher"`).

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: every test passes.

---

### Task 4: Check scripts and demo data

The scripts move from `/api/teachers` and group reviewers to staff accounts with role assignments, and a new script checks the phase: assignments, the acting role, coverage, removal while in use, visibility by role, the archive, and the O1 refresh. Nothing runs here: the scripts run in Task 7 against the recreated database.

**Files:**
- Modify: `.superpowers/checks/checkCleanup.mjs`
- Modify: `.superpowers/checks/directions-approval-check.mjs`, `review-panels-check.mjs`, `workflow-check.mjs`, `hardening-check.mjs`, `templates-check.mjs`, `topics-check.mjs`, `onboarding-check.mjs`, `document-routing-check.mjs`
- Create: `.superpowers/checks/scoped-roles-check.mjs`
- Modify: `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md`

**Interfaces:**
- Consumes the endpoints of Tasks 1–3: `/api/staff`, `/api/staff/{id}/roles`, `/api/staff/options?role=`, `/api/auth/acting-role`, `GET /api/topics/supervisors`.
- Produces in `checkCleanup.mjs`: `makeStaff(call, cleanup, admin, { email, firstName, lastName, password?, roles? })` → the new account's id; `grantRoles(call, cleanup, admin, userId, roles)`; `actAs(call, token, role)` → a token. A role is `{ role, scopeKind, scopeId }`.

- [ ] **Step 1: Shared helpers**

`.superpowers/checks/checkCleanup.mjs`: add at the end:

```js
// Phase 12 (scoped staff roles): a staff account with the given roles, each `{ role, scopeKind,
// scopeId }`. Its deactivation runs in the late phase, after every direction it manages and every
// group step it controls is gone. Returns the account's id.
export async function makeStaff(call, cleanup, admin, { email, firstName, lastName, password = 'Teacher456!', roles = [] }) {
  const payload = (response) => response.body ?? response.data
  const id = payload(await call('POST', '/api/staff', { token: admin, json: { firstName, lastName, email, password } })).id
  cleanup.addLast(`staff ${email} -> deactivate`, () => call('PATCH', `/api/staff/${id}/deactivate`, { token: admin }))
  await grantRoles(call, cleanup, admin, id, roles)
  return id
}

// Gives a staff account roles, and takes back in the late phase the ones this call added - after the
// work that used them (registered later, so undone earlier) is gone. A role the account already holds
// there (409 roleAssignment.exists) belongs to whoever gave it and is left alone. A place deleted by
// the cleanup takes its assignments with it, and the removal then answers 404, which counts as done.
export async function grantRoles(call, cleanup, admin, userId, roles) {
  const payload = (response) => response.body ?? response.data
  for (const role of roles) {
    const added = await call('POST', `/api/staff/${userId}/roles`, { token: admin, json: role })
    if (added.status === 201) {
      cleanup.addLast(`role ${role.role} ${role.scopeKind} ${role.scopeId} of ${userId}`,
        () => call('DELETE', `/api/staff/${userId}/roles/${payload(added).id}`, { token: admin }))
    }
  }
}

// Design 2026-09-27 (phase 12) §5: a token acting in another role the account holds.
export async function actAs(call, token, role) {
  const response = await call('POST', '/api/auth/acting-role', { token, json: { role } })
  return (response.body ?? response.data).token
}
```

In `giveTopic`, replace its comment and body with:

```js
// Work on the steps starts only once a student holds a topic, and a topic is the student's only
// once an administrator, the direction's manager and the supervisor have approved it (design
// 2026-09-27 §5). This gives one in a single stroke: an administrator opens a direction in the
// student's department managed by `teacher`, `teacher` creates the topic there - so their
// direction and supervision seats start approved - and the administrator's assignment adds the
// third. Phase 12: `teacher` is first given the teacher and direction-manager roles for that
// department (kept as they are when already held), and `teacher` must act as teacher or as
// direction manager. The topic, the direction and the roles are removed in the late phase, after the
// student's group (and with it the student's hold on the topic) is gone. Returns the assignment's
// response.
export async function giveTopic(call, cleanup, { admin, teacher, departmentId, studentId, title }) {
  const payload = (response) => response.body ?? response.data
  const me = payload(await call('GET', '/api/auth/me', { token: teacher }))
  await grantRoles(call, cleanup, admin, me.id, [
    { role: 'Teacher', scopeKind: 'Department', scopeId: departmentId },
    { role: 'DirectionManager', scopeKind: 'Department', scopeId: departmentId }
  ])
  const direction = payload(await call('POST', '/api/directions', { token: admin, json: { departmentId, name: `Direction ${title}`, managerId: me.id } }))
  cleanup.addLast(`direction ${title}`, () => call('DELETE', `/api/directions/${direction.id}`, { token: admin }))
  const topic = payload(await call('POST', '/api/topics', { token: teacher, json: { title, directionId: direction.id } }))
  cleanup.addLast(`topic ${title}`, () => call('DELETE', `/api/topics/${topic.id}`, { token: admin }))
  return call('PUT', `/api/students/${studentId}/topic`, { token: admin, json: { topicId: topic.id } })
}
```

- [ ] **Step 2: `directions-approval-check.mjs`**

1. Import: `import { actAs, createCleanup, grantRoles, makeStaff, removeGroup } from './checkCleanup.mjs'`.
2. After `const seedDirection = …`, add `const teacherAsManager = await actAs(call, teacher, 'DirectionManager')`.
3. Replace `makeTeacher` and the three accounts with:

```js
  // Staff this script creates, with roles for the seeded department. Their deactivation and their
  // roles are late undos, so they run after every direction they manage and every group step they
  // control is gone. The manager also teaches: a topic is moved to them in S01, and P07 names them.
  async function makeTeacher(key, roles = ['Teacher']) {
    const email = `dir.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = await makeStaff(call, cleanup, admin, {
      email,
      firstName: key,
      lastName: `Dir${key}${stamp}`,
      roles: roles.map((role) => ({ role, scopeKind: 'Department', scopeId: departmentId }))
    })
    return { id, email, token: await login(email, 'Teacher456!') }
  }
  const manager = await makeTeacher('Manager', ['Teacher', 'DirectionManager'])
  // Every manager check below acts as direction manager (design phase 12 §5).
  manager.token = await actAs(call, manager.token, 'DirectionManager')
  const supervisor = await makeTeacher('Supervisor')
  const controller = await makeTeacher('Controller', ['StandardsController'])
```

4. D06: replace `{ token: teacher, json: { departmentId, name: 'Taken over' } }` with `{ token: teacherAsManager, json: { departmentId, name: 'Taken over' } }`.
5. D08: replace `/api/staff/options?capability=directionManager&search=${stamp}` with `/api/staff/options?role=directionManager&search=${stamp}`.
6. Replace the two lines that define `managerAccount` and check D09 with:

```js
  const managerRole = (await call('GET', `/api/staff/${manager.id}`, { token: admin })).body.assignments.find((a) => a.role === 'DirectionManager')
  const managerRemoval = (await call('DELETE', `/api/staff/${manager.id}/roles/${managerRole.id}`, { token: admin })).body
  check('D09 the manager\'s role cannot be removed while in use', `${managerRemoval.code} ${managerRemoval.errors?.[0]?.kind}`, 'roleAssignment.inUse managedDirection')
```

7. D10: replace `/api/teachers/${manager.id}/deactivate` with `/api/staff/${manager.id}/deactivate`.
8. After the line that registers the spare department's cleanup, add:

```js
  // Phase 12 §4: the manager named for the spare direction covers its department.
  await grantRoles(call, cleanup, admin, manager.id, [{ role: 'DirectionManager', scopeKind: 'Department', scopeId: spareDepartment.id }])
```

9. T03: rename to `'T03 a teacher publishes under a direction of a department their role covers'`.
10. Replace the two lines that define `controllerAccount` and check P05 with:

```js
  const controllerRole = (await call('GET', `/api/staff/${controller.id}`, { token: admin })).body.assignments[0]
  const controllerRemoval = (await call('DELETE', `/api/staff/${controller.id}/roles/${controllerRole.id}`, { token: admin })).body
  check('P05 the controller\'s role cannot be removed while in use', `${controllerRemoval.code} ${controllerRemoval.errors?.[0]?.kind}`, 'roleAssignment.inUse controlledStep')
```

11. Replace P10 with:

```js
  const controllerProgress = await call('GET', `/api/groups/${group.id}/progress`, { token: controller.token })
  check('P10 the controller sees the group but opens no student in full', `${controllerProgress.status} ${controllerProgress.body.students?.some((s) => s.canOpen)}`, '200 false')
```

The check count stays 70.

- [ ] **Step 3: `review-panels-check.mjs`**

1. Import: `import { createCleanup, giveTopic, makeStaff, removeGroup } from './checkCleanup.mjs'` (keep whatever else the file imports).
2. `teacherId`: replace `'/api/teachers'` with `'/api/staff'`.
3. Replace the arrange comment's `a teacher who reviews the group, ` with nothing, and replace `makeTeacher` and the accounts with:

```js
  // Teachers of the department. Phase 12 §4.1: there are no group reviewers any more.
  async function makeTeacher(key) {
    const email = `panel.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = await makeStaff(call, cleanup, admin, {
      email,
      firstName: key,
      lastName: `Panel${key}${stamp}`,
      roles: [{ role: 'Teacher', scopeKind: 'Department', scopeId: department.id }]
    })
    return { id, token: await login(email, 'Teacher456!') }
  }
  const extraA = await makeTeacher('Alpha')
  const extraB = await makeTeacher('Beta')
  const outsider = await makeTeacher('Outsider')
```

   and delete the line that posts to `/api/groups/${group.id}/reviewers`.
4. Check 02: replace `{ token: watcher.token }` with `{ token: teacher }`.
5. Check 05: replace it with `check('05 an administrator adds an extra reviewer', addedA.body.panel?.length, 2)` and its request's `{ token: watcher.token, … }` with `{ token: admin, … }`.
6. Check 10a: replace with `check('10a and now sees the group of the student they review', (await call('GET', `/api/groups/${group.id}`, { token: extraA.token })).status, 200)` (phase 12 §4.1: a teacher's groups include the groups of students they sit on a panel for).
7. Check 12a: replace with `check('12a an unrelated teacher\'s queue does not', await inQueue(outsider.token), false)`.
8. Check 13: replace with `check('13 an unrelated teacher cannot decide', (await call('POST', `/api/submissions/${v1Id}/approve`, { token: outsider.token, json: { mark: 90 } })).body.code, 'submission.notFound')`.
9. Check 27: replace `{ token: watcher.token }` with `{ token: admin }`.

- [ ] **Step 4: `workflow-check.mjs`**

1. Import `makeStaff` from `./checkCleanup.mjs` beside what the file imports.
2. Replace `'/api/teachers'` in the `teachers` lookup with `'/api/staff'`.
3. Delete the line that posts to `/api/groups/${group.id}/reviewers`, and rewrite the arrange comment above it to say the seed teacher supervises the student (through `giveTopic`) and a second teacher of the department has nothing to do with them.
4. Replace the two lines that create `otherTeacherId` and register its deactivation with:

```js
// Phase 12: a teacher of the same department with no student and no seat here.
const otherTeacherId = await makeStaff(call, cleanup, admin, {
  email: otherTeacherEmail,
  firstName: 'Other',
  lastName: 'Teacher',
  roles: [{ role: 'Teacher', scopeKind: 'Department', scopeId: department.id }]
})
```

   (`otherTeacherId` may be unused afterwards; keep the name for readability or drop it.)

- [ ] **Step 5: `hardening-check.mjs`**

1. Import `makeStaff` beside the existing imports from `./checkCleanup.mjs`.
2. Check 03: replace `'/api/teachers'` with `'/api/staff'` in the create call and `/api/teachers/${okTeacher.body.id}/deactivate` with `/api/staff/${okTeacher.body.id}/deactivate`; rename the check `'03 staff 8-char password succeeds'`.
3. Above `hardeningDirection`, add the comment `// giveTopic (the uploads section) already gave the seeded teacher the direction-manager role for this department.`
4. Replace the three lines that create `queueTeacherId`, register its deactivation and post it as a group reviewer (keep the `queueTeacherToken` line) with:

```js
// Phase 12 §4.1: a teacher of the department with no student in the queue group.
const queueTeacherId = await makeStaff(call, cleanup, admin, {
  email: queueTeacherEmail,
  firstName: 'Queue',
  lastName: 'Teacher',
  roles: [{ role: 'Teacher', scopeKind: 'Department', scopeId: hardeningDepartment.id }]
})
```

5. The `groupProgress` read for checks 27a/27b: replace `{ token: queueTeacherToken }` with `{ token: teacher }` (the seed teacher supervises the queue students).
6. Replace check 30b and the comment block above 30b/30c with:

```js
// Phase 12 §4.1: the dashboard's groups are the groups of the students a teacher works with. The
// seed teacher supervises the queue students; a teacher of the department with no student there
// does not see the group at all.
check('30b a teacher with no student in the group does not see it', (await call('GET', '/api/dashboard/teacher', { token: queueTeacherToken })).body.groups.some((g) => g.groupId === queueGroup.id), false)
```

7. In the templates section, delete the two lines that look up `seedTeacherId` and post it as a reviewer of `commonGroup`, and change the comment above them to: `// A teacher may share a template only with a group they can see: the seed teacher supervises the uploader, who is in the common group.`

- [ ] **Step 6: `templates-check.mjs`**

1. `teacherId`: replace `'/api/teachers'` with `'/api/staff'`.
2. Delete the line that posts the seed teacher to `/api/groups/${homeGroup.id}/reviewers`, and change the comment above `homeGroup` to end with `the seed teacher supervises this script's student, so the home group is theirs to share templates with.`
3. Replace `'/api/teachers'` in the `otherTeacherId` create call with `'/api/staff'`, and `/api/teachers/${otherTeacherId}/deactivate` with `/api/staff/${otherTeacherId}/deactivate`. The other teacher keeps no role: templates are every staff member's (phase 12 §6).
4. Right after the line that creates `student`, add:

```js
// Phase 12 §4.1: the home group is the seed teacher's through the student they supervise.
await call('PUT', `/api/students/${student.id}/supervisor`, { token: admin, json: { supervisorId: teacherId } })
```

- [ ] **Step 7: `topics-check.mjs`**

1. Import `actAs`, `grantRoles` and `makeStaff` beside the existing imports from `./checkCleanup.mjs`.
2. `teachers`: replace `'/api/teachers'` with `'/api/staff'`.
3. Replace the three lines that create `teacher2Id`, log `teacher2` in and register its deactivation with:

```js
const teacher2Id = await makeStaff(call, cleanup, admin, {
  email: teacher2Email,
  firstName: 'Second',
  lastName: 'Teacher',
  roles: [{ role: 'Teacher', scopeKind: 'Department', scopeId: departmentId }]
})
const teacher2 = await login(teacher2Email, 'Teacher456!')
// Phase 12 §5: the seeded teacher decides as direction manager on topics they do not supervise.
const teacherAsManager = await actAs(call, teacher, 'DirectionManager')
```

4. Right after the line that creates `otherDepartment` (and registers its cleanup), add:

```js
// Phase 12 §4: the seeded teacher manages and teaches in this department too.
await grantRoles(call, cleanup, admin, teacherId, [
  { role: 'Teacher', scopeKind: 'Department', scopeId: otherDepartment.id },
  { role: 'DirectionManager', scopeKind: 'Department', scopeId: otherDepartment.id }
])
```

5. Check 34b: replace `{ token: teacher }` with `{ token: teacherAsManager }` (the replacement topic is `teacher2`'s; the seeded teacher holds only its direction seat).

- [ ] **Step 8: `onboarding-check.mjs` and `document-routing-check.mjs`**

- `onboarding-check.mjs`: replace every `/api/teachers` with `/api/staff` (the list, and the four `…/password` calls). Rename checks 31–33 from "teacher" to "staff" wording.
- `document-routing-check.mjs`: in `makeTeacher`, replace `'/api/teachers'` with `'/api/staff'` and `/api/teachers/${id}/deactivate` with `/api/staff/${id}/deactivate`. These accounts keep no role: documents are every staff member's.

Then confirm nothing is left:

```bash
grep -rn "/api/teachers\|isDirectionManager\|isStandardsController\|capability=\|/reviewers', { token: admin, json: { reviewerId\|groups/\${[a-zA-Z.]*}/reviewers" .superpowers/checks .superpowers/demo
```

Expected: no output.

- [ ] **Step 9: The new script**

Create `.superpowers/checks/scoped-roles-check.mjs`. Its helper block (from `const crcTable` down to the end of `function form()`) is copied verbatim from `directions-approval-check.mjs` (the lines under `// ---------- minimal genuine .docx (same shape as workflow-check.mjs) ----------`).

```js
// Design 2026-09-27 (phase 12): scoped staff roles - assignments, the acting role, coverage when
// work is taken on, removal while in use, what each role sees, and the archive by supervisor. Also
// the phase 11 follow-up O1: completing an administrator's topic replacement refreshes the student's
// unfinished steps. Runs against the live local API on :5000 and leaves nothing behind.
import { actAs, createCleanup, grantRoles, makeStaff, removeGroup } from './checkCleanup.mjs'

const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []
const cleanup = createCleanup()

function check(name, actual, expected) {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

async function paceAuth() {
  const now = Date.now()
  while (authCalls.length && now - authCalls[0] > 61_000) authCalls.shift()
  if (authCalls.length >= 9) {
    const wait = 61_000 - (now - authCalls[0])
    console.log(`... waiting ${Math.ceil(wait / 1000)}s for the rate-limit window`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    authCalls.length = 0
  }
  authCalls.push(Date.now())
}

async function call(method, path, { token, json, form } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) }
  }
  return { status: response.status, headers: response.headers, body: await response.json() }
}

const signIn = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body
const login = async (email, password) => (await signIn(email, password)).token

// ---------- minimal genuine .docx (copied from directions-approval-check.mjs) ----------
// … the crcTable / crc32 / zip / W / docx / form() block, verbatim …

async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')
  const teacherId = (await call('GET', '/api/auth/me', { token: teacher })).body.id
  const teacherAsManager = await actAs(call, teacher, 'DirectionManager')

  const seedGroup = (await call('GET', '/api/groups', { token: admin })).body.find((g) => g.code === 'SEED-A')
  const seedDepartmentId = seedGroup.departmentId
  const seedDirection = (await call('GET', `/api/directions?departmentId=${seedDepartmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering')

  const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
  cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
  await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

  // A group in the seeded department, and a faculty, department and group of this script's own.
  const g1 = (await call('POST', '/api/groups', { token: admin, json: { departmentId: seedDepartmentId, code: `SR1${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${g1.code}`, () => removeGroup(call, admin, g1))
  const faculty2 = (await call('POST', '/api/faculties', { token: admin, json: { name: `Scoped Faculty ${stamp}`, shortName: `SF${stamp}` } })).body
  cleanup.addLast(`faculty ${faculty2.shortName}`, () => call('DELETE', `/api/faculties/${faculty2.id}`, { token: admin }))
  const department2 = (await call('POST', '/api/departments', { token: admin, json: { facultyId: faculty2.id, name: `Scoped Department ${stamp}`, shortName: `SD${stamp}` } })).body
  cleanup.addLast(`department ${department2.shortName}`, () => call('DELETE', `/api/departments/${department2.id}`, { token: admin }))
  const g2 = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department2.id, code: `SR2${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${g2.code}`, () => removeGroup(call, admin, g2))

  // A teaches one group. B teaches the new faculty and manages directions in its department. C holds no role.
  const staffEmail = (key) => `scoped.${key}.${stamp}@diploma.local`
  const aId = await makeStaff(call, cleanup, admin, {
    email: staffEmail('a'), firstName: 'Anna', lastName: `ScopedA${stamp}`,
    roles: [{ role: 'Teacher', scopeKind: 'Group', scopeId: g1.id }]
  })
  const bId = await makeStaff(call, cleanup, admin, {
    email: staffEmail('b'), firstName: 'Bohdan', lastName: `ScopedB${stamp}`,
    roles: [
      { role: 'Teacher', scopeKind: 'Faculty', scopeId: faculty2.id },
      { role: 'DirectionManager', scopeKind: 'Department', scopeId: department2.id }
    ]
  })
  const cId = await makeStaff(call, cleanup, admin, { email: staffEmail('c'), firstName: 'Cyril', lastName: `ScopedC${stamp}` })

  async function makeStudent(key, group) {
    const email = `scoped.${key.toLowerCase()}.${stamp}@student.local`
    const id = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Scoped', lastName: `Student${key}`, email, studentNumber: `SR${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body.id
    return { id, token: await login(email, 'Password1!') }
  }
  const s1 = await makeStudent('A', g1)
  const s2 = await makeStudent('B', g2)
  const s3 = await makeStudent('C', g1)

  // ---------- signing in and the acting role (§5) ----------
  const cSession = await signIn(staffEmail('c'), 'Teacher456!')
  check('R01 a staff member with no role acts as none', `${cSession.user.role} ${cSession.user.accountRole} ${cSession.user.assignments.length}`, 'Staff Staff 0')
  check('R02 and is refused the staff pages', (await call('GET', '/api/review/queue', { token: cSession.token })).status, 403)
  check('R03 but keeps the documents', (await call('GET', '/api/documents', { token: cSession.token })).status, 200)

  const aSession = await signIn(staffEmail('a'), 'Teacher456!')
  const aToken = aSession.token
  check('R04 a teacher of one group acts as teacher there', `${aSession.user.role} ${aSession.user.assignments[0]?.scopeKind} ${aSession.user.assignments[0]?.scopeName}`, `Teacher Group ${g1.code}`)
  check('R05 a role not held cannot be taken', (await call('POST', '/api/auth/acting-role', { token: aToken, json: { role: 'DirectionManager' } })).body.code, 'actingRole.notHeld')

  const bSession = await signIn(staffEmail('b'), 'Teacher456!')
  const bTeacher = bSession.token
  check('R06 a staff member starts in their first role', bSession.user.role, 'Teacher')
  const switched = (await call('POST', '/api/auth/acting-role', { token: bTeacher, json: { role: 'DirectionManager' } })).body
  const bManager = switched.token
  check('R07 switching issues a token in the new role', switched.user.role, 'DirectionManager')
  check('R08 the old token still works while its role is held', (await call('GET', '/api/review/queue', { token: bTeacher })).status, 200)

  // ---------- administration (§6) ----------
  const addRole = (userId, json, token = admin) => call('POST', `/api/staff/${userId}/roles`, { token, json })
  check('A01 a direction manager is not assigned to a group', (await addRole(cId, { role: 'DirectionManager', scopeKind: 'Group', scopeId: g1.id })).body.code, 'roleAssignment.scopeNotAllowed')
  check('A02 the place must exist', (await addRole(cId, { role: 'Teacher', scopeKind: 'Department', scopeId: crypto.randomUUID() })).body.code, 'roleAssignment.scopeInvalid')
  check('A03 a role is held once per place', (await addRole(aId, { role: 'Teacher', scopeKind: 'Group', scopeId: g1.id })).body.code, 'roleAssignment.exists')
  check('A04 an unknown role name is refused', (await addRole(cId, { role: 'Principal', scopeKind: 'Group', scopeId: g1.id })).body.code, 'validation.failed')
  check('A05 only an administrator assigns roles', (await addRole(cId, { role: 'Teacher', scopeKind: 'Group', scopeId: g1.id }, teacher)).status, 403)
  const teachersOf = async (groupId) => (await call('GET', `/api/staff?role=Teacher&groupId=${groupId}`, { token: admin })).body.map((s) => s.id)
  const g1Teachers = await teachersOf(g1.id)
  check('A06 the teachers of a group are those whose role covers it', `${g1Teachers.includes(aId)} ${g1Teachers.includes(teacherId)} ${g1Teachers.includes(bId)}`, 'true true false')
  const g2Teachers = await teachersOf(g2.id)
  check('A07 a faculty assignment covers the faculty\'s groups', `${g2Teachers.includes(bId)} ${g2Teachers.includes(aId)}`, 'true false')

  // ---------- coverage when work is taken on (§4) ----------
  check('C01 a teacher of one group publishes no catalogue topic', (await call('POST', '/api/topics', { token: aToken, json: { title: `Nope ${stamp}`, directionId: seedDirection.id } })).body.code, 'scope.notCovered')
  const s1Supervisors = (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.map((t) => t.id)
  const s2Supervisors = (await call('GET', '/api/topics/supervisors', { token: s2.token })).body.map((t) => t.id)
  check('C02 a student is offered the teachers who cover their group', `${s1Supervisors.includes(aId)} ${s1Supervisors.includes(bId)} ${s2Supervisors.includes(bId)} ${s2Supervisors.includes(aId)}`, 'true false true false')
  check('C03 a direction manager opens no direction outside their role', (await call('POST', '/api/directions', { token: bManager, json: { departmentId: seedDepartmentId, name: `Outside ${stamp}` } })).body.code, 'scope.notCovered')
  const directionB = await call('POST', '/api/directions', { token: bManager, json: { departmentId: department2.id, name: `Scoped ${stamp}` } })
  check('C04 but opens one inside it', directionB.status, 201)
  cleanup.addLast(`direction Scoped ${stamp}`, () => call('DELETE', `/api/directions/${directionB.body.id}`, { token: admin }))
  check('C05 an administrator names a manager whose role covers the department', (await call('POST', '/api/directions', { token: admin, json: { departmentId: seedDepartmentId, name: `Named ${stamp}`, managerId: bId } })).body.code, 'direction.managerInvalid')
  check('C06 a proposal names a teacher who covers the student\'s group', (await call('POST', '/api/topics/proposals', { token: s2.token, json: { title: `Proposal ${stamp}`, supervisorId: aId, directionId: directionB.body.id } })).body.code, 'proposal.teacherInvalid')
  check('C07 the student form names a supervisor who covers the group', (await call('PUT', `/api/students/${s2.id}/supervisor`, { token: admin, json: { supervisorId: aId } })).body.code, 'student.supervisorInvalid')
  check('C08 and accepts one who does', (await call('PUT', `/api/students/${s2.id}/supervisor`, { token: admin, json: { supervisorId: bId } })).status, 200)

  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === seedGroup.facultyId)
    .sort((a, b) => a.order - b.order)
  await call('POST', `/api/groups/${g1.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: '2099-01-01T00:00:00Z' }] } })
  const g1Step = (await call('GET', `/api/groups/${g1.id}/tasks`, { token: admin })).body[0]
  check('C09 group steps are the administrators\' to change', (await call('PUT', `/api/group-tasks/${g1Step.id}`, { token: teacher, json: { deadline: '2099-02-01T00:00:00Z' } })).status, 403)
  const s1Step = (await call('GET', '/api/student-tasks/mine', { token: s1.token })).body[0]
  check('C10 an extra reviewer covers the student\'s group', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: bId } })).body.code, 'panel.reviewerInvalid')
  check('C11 a teacher of that group can sit on the panel', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: aId } })).status, 200)
  const extraOptions = (await call('GET', `/api/staff/options?studentTaskId=${s1Step.id}&search=${stamp}`, { token: admin })).body.map((o) => o.id)
  check('C12 the extra-reviewer picker offers only those teachers', `${extraOptions.includes(aId)} ${extraOptions.includes(bId)}`, 'true false')

  // ---------- what each role sees (§4.2) ----------
  const listed = async (token) => (await call('GET', '/api/review/students?pageSize=100', { token })).body.items.map((i) => i.studentProfileId)
  check('V01 acting as teacher, a supervisor lists their student', (await listed(bTeacher)).includes(s2.id), true)
  check('V02 acting as direction manager, the same person does not', (await listed(bManager)).includes(s2.id), false)
  check('V03 an extra reviewer sees the group of the student they review', (await call('GET', `/api/groups/${g1.id}`, { token: aToken })).status, 200)
  check('V04 group reviewers are gone', (await call('GET', `/api/groups/${g1.id}/reviewers`, { token: admin })).status, 404)

  // ---------- removing a role in use (§6) ----------
  const assignmentsOf = async (userId) => (await call('GET', `/api/staff/${userId}`, { token: admin })).body.assignments
  const removeRole = (userId, assignmentId) => call('DELETE', `/api/staff/${userId}/roles/${assignmentId}`, { token: admin })
  const bRoles = await assignmentsOf(bId)
  const refusedTeach = (await removeRole(bId, bRoles.find((a) => a.role === 'Teacher').id)).body
  check('U01 a teacher role is kept while its holder supervises there', `${refusedTeach.code} ${refusedTeach.errors?.map((e) => e.kind).join(',')}`, 'roleAssignment.inUse supervisedStudent')
  const refusedManage = (await removeRole(bId, bRoles.find((a) => a.role === 'DirectionManager').id)).body
  check('U02 a manager role is kept while a direction is managed there', `${refusedManage.code} ${refusedManage.errors?.[0]?.kind}`, 'roleAssignment.inUse managedDirection')
  const aGroupRole = (await assignmentsOf(aId))[0]
  check('U03 a teacher role is kept while its holder sits on a panel there', (await removeRole(aId, aGroupRole.id)).body.errors?.[0]?.kind, 'panelSeat')
  await grantRoles(call, cleanup, admin, aId, [{ role: 'Teacher', scopeKind: 'Department', scopeId: seedDepartmentId }])
  check('U04 another assignment covering the same place frees it', (await removeRole(aId, aGroupRole.id)).status, 204)
  check('U05 the session goes on under the wider role', (await call('GET', '/api/auth/me', { token: aToken })).status, 200)

  // ---------- a withdrawn role ends its sessions (§5) ----------
  await grantRoles(call, cleanup, admin, cId, [{ role: 'Teacher', scopeKind: 'Group', scopeId: g2.id }])
  const cTeacher = await login(staffEmail('c'), 'Teacher456!')
  check('S01 a new role is taken at the next sign-in', (await call('GET', '/api/auth/me', { token: cTeacher })).body.role, 'Teacher')
  check('S02 an unused role can be removed', (await removeRole(cId, (await assignmentsOf(cId))[0].id)).status, 204)
  check('S03 the session acting in it ends at once', (await call('GET', '/api/auth/me', { token: cTeacher })).status, 401)
  const cAgain = await signIn(staffEmail('c'), 'Teacher456!')
  check('S04 signing in again acts as none', cAgain.user.role, 'Staff')
  check('S05 a staff member acting in no role has no dashboard', (await call('GET', '/api/dashboard/teacher', { token: cAgain.token })).status, 403)
  check('S06 every staff role has one', (await call('GET', '/api/dashboard/teacher', { token: await actAs(call, teacher, 'StandardsController') })).status, 200)

  // ---------- O1: a replacement that completes refreshes the student's steps ----------
  // s3's first topic is A's, in the seeded direction the seeded teacher manages, so its step panel
  // has a supervisor seat and a separate direction-manager seat.
  const first = (await call('POST', '/api/topics', { token: teacherAsManager, json: { title: `First ${stamp}`, directionId: seedDirection.id, supervisorId: aId } })).body
  cleanup.addLast(`topic First ${stamp}`, () => call('DELETE', `/api/topics/${first.id}`, { token: admin }))
  const request = (await call('POST', `/api/topics/${first.id}/reserve`, { token: s3.token })).body
  await call('POST', `/api/reservations/${request.id}/approve`, { token: aToken })
  check('O01 the first topic is approved', (await call('POST', `/api/reservations/${request.id}/approve`, { token: admin })).body.status, 'Approved')
  const s3Step = (await call('GET', '/api/student-tasks/mine', { token: s3.token })).body[0]
  await call('POST', `/api/student-tasks/${s3Step.id}/submissions`, { token: s3.token, form: form() })
  const pending = (await call('GET', `/api/student-tasks/${s3Step.id}`, { token: admin })).body
  const standIn = (await call('POST', `/api/submissions/${pending.pendingSubmissionId}/approve`, { token: admin, json: { mark: 80 } })).body
  check('O02 the administrator stands in for the supervisor; the manager still has to decide', `${standIn.status} ${standIn.panelApproved}/${standIn.panelSize}`, 'Submitted 1/2')
  // The replacement is the seeded teacher's own topic in their own direction: its supervisor is its
  // manager, so the new panel is one supervisor seat - already filled by the stand-in approval.
  const second = (await call('POST', '/api/topics', { token: teacher, json: { title: `Second ${stamp}`, directionId: seedDirection.id } })).body
  cleanup.addLast(`topic Second ${stamp}`, () => call('DELETE', `/api/topics/${second.id}`, { token: admin }))
  check('O03 the replacement completes at once', (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: second.id } })).body.status, 'Approved')
  const refreshed = (await call('GET', `/api/student-tasks/${s3Step.id}`, { token: admin })).body
  check('O04 the step that waited for the old manager is approved with it', `${refreshed.status} ${refreshed.mark}`, 'Approved 80')

  // ---------- the archive, by supervisor (§4.1) ----------
  await call('POST', '/api/students/archive', { token: admin, json: { studentIds: [s3.id] } })
  const archiveCodes = async (token) => {
    const response = await call('GET', `/api/archive/groups?search=${encodeURIComponent(g1.code)}`, { token })
    return response.status === 200 ? response.body.map((a) => a.groupCode) : response.status
  }
  check('H01 the supervisor recorded in the archive reads it', (await archiveCodes(teacher)).includes(g1.code), true)
  check('H02 another teacher does not', (await archiveCodes(aToken)).length, 0)
  check('H03 nor does the same supervisor acting as direction manager', await archiveCodes(teacherAsManager), 403)
}

try {
  await runChecks()
} catch (error) {
  results.push(false)
  console.log(`FAIL  unexpected error: ${error?.stack ?? error}`)
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

Replace the comment line `// … the crcTable / crc32 / zip / W / docx / form() block, verbatim …` with that block. The script has 49 checks.

- [ ] **Step 10: Demo data**

`.superpowers/demo/seed-demo.mjs`:

1. Add after `const login = …`:

```js
// Design 2026-09-27 (phase 12) §5: a token acting in another role the account holds.
const actAs = async (token, role) => (await call('POST', '/api/auth/acting-role', { token, json: { role } })).token
```

2. Replace `TEACHERS` with:

```js
// Design 2026-09-27 (phase 12): roles per place. Петренко teaches and manages directions in ІПЗ;
// Коваленко teaches across ФІОТ; Шевчук teaches across ФІОТ and manages the direction of ІСТ;
// Гриценко is the standards controller of ІП-21 only. Each role is [role, scope kind, place key].
const TEACHERS = {
  petrenko: { firstName: 'Олена', lastName: 'Петренко', patronymic: 'Василівна', email: 'o.petrenko@diploma.local', roles: [['Teacher', 'Department', 'ipz'], ['DirectionManager', 'Department', 'ipz']] },
  kovalenko: { firstName: 'Андрій', lastName: 'Коваленко', patronymic: 'Миколайович', email: 'a.kovalenko@diploma.local', roles: [['Teacher', 'Faculty', 'fiot']] },
  shevchuk: { firstName: 'Ірина', lastName: 'Шевчук', patronymic: 'Олегівна', email: 'i.shevchuk@diploma.local', roles: [['Teacher', 'Faculty', 'fiot'], ['DirectionManager', 'Department', 'ist']] },
  hrytsenko: { firstName: 'Наталія', lastName: 'Гриценко', patronymic: 'Павлівна', email: 'n.hrytsenko@diploma.local', roles: [['StandardsController', 'Group', 'ip21']] }
}
const ROLE_LABELS = { Teacher: 'Викладач', DirectionManager: 'Керівник напряму', StandardsController: 'Нормоконтролер' }
```

3. Replace the `console.log('Teachers...')` block (the loop creating teachers and the `reviewers` loop) with:

```js
  console.log('Staff and their roles...')
  const places = { Faculty: { fiot: faculty }, Department: departments, Group: groups }
  const teachers = {}
  for (const [key, t] of Object.entries(TEACHERS)) {
    const { roles, ...account } = t
    const created = await call('POST', '/api/staff', { token: admin, json: { ...account, password: DEMO_PASSWORD } })
    for (const [role, scopeKind, place] of roles) {
      await call('POST', `/api/staff/${created.id}/roles`, { token: admin, json: { role, scopeKind, scopeId: places[scopeKind][place].id } })
    }
    const token = await login(t.email, DEMO_PASSWORD)
    const managesDirections = roles.some(([role]) => role === 'DirectionManager')
    // A direction manager's directions, approvals and step seats are theirs acting as one (§5).
    teachers[key] = { ...t, id: created.id, token, managerToken: managesDirections ? await actAs(token, 'DirectionManager') : null }
  }
```

4. Directions: replace `{ token: teachers[d.manager].token, json: … }` with `{ token: teachers[d.manager].managerToken, json: … }`.
5. Approvals: in the `kind === 'approved'` branch replace `{ token: teachers[managerKey].token }` with `{ token: teachers[managerKey].managerToken }`; in the `kind === 'returned'` branch the same.
6. Reviews: in `approveOthers`, replace `if (manager) await decide(manager, 'approve', …)` with `if (manager) await decide({ token: manager.managerToken }, 'approve', …)` (arguments after the first unchanged).
7. The closing account list: replace the two lines computing `label` and printing each teacher with:

```js
  for (const t of Object.values(teachers)) {
    const label = [...new Set(t.roles.map(([role]) => ROLE_LABELS[role]))].join(', ')
    console.log(`  ${label}   ${t.lastName} ${t.firstName} ${t.patronymic}: ${t.email}`)
  }
```

8. Any comment that still says a teacher "reviews" a group: rewrite it (group reviewers no longer exist), e.g. the `// ІС-21: reviewed by Шевчук` comment becomes `// ІС-21: Шевчук's department`.

`.superpowers/demo/README.md`:
- In the accounts table, change the four staff rows' *Role* and *What this account shows* columns:
  - Петренко: `Викладач (ІПЗ), керівник напряму (ІПЗ)` — supervises four students and a student proposal; has one pending topic request (Олійник); reads the ІП-11 archive; manages the three ІПЗ directions (switch to *Керівник напряму* in the user menu to approve their topic requests and to sit on their students' panels).
  - Коваленко: `Викладач (ФІОТ)` — supervises the ІП-22 students who are behind: overdue steps and a late submission waiting; extra reviewer on Бондаренко's step 2.
  - Шевчук: `Викладач (ФІОТ), керівник напряму (ІСТ)` — supervises ІС-21; extra reviewer in ІП-21; manages the ІСТ direction.
  - Гриценко: `Нормоконтролер (ІП-21)` — standards controller of ІП-21's first two steps; approves without a mark, from the review queue.
- In *Walkthrough (phase 8 handoff §6)* → **Teacher**, replace "every group she reviews or supervises a student in — ІП-21 plus whichever other group holds one of her supervised students, not reviewed groups alone" with "every group of the students she works with as a teacher", and delete "never a group reviewer's watch access, and".
- In *Review panels*, replace the bullet that begins "A group's reviewer (for ІП-21, Петренко)" with: "A group's **progress matrix** splits into **My students** (the students the caller works with in the role they act in) and **Others**, which never open. Acting as teacher, Петренко's are the students she supervises; acting as direction manager, the students whose topic is in one of her directions."
- In *Walkthrough (phase 11)* → **Administrator**, replace the *Teachers* bullet with `*Staff*: each person's roles; open one to add or remove a role.`
- Add at the end:

```markdown
## Walkthrough (phase 12)

- **Administrator:**
  - *Staff*: Петренко holds two roles in ІПЗ, Коваленко one for the whole ФІОТ, Гриценко one for ІП-21 only.
  - Open Шевчук and try to remove her *Керівник напряму* role: refused, with the ІСТ direction listed. Add Коваленко as *Нормоконтролер* for ІП-22 and remove it again.
  - *Groups*: no *Reviewers* section any more.
- **Петренко:** the user menu reads *Викладач*; switch to *Керівник напряму* — the tabs become Dashboard, Review, Groups, Directions, Documents, and the review queue lists the direction-manager seats (Лисенко, Мельник). Switch back.
- **Гриценко:** only Dashboard, Review, Groups and Documents; the Groups tab shows ІП-21, where no student opens in full.
- **Коваленко:** *Archive* is empty (ІП-11's students were Петренко's).
```

---

## Walkthrough (phase 12)

The owner's manual walkthrough after Task 7 follows `.superpowers/demo/README.md`, *Walkthrough (phase 12)* (written in Task 4 Step 10). Sign-in in the in-app browser is done by the owner.

---

### Task 5: Client, acting role, navigation and translations

The client learns the new shapes, the acting role and the role switcher, and the navigation gets one tab set per role. Pages that Task 6 rewrites may fail the type check at the end of this task; nothing else may.

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`
- Create: `frontend/diploma-tracker-web/src/api/staffApi.ts`
- Delete: `frontend/diploma-tracker-web/src/api/teachersApi.ts`
- Modify: `frontend/diploma-tracker-web/src/api/authApi.ts`, `groupsApi.ts`, `workflowApi.ts`, `topicsApi.ts`, `directionsApi.ts`
- Modify: `frontend/diploma-tracker-web/src/auth/context.ts`, `AuthContext.tsx`, `ProtectedRoute.tsx`, `RoleRedirect.tsx`, `pages/LoginPage.tsx`
- Replace: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`, `UserMenu.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/layout/AppShell.tsx`, `App.tsx`
- Modify: `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json`

**Interfaces:**
- Consumes: the wire shapes of Tasks 1–3.
- Produces types `StaffRole`, `ActingRole`, `RoleScopeKind`, `RoleAssignment`, `RoleAssignmentBlocker`, `StaffMember`, `CreateStaffRequest`, `UpdateStaffRequest`, `AddRoleAssignmentRequest`, `StaffOptionsQuery`; `CurrentUser` gains `accountRole` and `assignments` and loses the two flags; `StaffOption.role` is `'Admin' | 'Staff'`.
- Produces `staffApi.ts`: `getStaff(query?)`, `getStaffMember(id)`, `createStaff`, `updateStaff`, `deactivateStaff`, `setStaffPassword`, `addRoleAssignment(staffId, request)`, `removeRoleAssignment(staffId, assignmentId)`, `searchStaff(search, query?)`.
- Produces `authApi.switchActingRole(role)`; `AuthContextValue.switchRole(role: StaffRole): Promise<CurrentUser>`.
- Produces in `navigation.ts`: `homeRouteByRole: Record<ActingRole, string>`, `navigationByRole: Record<ActingRole, NavItem[]>`, `staffRoles: StaffRole[]`, `heldRoles(user: CurrentUser): StaffRole[]`.
- Produces routes: `/admin/staff` (`StaffPage`), `/admin/staff/:id` (`StaffMemberPage`), `/staff/dashboard`, `/staff/groups`, `/staff/groups/:groupId`, `/staff/topics`, `/staff/directions`.

- [ ] **Step 1: Types**

`src/api/types.ts`:

1. Replace `CurrentUser` with:

```ts
export type StaffRole = 'Teacher' | 'DirectionManager' | 'StandardsController'

/** The role a session acts in (design 2026-09-27, phase 12, §5). `Staff` is a staff member acting in no role. */
export type ActingRole = 'Admin' | StaffRole | 'Staff' | 'Student'

export type RoleScopeKind = 'Faculty' | 'Department' | 'Group'

export type RoleAssignment = {
  id: string
  role: StaffRole
  scopeKind: RoleScopeKind
  scopeId: string
  /** The faculty's or department's name, or the group's code. */
  scopeName: string
  /** Short names from the faculty down, e.g. "ФІОТ / ІПЗ / ІП-21". */
  scopePath: string
  facultyId: string
  departmentId: string | null
  groupId: string | null
  createdAt: string
}

export type RoleAssignmentBlocker = {
  kind: 'supervisedStudent' | 'supervisedTopic' | 'panelSeat' | 'managedDirection' | 'controlledStep'
  label: string
}

export type CurrentUser = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: ActingRole
  accountRole: 'Admin' | 'Staff' | 'Student'
  assignments: RoleAssignment[]
}
```

2. Replace `Teacher`, `CreateTeacherRequest` and `UpdateTeacherRequest` with:

```ts
export type StaffMember = {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  isActive: boolean
  assignments: RoleAssignment[]
  createdAt: string
  updatedAt: string
}

export type CreateStaffRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  password: string
}

export type UpdateStaffRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
}

export type AddRoleAssignmentRequest = {
  role: StaffRole
  scopeKind: RoleScopeKind
  scopeId: string
}

/** `studentTaskId` asks for the extra-reviewer picker of that step; otherwise `role` narrows to staff
 *  holding it, for `groupId` or `departmentId` when given. */
export type StaffOptionsQuery = {
  role?: StaffRole
  groupId?: string
  departmentId?: string
  studentTaskId?: string
}
```

3. Delete `GroupReviewer` and `AddGroupReviewerRequest`.
4. In `StaffOption`, change `role: 'Admin' | 'Teacher'` to `role: 'Admin' | 'Staff'`.
5. Delete `export type StaffCapability = 'directionManager' | 'standardsController'`.
6. In `DirectionQuery`, add `covered?: boolean`.
7. In `ArchivedGroupDetails`, delete `reviewerNames: string[]`.

- [ ] **Step 2: API modules**

Delete `src/api/teachersApi.ts`. Create `src/api/staffApi.ts`:

```ts
import { apiRequest } from './apiClient'
import type {
  AddRoleAssignmentRequest,
  CreateStaffRequest,
  RoleAssignment,
  StaffMember,
  StaffOption,
  StaffOptionsQuery,
  StaffRole,
  UpdateStaffRequest
} from './types'

function toQueryString(query: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** The administrator's staff list. With `role`, only staff holding it - for `groupId` or
 *  `departmentId` when given (design 2026-09-27, phase 12, §4). */
export function getStaff(query: { role?: StaffRole; groupId?: string; departmentId?: string } = {}): Promise<StaffMember[]> {
  return apiRequest<StaffMember[]>(`/api/staff${toQueryString(query)}`)
}

export function getStaffMember(id: string): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/api/staff/${id}`)
}

export function createStaff(request: CreateStaffRequest): Promise<StaffMember> {
  return apiRequest<StaffMember>('/api/staff', { method: 'POST', body: JSON.stringify(request) })
}

export function updateStaff(id: string, request: UpdateStaffRequest): Promise<StaffMember> {
  return apiRequest<StaffMember>(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deactivateStaff(id: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${id}/deactivate`, { method: 'PATCH' })
}

export async function setStaffPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) })
}

export function addRoleAssignment(staffId: string, request: AddRoleAssignmentRequest): Promise<RoleAssignment> {
  return apiRequest<RoleAssignment>(`/api/staff/${staffId}/roles`, { method: 'POST', body: JSON.stringify(request) })
}

/** A refusal while the role is in use is an `ApiError` with code `roleAssignment.inUse` and the
 *  blockers in `payload.errors` (`RoleAssignmentBlocker[]`). */
export async function removeRoleAssignment(staffId: string, assignmentId: string): Promise<void> {
  await apiRequest<void>(`/api/staff/${staffId}/roles/${assignmentId}`, { method: 'DELETE' })
}

/** The pickers: extra reviewers (`studentTaskId`), direction managers, standards controllers. */
export function searchStaff(search: string, query: StaffOptionsQuery = {}): Promise<StaffOption[]> {
  return apiRequest<StaffOption[]>(`/api/staff/options${toQueryString({ search, ...query })}`)
}
```

`src/api/workflowApi.ts`: delete `searchStaff` and the `StaffCapability` / `StaffOption` imports it used.

`src/api/authApi.ts`: add

```ts
/** Design 2026-09-27 (phase 12) §5: a new session acting in another role the user holds. */
export async function switchActingRole(role: StaffRole): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/acting-role', {
    method: 'POST',
    body: JSON.stringify({ role })
  })
}
```

   and add `StaffRole` to its type import.

`src/api/groupsApi.ts`: delete `getGroupReviewers`, `addGroupReviewer`, `removeGroupReviewer` and the `AddGroupReviewerRequest` / `GroupReviewer` imports.

`src/api/topicsApi.ts`: replace `getTopicSupervisors` with

```ts
/** Teachers a topic may name (phase 12 §4): for a student, those who cover their group; with a
 *  department, those who cover it; otherwise every active teacher. */
export function getTopicSupervisors(departmentId?: string): Promise<SupervisorOption[]> {
  return apiRequest<SupervisorOption[]>(`/api/topics/supervisors${departmentId ? `?departmentId=${departmentId}` : ''}`)
}
```

`src/api/directionsApi.ts`: in `toQueryString`, add `if (query.covered) params.set('covered', 'true')`.

- [ ] **Step 3: The signed-in user and the role switch**

`src/auth/context.ts`: add to `AuthContextValue`

```ts
  /** Design 2026-09-27 (phase 12) §5: act in another role the user holds. */
  switchRole: (role: StaffRole) => Promise<CurrentUser>
```

   and `StaffRole` to the type import.

`src/auth/AuthContext.tsx`: import `switchActingRole` from `../api/authApi` and add to the context value, after `completeSignIn`:

```ts
    switchRole: async (role) => {
      const result = await switchActingRole(role)
      setToken(result.token)
      setUser(result.user)
      return result.user
    },
```

- [ ] **Step 4: Navigation**

`src/components/layout/navigation.ts` (whole file):

```ts
import type { ActingRole, CurrentUser, StaffRole } from '../../api/types'
import type uk from '../../i18n/uk.json'

export type NavLabelKey = `nav.${keyof typeof uk.nav}`
export type Role = ActingRole

export type NavItem = {
  to: string
  labelKey: NavLabelKey
  /** Shows the number of documents waiting for the signed-in user. */
  badge?: 'documents'
}

/** Design 2026-09-27 (phase 12) §4.2: every staff role has its own dashboard at the same address;
 *  a staff member acting in no role starts on their documents. */
export const homeRouteByRole: Record<Role, string> = {
  Admin: '/admin/dashboard',
  Teacher: '/staff/dashboard',
  DirectionManager: '/staff/dashboard',
  StandardsController: '/staff/dashboard',
  Staff: '/documents',
  Student: '/student/dashboard'
}

export const navigationByRole: Record<Role, NavItem[]> = {
  Admin: [
    { to: '/admin/dashboard', labelKey: 'nav.dashboard' },
    { to: '/admin/faculties', labelKey: 'nav.faculties' },
    { to: '/admin/groups', labelKey: 'nav.groups' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/admin/students', labelKey: 'nav.students' },
    { to: '/admin/staff', labelKey: 'nav.staff' },
    { to: '/admin/topics', labelKey: 'nav.topics' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' },
    { to: '/admins', labelKey: 'nav.admins' },
    { to: '/admin/settings', labelKey: 'nav.settings' }
  ],
  Teacher: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/staff/topics', labelKey: 'nav.myTopics' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' },
    { to: '/archive', labelKey: 'nav.archive' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  DirectionManager: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/staff/directions', labelKey: 'nav.directions' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  StandardsController: [
    { to: '/staff/dashboard', labelKey: 'nav.dashboard' },
    { to: '/review', labelKey: 'nav.review' },
    { to: '/staff/groups', labelKey: 'nav.groups' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  Staff: [
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ],
  Student: [
    { to: '/student/dashboard', labelKey: 'nav.dashboard' },
    { to: '/student/topics', labelKey: 'nav.topics' },
    { to: '/student/tasks', labelKey: 'nav.myTasks' },
    { to: '/documents', labelKey: 'nav.documents', badge: 'documents' }
  ]
}

/** The three staff roles in their sign-in order (phase 12 §5). */
export const staffRoles: StaffRole[] = ['Teacher', 'DirectionManager', 'StandardsController']

/** The staff roles the user holds somewhere, in sign-in order. */
export function heldRoles(user: CurrentUser): StaffRole[] {
  return staffRoles.filter((role) => user.assignments.some((assignment) => assignment.role === role))
}
```

`src/components/layout/AppShell.tsx`: replace

```ts
    ? navigationByRole[user.role]
        .filter((item) => item.requires !== 'directionManager' || user.isDirectionManager)
        .map((item) => ({
```

with

```ts
    ? navigationByRole[user.role]
        .map((item) => ({
```

`src/auth/ProtectedRoute.tsx`: delete the local `routeByRole`; import `homeRouteByRole` and `type Role` from `../components/layout/navigation`; type the prop as `allowedRoles?: Role[]`; redirect with `homeRouteByRole[user.role]`.

`src/auth/RoleRedirect.tsx` and `src/pages/LoginPage.tsx`: delete the local `routeByRole` in each and use `homeRouteByRole[…]` from `../components/layout/navigation` instead.

- [ ] **Step 5: The role switcher**

`src/components/layout/UserMenu.tsx` (whole file):

```tsx
import { Menu, MenuButton, MenuHeading, MenuItem, MenuItems, MenuSection, MenuSeparator } from '@headlessui/react'
import { Check, ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useErrorMessage } from '../../api/useErrorMessage'
import { useAuth } from '../../auth/useAuth'
import { useToast } from '../ui/useToast'
import { heldRoles, homeRouteByRole } from './navigation'
import type { StaffRole } from '../../api/types'

/** Design 2026-09-27 (phase 12) §5: a staff member who holds more than one role - or holds one while
 *  acting in none - switches here. Each role keeps its own tabs, so a switch lands on its home page. */
export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout, switchRole } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  if (!user) {
    return null
  }

  const roles = user.accountRole === 'Staff' ? heldRoles(user) : []
  const canSwitch = roles.length > 1 || (roles.length === 1 && roles[0] !== user.role)

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const actAs = async (role: StaffRole) => {
    if (role === user.role) return
    try {
      const next = await switchRole(role)
      navigate(homeRouteByRole[next.role], { replace: true })
      toast.success(t('nav.roleSwitched', { role: t(`roles.${role}`) }))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm text-text-strong hover:bg-surface">
        <span className="text-right leading-tight">
          <span className="block font-medium">{user.firstName} {user.lastName}</span>
          <span className="block text-xs text-text-muted">{t(`roles.${user.role}`)}</span>
        </span>
        <ChevronDown className="size-4 text-text-muted" aria-hidden />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-50 mt-2 w-60 rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
      >
        {canSwitch && (
          <>
            <MenuSection>
              <MenuHeading className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                {t('nav.actingAs')}
              </MenuHeading>
              {roles.map((role) => (
                <MenuItem key={role}>
                  <button
                    type="button"
                    onClick={() => void actAs(role)}
                    aria-current={role === user.role ? 'true' : undefined}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-strong data-focus:bg-surface"
                  >
                    <Check className={role === user.role ? 'size-4 text-accent' : 'size-4 opacity-0'} aria-hidden />
                    {t(`roles.${role}`)}
                  </button>
                </MenuItem>
              ))}
            </MenuSection>
            <MenuSeparator className="my-1 h-px bg-border-subtle" />
          </>
        )}
        <MenuItem>
          <Link to="/account" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-strong data-focus:bg-surface">
            <UserRound className="size-4" aria-hidden />
            {t('nav.account')}
          </Link>
        </MenuItem>
        <MenuItem>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-strong data-focus:bg-surface">
            <LogOut className="size-4" aria-hidden />
            {t('nav.signOut')}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
```

`MenuSection`, `MenuHeading` and `MenuSeparator` are Headless UI 2 exports. If the installed version lacks them (`grep -n "MenuSection" node_modules/@headlessui/react/dist/index.d.ts`), render the heading as a plain `<p>` and the separator as a `<div>` with the same classes.

- [ ] **Step 6: Routes**

`src/App.tsx`:
- Import `StaffPage` from `./pages/StaffPage` and `StaffMemberPage` from `./pages/StaffMemberPage` instead of `TeachersPage` (Task 6 creates both files).
- Replace the four protected route blocks with:

```tsx
          <Route element={<ProtectedRoute allowedRoles={['Admin', 'Teacher', 'DirectionManager', 'StandardsController']} />}>
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="review/steps/:id" element={<ReviewStepPage />} />
            <Route path="groups/:groupId/progress" element={<GroupProgressPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Admin', 'Teacher']} />}>
            <Route path="task-templates" element={<TaskTemplatesPage />} />
            <Route path="archive" element={<ArchivePage />} />
            <Route path="archive/:id" element={<ArchivedGroupPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Admin']} />}>
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/staff" element={<StaffPage />} />
            <Route path="admin/staff/:id" element={<StaffMemberPage />} />
            <Route path="admin/students" element={<StudentsPage />} />
            <Route path="admin/faculties" element={<FacultiesPage />} />
            <Route path="admin/groups" element={<GroupsPage />} />
            <Route path="admin/groups/:groupId" element={<GroupDetailsPage />} />
            <Route path="admin/topics" element={<AdminTopicsPage />} />
            <Route path="admin/settings" element={<AdminSettingsPage />} />
            <Route path="admins" element={<AdminsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Teacher', 'DirectionManager', 'StandardsController']} />}>
            <Route path="staff/dashboard" element={<TeacherDashboardPage />} />
            <Route path="staff/groups" element={<TeacherGroupsPage />} />
            <Route path="staff/groups/:groupId" element={<GroupProgressPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Teacher']} />}>
            <Route path="staff/topics" element={<TeacherTopicsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['DirectionManager']} />}>
            <Route path="staff/directions" element={<DirectionsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['Student']} />}>
            <Route path="student/dashboard" element={<StudentDashboardPage />} />
            <Route path="student/topics" element={<StudentTopicsPage />} />
            <Route path="student/tasks" element={<StudentMyTasksPage />} />
            <Route path="student/tasks/:id" element={<StudentTaskDetailsPage />} />
          </Route>
```

   (`ProtectedRoute` sends anyone outside a block's roles to their own home page, so a switch between roles never strands the user on a page of the other role.)

- [ ] **Step 7: Translations**

Both files keep the same keys. In `src/i18n/uk.json`:

- `roles` becomes:

```json
  "roles": {
    "Admin": "Адміністратор",
    "Teacher": "Викладач",
    "DirectionManager": "Керівник напряму",
    "StandardsController": "Нормоконтролер",
    "Staff": "Без ролі",
    "Student": "Студент"
  },
```

- In `nav`: delete `"teachers"`; add `"staff": "Персонал"`, `"actingAs": "Діяти як"`, `"roleSwitched": "Тепер ви дієте як: {{role}}."`.
- Delete the whole `teachers` section and add a `staff` section in its place:

```json
  "staff": {
    "title": "Персонал",
    "add": "Додати працівника",
    "edit": "Редагувати працівника",
    "lastName": "Прізвище",
    "firstName": "Ім'я",
    "patronymic": "По батькові",
    "email": "Електронна пошта",
    "password": "Пароль",
    "setPassword": "Встановити пароль",
    "setPasswordFor": "Новий пароль для {{name}}",
    "passwordUpdated": "Пароль для {{name}} оновлено.",
    "deactivate": "Деактивувати",
    "deactivateConfirm": "Деактивувати обліковий запис {{name}}?",
    "noStaff": "Працівників ще немає.",
    "roles": "Ролі",
    "noRoles": "Без ролей",
    "openRoles": "Ролі та межі",
    "backToList": "До списку персоналу",
    "rolesTitle": "Ролі",
    "rolesHint": "Роль діє на факультеті, кафедрі чи в групі й охоплює все, що до них належить.",
    "noRolesHint": "Поки в працівника немає ролі, він бачить лише «Обліковий запис» і «Документи».",
    "addRole": "Додати роль",
    "role": "Роль",
    "scopeKind": "Межі",
    "scopeKinds": {
      "Faculty": "Факультет",
      "Department": "Кафедра",
      "Group": "Група"
    },
    "place": "Де",
    "faculty": "Факультет",
    "department": "Кафедра",
    "group": "Група",
    "addedAt": "Додано",
    "removeRole": "Прибрати роль",
    "removeRoleConfirm": "Прибрати роль «{{role}}» ({{place}})?",
    "roleAdded": "Роль додано.",
    "roleRemoved": "Роль прибрано.",
    "inUseTitle": "Роль використовується",
    "inUseIntro": "Спершу передайте іншим:",
    "blockers": {
      "supervisedStudent": "керівництво студентом",
      "supervisedTopic": "тема",
      "panelSeat": "рецензування етапу",
      "managedDirection": "напрям",
      "controlledStep": "нормоконтроль етапу"
    },
    "managerScopeHint": "Керівника напряму призначають на факультет або кафедру.",
    "status": "Стан"
  },
```

- In `dashboard`: `"teachers"` becomes `"Персонал"`; add `"managerTitle": "Панель керівника напряму"` and `"controllerTitle": "Панель нормоконтролера"`.
- In `students`: add `"currentSupervisor": "{{name}} (поточний керівник)"` and `"supervisorAfterGroup": "Спершу оберіть групу: керівника обирають серед викладачів, чия роль її охоплює."`.
- In `directions`: `"noManagers"` becomes `"Ще ніхто не має ролі керівника напряму. Призначте її на сторінці «Персонал»."`.
- In `groups`: delete `reviewersTitle`, `reviewer`, `assignReviewer`, `removeReviewerConfirm`, `noReviewers`. In `groupDetails`: delete `reviewers`. In `archive`: delete `reviewers`.
- In `errors`:
  - delete `teacher` and `reviewer`;
  - `staff` becomes:

```json
    "staff": {
      "notFound": "Працівника не знайдено.",
      "managesDirections": "Цей працівник керує напрямом. Спочатку передайте напрям іншому керівнику.",
      "controlsSteps": "Цей працівник є нормоконтролером етапу групи. Спочатку призначте іншого."
    },
```

  - add:

```json
    "roleAssignment": {
      "scopeInvalid": "Обраного факультету, кафедри чи групи не існує.",
      "scopeNotAllowed": "Керівника напряму призначають на факультет або кафедру.",
      "exists": "Ця людина вже має цю роль тут.",
      "notFound": "Цю роль не знайдено.",
      "inUse": "Роль використовується. Спершу передайте іншим те, що в списку."
    },
    "actingRole": {
      "notHeld": "У вас немає цієї ролі."
    },
    "scope": {
      "notCovered": "Це поза межами факультету, кафедри чи групи вашої ролі."
    },
```

  - change: `topic.supervisorInvalid` → `"Керівником може бути лише активний викладач, чия роль охоплює кафедру теми."`; `proposal.teacherInvalid` → `"Оберіть активного викладача, чия роль охоплює вашу групу."`; `student.supervisorInvalid` → `"Керівником може бути лише активний викладач, чия роль охоплює групу студента."`; `direction.managerInvalid` → `"Оберіть активного керівника напряму, чия роль охоплює кафедру."`; `groupTask.controllerInvalid` → `"Оберіть активного нормоконтролера, чия роль охоплює групу."`; `panel.reviewerInvalid` → `"Оберіть адміністратора або активного викладача, чия роль охоплює групу студента."`.

In `src/i18n/en.json`, the same keys:

- `roles`:

```json
  "roles": {
    "Admin": "Administrator",
    "Teacher": "Teacher",
    "DirectionManager": "Direction manager",
    "StandardsController": "Standards controller",
    "Staff": "No role",
    "Student": "Student"
  },
```

- `nav`: delete `"teachers"`; add `"staff": "Staff"`, `"actingAs": "Act as"`, `"roleSwitched": "You now act as: {{role}}."`.
- `staff` (replacing `teachers`):

```json
  "staff": {
    "title": "Staff",
    "add": "Add staff member",
    "edit": "Edit staff member",
    "lastName": "Last name",
    "firstName": "First name",
    "patronymic": "Patronymic",
    "email": "Email",
    "password": "Password",
    "setPassword": "Set password",
    "setPasswordFor": "New password for {{name}}",
    "passwordUpdated": "Password updated for {{name}}.",
    "deactivate": "Deactivate",
    "deactivateConfirm": "Deactivate the account of {{name}}?",
    "noStaff": "No staff yet.",
    "roles": "Roles",
    "noRoles": "No roles",
    "openRoles": "Roles and scope",
    "backToList": "Back to staff",
    "rolesTitle": "Roles",
    "rolesHint": "A role applies to a faculty, a department or a group, and covers everything in it.",
    "noRolesHint": "Until they hold a role, a staff member sees only Account and Documents.",
    "addRole": "Add role",
    "role": "Role",
    "scopeKind": "Scope",
    "scopeKinds": {
      "Faculty": "Faculty",
      "Department": "Department",
      "Group": "Group"
    },
    "place": "Where",
    "faculty": "Faculty",
    "department": "Department",
    "group": "Group",
    "addedAt": "Added",
    "removeRole": "Remove role",
    "removeRoleConfirm": "Remove the role \"{{role}}\" ({{place}})?",
    "roleAdded": "Role added.",
    "roleRemoved": "Role removed.",
    "inUseTitle": "The role is in use",
    "inUseIntro": "Hand these over first:",
    "blockers": {
      "supervisedStudent": "supervising a student",
      "supervisedTopic": "a topic",
      "panelSeat": "reviewing a step",
      "managedDirection": "a direction",
      "controlledStep": "standards control of a step"
    },
    "managerScopeHint": "A direction manager is assigned to a faculty or a department.",
    "status": "Status"
  },
```

- `dashboard`: `"teachers": "Staff"`; `"managerTitle": "Direction manager dashboard"`; `"controllerTitle": "Standards controller dashboard"`.
- `students`: `"currentSupervisor": "{{name}} (current supervisor)"`, `"supervisorAfterGroup": "Choose a group first: the supervisor is one of the teachers whose role covers it."`.
- `directions.noManagers`: `"Nobody holds the direction manager role yet. Assign it on the Staff page."`.
- The same deletions in `groups`, `groupDetails`, `archive` and `errors` as in Ukrainian.
- `errors.staff`:

```json
    "staff": {
      "notFound": "Staff member not found.",
      "managesDirections": "This staff member manages a direction. Hand it to another manager first.",
      "controlsSteps": "This staff member is the standards controller of a group step. Assign someone else first."
    },
```

- add:

```json
    "roleAssignment": {
      "scopeInvalid": "The selected faculty, department or group does not exist.",
      "scopeNotAllowed": "A direction manager is assigned to a faculty or a department.",
      "exists": "This person already holds this role there.",
      "notFound": "Role assignment not found.",
      "inUse": "The role is in use. Hand over what is listed first."
    },
    "actingRole": {
      "notHeld": "You do not hold this role."
    },
    "scope": {
      "notCovered": "This is outside the faculty, department or group your role covers."
    },
```

- change: `topic.supervisorInvalid` → `"The supervisor must be an active teacher whose role covers the topic's department."`; `proposal.teacherInvalid` → `"Choose an active teacher whose role covers your group."`; `student.supervisorInvalid` → `"The supervisor must be an active teacher whose role covers the student's group."`; `direction.managerInvalid` → `"Choose an active direction manager whose role covers the department."`; `groupTask.controllerInvalid` → `"Choose an active standards controller whose role covers the group."`; `panel.reviewerInvalid` → `"Choose an administrator or an active teacher whose role covers the student's group."`.

- [ ] **Step 8: Type check and translations**

```bash
cd frontend/diploma-tracker-web && npm run i18n:check
```

Expected: the two files match.

```bash
cd frontend/diploma-tracker-web && npx tsc -b
```

Expected: errors only in the files Task 6 changes — `App.tsx` (the two new pages do not exist yet), `pages/TeachersPage.tsx`, `StudentsPage.tsx`, `GroupsPage.tsx`, `GroupDetailsPage.tsx`, `AdminTopicsPage.tsx`, `DirectionsPage.tsx`, `ArchivedGroupPage.tsx`, `components/workflow/AddReviewerDialog.tsx`, `StandardsControllerDialog.tsx`, `components/topics/DirectionsSection.tsx`, `components/documents/TemplateEditorModal.tsx` (only if it breaks on `getTopicSupervisors`). Anything else is this task's to fix.

---

### Task 6: Pages

The Staff page and a person's roles page, and every page that named teachers, group reviewers or the two flags. Ends with the full frontend gate.

**Files:**
- Rename and rework: `frontend/diploma-tracker-web/src/pages/TeachersPage.tsx` → `pages/StaffPage.tsx` (`git mv`)
- Create: `frontend/diploma-tracker-web/src/pages/StaffMemberPage.tsx`, `src/components/staff/RoleBadges.tsx`, `src/components/staff/AddRoleModal.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/GroupsPage.tsx`, `GroupDetailsPage.tsx`, `StudentsPage.tsx`, `AdminTopicsPage.tsx`, `DirectionsPage.tsx`, `TeacherTopicsPage.tsx`, `TeacherDashboardPage.tsx`, `TeacherGroupsPage.tsx`, `GroupProgressPage.tsx`, `AdminDashboardPage.tsx`, `ArchivedGroupPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/workflow/AddReviewerDialog.tsx`, `StandardsControllerDialog.tsx`, `src/components/topics/DirectionsSection.tsx`, `src/components/documents/TemplatesSection.tsx`

**Interfaces:**
- Consumes (Task 5): `staffApi.*`, `searchStaff(search, query)`, `getTopicSupervisors(departmentId?)`, `getDirections({ covered })`, `heldRoles`, `staffRoles`, `homeRouteByRole`, the `staff.*`, `roles.*`, `students.*` and `dashboard.*` keys.
- Produces: `RoleBadges({ assignments }: { assignments: RoleAssignment[] })` and `AddRoleModal({ staffId, onClose, onAdded })` in `src/components/staff/`.

- [ ] **Step 1: Shared staff components**

`src/components/staff/RoleBadges.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import type { RoleAssignment } from '../../api/types'

/** A person's roles as badges, "Викладач · ФІОТ / ІПЗ" (design 2026-09-27, phase 12, §6). */
export function RoleBadges({ assignments }: { assignments: RoleAssignment[] }) {
  const { t } = useTranslation()

  if (assignments.length === 0) {
    return <span className="text-sm text-text-muted">{t('staff.noRoles')}</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {assignments.map((assignment) => (
        <Badge key={assignment.id} tone="info">
          {t(`roles.${assignment.role}`)} · {assignment.scopePath}
        </Badge>
      ))}
    </div>
  )
}
```

`src/components/staff/AddRoleModal.tsx` (rendered by its parent only while open, so its state starts fresh each time):

```tsx
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../../api/departmentsApi'
import { getFaculties } from '../../api/facultiesApi'
import { getGroups } from '../../api/groupsApi'
import { addRoleAssignment } from '../../api/staffApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { staffRoles } from '../layout/navigation'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select, type SelectOption } from '../ui/Select'
import type { Department, Faculty, Group, RoleAssignment, RoleScopeKind, StaffRole } from '../../api/types'

type AddRoleModalProps = {
  staffId: string
  onClose: () => void
  onAdded: (assignment: RoleAssignment) => void
}

/** Design 2026-09-27 (phase 12) §6: a role and the faculty, department or group it applies to, picked
 *  from the top down. A direction manager is never assigned to a group. */
export function AddRoleModal({ staffId, onClose, onAdded }: AddRoleModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [role, setRole] = useState<StaffRole>('Teacher')
  const [scopeKind, setScopeKind] = useState<RoleScopeKind>('Department')
  const [facultyId, setFacultyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getFaculties(), getDepartments(), getGroups()])
      .then(([facultyData, departmentData, groupData]) => {
        if (cancelled) return
        setFaculties(facultyData)
        setDepartments(departmentData)
        setGroups(groupData)
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roleOptions: SelectOption[] = staffRoles.map((value) => ({ value, label: t(`roles.${value}`) }))
  const kinds: RoleScopeKind[] = role === 'DirectionManager' ? ['Faculty', 'Department'] : ['Faculty', 'Department', 'Group']
  const facultyOptions: SelectOption[] = faculties.map((f) => ({ value: f.id, label: f.name }))
  const departmentOptions: SelectOption[] = useMemo(
    () => departments.filter((d) => d.facultyId === facultyId).map((d) => ({ value: d.id, label: d.name })),
    [departments, facultyId]
  )
  const groupOptions: SelectOption[] = useMemo(
    () => groups.filter((g) => g.departmentId === departmentId).map((g) => ({ value: g.id, label: `${g.code} (${g.academicYear})` })),
    [groups, departmentId]
  )
  const scopeId = scopeKind === 'Faculty' ? facultyId : scopeKind === 'Department' ? departmentId : groupId

  const changeRole = (value: string) => {
    const next = value as StaffRole
    setRole(next)
    if (next === 'DirectionManager' && scopeKind === 'Group') setScopeKind('Department')
  }

  const changeFaculty = (value: string) => {
    setFacultyId(value)
    setDepartmentId('')
    setGroupId('')
  }

  const changeDepartment = (value: string) => {
    setDepartmentId(value)
    setGroupId('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!scopeId) return
    setIsSaving(true)
    setError('')
    try {
      onAdded(await addRoleAssignment(staffId, { role, scopeKind, scopeId }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!isSaving) onClose() }}
      title={t('staff.addRole')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="add-role-form" type="submit" loading={isSaving} disabled={!scopeId}>{t('common.save')}</Button>
        </>
      }
    >
      <form id="add-role-form" onSubmit={submit} className="flex flex-col gap-4">
        <Select label={t('staff.role')} value={role} onChange={changeRole} options={roleOptions} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-heading">{t('staff.scopeKind')}</span>
          <SegmentedControl
            ariaLabel={t('staff.scopeKind')}
            value={scopeKind}
            onChange={(value) => setScopeKind(value as RoleScopeKind)}
            options={kinds.map((kind) => ({ value: kind, label: t(`staff.scopeKinds.${kind}`) }))}
          />
          {role === 'DirectionManager' && <p className="text-xs text-text-muted">{t('staff.managerScopeHint')}</p>}
        </div>
        <Select label={t('staff.faculty')} value={facultyId} onChange={changeFaculty} options={facultyOptions} placeholder={t('common.select')} />
        {scopeKind !== 'Faculty' && (
          <Select label={t('staff.department')} value={departmentId} onChange={changeDepartment} options={departmentOptions}
            placeholder={t('common.select')} disabled={!facultyId} />
        )}
        {scopeKind === 'Group' && (
          <Select label={t('staff.group')} value={groupId} onChange={setGroupId} options={groupOptions}
            placeholder={t('common.select')} disabled={!departmentId} />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  )
}
```

If `getDepartments`' signature differs (it takes an optional `facultyId`), call it with no argument to get every department.

- [ ] **Step 2: The Staff page**

`git mv src/pages/TeachersPage.tsx src/pages/StaffPage.tsx`, then in `StaffPage.tsx`:
- Export `StaffPage`; use `getStaff`, `createStaff`, `updateStaff`, `deactivateStaff`, `setStaffPassword` from `../api/staffApi` and the `StaffMember` type; rename the local state and handlers from *teacher* to *staff member* wording.
- The form state drops `isDirectionManager` / `isStandardsController`; the form drops the *Responsibilities* fieldset and the `Checkbox` import.
- Columns: *Last name* (full name as today), *Roles* (`<RoleBadges assignments={member.assignments} />`), *Email*, *Status*, *Actions*. Actions: edit, **roles** (`Button variant="ghost" size="sm" icon={ShieldCheck}` with `aria-label={t('staff.openRoles')}`, navigating to `/admin/staff/${member.id}`; enabled for inactive accounts too, so their roles stay readable), set password, deactivate.
- Clicking a row outside the action buttons also opens `/admin/staff/:id` (use the `DataTable`'s `onRowClick` if it has one, as `TeacherGroupsPage` does).
- Every `teachers.*` key becomes the matching `staff.*` key: `title`, `add` (was `addTeacher`), `edit` (was `editTeacher`), `lastName`, `firstName`, `patronymic`, `email`, `password`, `setPassword`, `setPasswordFor`, `passwordUpdated`, `deactivate`, `deactivateConfirm`, `noStaff` (was `noTeachers`), `roles` (was `responsibilities`).

- [ ] **Step 3: A person's roles**

`src/pages/StaffMemberPage.tsx` — route `/admin/staff/:id`:
- Loads `getStaffMember(id)`. While loading: `Spinner`. A load error shows in the page body.
- `PageHeader` with the full name as title, a back link to `/admin/staff` labelled `staff.backToList` (placed top-left the way `DocumentPage`'s back link is), and an *Add role* button (`staff.addRole`, `icon={Plus}`) in `actions`.
- A `Card` with the email and the active/inactive badge (`common.active` / `common.inactive`, label `staff.status`).
- A `Card` titled `staff.rolesTitle`, hint paragraph `staff.rolesHint` under its title, and a `DataTable` of `member.assignments` with columns: *Role* (`t('roles.' + role)`), *Scope* (`t('staff.scopeKinds.' + scopeKind)`), *Where* (`scopeName`, with `scopePath` as muted second line), *Added* (date, the same `Intl.DateTimeFormat` pattern `TeacherTopicsPage` uses), and a remove action (`Trash2`, `aria-label={t('staff.removeRole')}`). Empty state: `staff.noRolesHint`.
- *Add role* renders `<AddRoleModal staffId={member.id} onClose={…} onAdded={…} />` only while open; `onAdded` closes it, shows the `staff.roleAdded` toast and reloads the member.
- Removing: a `ConfirmDialog` titled `staff.removeRole` with `staff.removeRoleConfirm` (`role`: the translated role, `place`: `scopePath`). On confirm call `removeRoleAssignment`. On success: close, `staff.roleRemoved` toast, reload. On an `ApiError` whose `code` is `roleAssignment.inUse`, keep the dialog open with `hideConfirm`, title `staff.inUseTitle`, and as `message` the `staff.inUseIntro` sentence followed by a list of `(err.payload as { errors?: RoleAssignmentBlocker[] }).errors`, each item `t('staff.blockers.' + kind) + ': ' + label`. Any other error: a toast with `errorMessage(err)`.

- [ ] **Step 4: Group pages without reviewers**

- `GroupsPage.tsx`: delete the whole group-reviewers card and everything only it used (the `reviewers`, `selectedReviewerId`, `isLoadingReviewers`, `isAddingReviewer`, `removingReviewer`, `isRemovingReviewer` state, `loadReviewers`, the effect that loads them, `handleAddReviewer`, `removeReviewer`, `reviewerOptions`, `availableTeachers`/`activeTeachers`, `reviewerColumns`, the reviewer `ConfirmDialog`), the `getTeachers` call and `teachers` state, and the now-unused imports (`addGroupReviewer`, `getGroupReviewers`, `removeGroupReviewer`, `GroupReviewer`, `Teacher`, and any UI component left unused). If the page selected a group only for the reviewer card, drop that selection too.
- `GroupDetailsPage.tsx`: the same for its *Reviewers* card (`reviewers` state and loading, `teachers`, `availableTeachers`, `reviewerOptions`, `handleAssignReviewer`, `removeReviewer`, `reviewerColumns`, the remove `ConfirmDialog`, and the `getGroupReviewers` / `getTeachers` calls in the load `Promise.all` — keep the other four calls and their order of assignment). Update the comment that lists what the page loads.

- [ ] **Step 5: Supervisors within scope on the administrator's forms**

- `StudentsPage.tsx`:
  - Replace `teachers` / `getTeachers` with a `supervisors: StaffMember[]` state loaded by `getStaff({ role: 'Teacher', groupId: studentForm.groupId })` in an effect that runs while the student modal is open and `studentForm.groupId` is set; with no group it is an empty list. Drop `getTeachers` from the page's initial `Promise.all`.
  - `supervisorOptions` is built from `supervisors` (every one returned is active). `editSupervisorOptions` keeps the student's current supervisor when they are not in the list, labelled `students.currentSupervisor` (was `students.inactiveSupervisor`): the server keeps a current supervisor across a group move (design phase 12 §4).
  - While no group is chosen, the supervisor `Select` is disabled with the hint `students.supervisorAfterGroup` (unless `topicControlsSupervisor` already supplies its own hint).
- `AdminTopicsPage.tsx`: replace `getTeachers()` with `getStaff({ role: 'Teacher' })` and `Teacher` with `StaffMember`. The supervisor filter keeps listing everyone returned; the topic form's `supervisors` prop keeps filtering `isActive`. The server refuses a supervisor who does not cover the direction's department (`topic.supervisorInvalid`), and the form shows that message.

- [ ] **Step 6: The direction manager's page**

`DirectionsPage.tsx` (reached only while acting as direction manager):
- Delete the `user && !user.isDirectionManager` redirect.
- Supervisors: stop loading `getTopicSupervisors()` with the topics. When the topic form opens — `onAddTopic(direction)` and the edit button — load `getTopicSupervisors(departmentId)` for that direction's department (`direction.departmentId`, or `topic.departmentId` on an edit) into `supervisors` before opening the form; a failure is a toast.
- Add a `Card` titled `topics.requestsTitle` above the topics card, holding `<TopicRequestsTable rows={requests} loading={isLoading} onChanged={handleTopicApproved} />`, where `requests` is loaded with `getReservationsForDecision('Pending')` in `loadTopics` (acting as direction manager this returns the requests in the caller's directions). `handleTopicApproved` also reloads it.

- [ ] **Step 7: The teacher's topics**

`TeacherTopicsPage.tsx` (reached only while acting as teacher): load `getDirections({ covered: true })` instead of `getDirections()`, so the topic form offers only directions of departments the teacher's role covers. When the list is empty (a teacher assigned to a group only), hide the create-topic button; the requests and approved-students cards stay.

- [ ] **Step 8: The pickers**

- `AddReviewerDialog.tsx`: import `searchStaff` from `../../api/staffApi` and call `searchStaff(search.trim(), { studentTaskId: step.id })`.
- `StandardsControllerDialog.tsx`: import from `../../api/staffApi` and call `searchStaff('', { role: 'StandardsController', groupId: groupTask.groupId })`. The current controller, if the list lacks them, stays selectable as today.
- `DirectionsSection.tsx`: import from `../../api/staffApi` and call `searchStaff('', { role: 'DirectionManager' })`; in the manager `Select`, an empty list shows `directions.noManagers` as today.

- [ ] **Step 9: Dashboards, links, templates and the archive**

- `TeacherDashboardPage.tsx`: the title follows the acting role — `dashboard.managerTitle` for `DirectionManager`, `dashboard.controllerTitle` for `StandardsController`, `dashboard.teacherTitle` otherwise (read `user.role` from `useAuth`). The groups tile navigates to `/staff/groups`. Hide the *supervised students* card while acting as standards controller (it is always empty for that role).
- `TeacherGroupsPage.tsx`: rows navigate to `/staff/groups/${group.id}`.
- `GroupProgressPage.tsx`: `backToGroupsPath` is `'/admin/groups'` for an administrator and `'/staff/groups'` otherwise.
- `AdminDashboardPage.tsx`: the staff tile navigates to `/admin/staff`.
- `TemplatesSection.tsx`: `canCreate` is `user?.role === 'Admin' || user?.accountRole === 'Staff'` (templates are every staff member's, whatever role they act in).
- `ArchivedGroupPage.tsx`: delete the paragraph that prints `details.reviewerNames`.

- [ ] **Step 10: Leftovers and the frontend gate**

```bash
cd frontend/diploma-tracker-web && grep -rn "teachersApi\|isDirectionManager\|isStandardsController\|GroupReviewer\|reviewerNames\|/teacher/\|'teachers\.\|nav\.teachers\|StaffCapability" src
```

Expected: no output.

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: no type errors; lint 0 errors, 0 warnings; i18n matching; a successful build.

---

### Task 7: Schema, verification, review, records and the commit

**Files:**
- Delete and regenerate: `backend/DiplomaTracker.Api/Migrations/*`
- Modify: `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md`

- [ ] **Step 1: Ask before the database is dropped**

**Stop here and ask the owner.** This task drops and recreates the local database, and they want to be asked first. The other machine will have to do the same when it next pulls. Do not run Step 2 until they say yes.

While asking, say what will be lost: every row in `DiplomaTrackerDb` that the seeder does not recreate. The demo data can be reloaded afterwards with `node .superpowers/demo/seed-demo.mjs`.

- [ ] **Step 2: Drop the database**

The API must not be running. Ask the controller to stop it, then confirm:

```bash
netstat -ano | grep ":5000 .*LISTEN"
```

Expected: no output.

```bash
cd backend && dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

- [ ] **Step 3: Regenerate the single migration**

```bash
rm -rf backend/DiplomaTracker.Api/Migrations
```

```bash
cd backend && dotnet ef migrations add InitialCreate --project DiplomaTracker.Api -- --environment Development
```

- [ ] **Step 4: Read the migration before trusting it**

```bash
grep -n "\"RoleAssignments\"\|IX_RoleAssignments_UserId_Role_ScopeKind_ScopeId\|IX_RoleAssignments_ScopeKind_ScopeId\|IX_ArchivedFiles_SupervisorId\|IX_ArchivedReviews_SupervisorId" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected:
- the `RoleAssignments` table is created;
- `IX_RoleAssignments_UserId_Role_ScopeKind_ScopeId` is created with `unique: true`;
- `IX_RoleAssignments_ScopeKind_ScopeId`, `IX_ArchivedFiles_SupervisorId` and `IX_ArchivedReviews_SupervisorId` are created.

```bash
grep -n "GroupReviewers\|ArchivedGroupReviewers\|IsDirectionManager\|IsStandardsController" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected: no output.

```bash
grep -n "onDelete: ReferentialAction.Cascade" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs | grep -i "RoleAssignments"
```

Expected: no output. Both foreign keys of `RoleAssignments` are `Restrict`, which the migration writes as `NoAction`.

- [ ] **Step 5: Start and settle the model**

Ask the controller to start the API. It applies the migration and re-seeds, including the seeded staff member's three faculty roles and the `Software Engineering` direction. Then:

```bash
cd backend && dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api -- --environment Development
```

Expected: `No changes have been made to the model since the last migration.`

- [ ] **Step 6: Full verification**

Record the actual output of each command, not just "passed".

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: every test passes.

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: no type errors; lint 0/0; i18n matching; a successful build.

```bash
node .superpowers/checks/scoped-roles-check.mjs
```

Expected: `49/49 checks passed` and `Cleanup: nothing left behind.`

```bash
for script in directions-approval-check topics-check review-panels-check workflow-check hardening-check document-routing-check templates-check refinements-check onboarding-check design-system-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: every script fully passing and ending with `Cleanup: nothing left behind.` (`directions-approval-check` stays at 70 checks.)

```bash
node .superpowers/demo/seed-demo.mjs
```

Expected: the run completes and lists the four staff members with their roles.

- [ ] **Step 7: Whole-phase review**

Dispatch one `code-reviewer` over the whole phase (`git diff de264f6`, excluding `Migrations/`), with the spec and this plan as references. Ask it to check in particular:
- that `SessionStateValidator` refuses every claim an account cannot carry, and a staff role the account no longer holds;
- that every `[Authorize(Roles = …)]` list matches spec §4.2 (which role may reach which endpoint), and that no endpoint is left with a literal `"Teacher"`;
- that `AccessScope`, `WaitingForCallerQuery`, `BuildReviewStudentProjection`'s `CanOpen` and `ReviewPanel.ActsFor` agree on which acting role holds which seat;
- that every place that takes work on checks coverage (topic create and edit, proposal, the student form's supervisor, extra reviewer, standards controller, direction create, manager change, direction move), and that nothing already held is re-checked;
- that `RoleAssignmentUsage` finds every kind of work spec §6 lists, and honours coverage from the person's other assignments of the same role;
- the O1 refresh in `ReservationService.CompleteAsync` (read before release, applied through `adjust`, part of the caller's save);
- that the archive shows an acting teacher only the rows stamped with their id, downloads included.

Fix the Critical and Important findings in one wave, re-run Step 6's scripts, and have the reviewer re-check the fixes once. List the test gaps it names under the phase's `test-backlog.md` section, and record deferred Minors in the log line of Step 8.

- [ ] **Step 8: Project records**

`docs/superpowers/PROJECT_MEMORY.md`:
- **Status table:** phase 12's row becomes `Done — commit <hash> (branch phase11-12)` with `2026-09-28-scoped-staff-roles.md` in its last column.
- **Gotchas:**
  - Replace the gotcha that begins "**Direction manager and standards controller are flags on teacher accounts**" with: "**Staff roles are assignments, and a session acts in one.** `AppUser.Role` is `Admin`, `Staff` or `Student`; a staff member's roles are `RoleAssignment` rows (role + faculty/department/group). The token's role claim is the acting role (`Teacher`, `DirectionManager`, `StandardsController`, or `Staff` for none), switched with `POST /api/auth/acting-role`. `SessionStateValidator` refuses a staff claim the account no longer holds anywhere. Every visibility rule, queue, panel seat and topic-request seat keys on the acting role; `UserContext.IsStaff` means any staff account."
  - Add: "**Coverage is checked when work is taken on, never when held work is decided.** `RoleCoverage.CoversGroupAsync` / `CoversDepartmentAsync` (active staff only; a faculty covers its departments and groups, a department its groups). A caller outside their own scope gets `scope.notCovered`; naming someone who does not cover gets the field's `…Invalid` code. Removing an assignment is refused (`roleAssignment.inUse`, with `errors: [{ kind, label }]`) while work in its scope depends on it and no other assignment of the same role covers it. Deleting a place deletes its assignments."
  - Replace the gotcha that begins "**Visibility** for teachers goes through `IAccessScope`" with: "**Visibility** for staff goes through `IAccessScope`, by acting role: a supervisor (teacher) and the manager of a student's topic's direction open the student in full (`ReviewableStudents`); an extra reviewer and a standards controller open only their step. A staff member's groups are the groups of the students they work with (`ReviewOverviewStudents`). New group- or student-scoped queries must use it. A hidden resource answers exactly like a missing one — same status, code and message."
  - Replace the gotcha that begins "**A teacher's dashboard groups are**" with: "**A staff dashboard's groups are `VisibleGroups` for the acting role, and each row counts only the students the caller works with in that role.** Every group view splits *My students* from *Others*; others never open."
  - In the gotcha that begins "**\"Your decision\" means a seat on the panel.**", delete "and a group reviewer's watch access".
  - Replace the gotcha that begins "**`giveTopic` in the check scripts needs a direction-manager teacher**" with: "**Check scripts create staff with `makeStaff` and roles with `grantRoles`** (`checkCleanup.mjs`); both undo in the late phase. `giveTopic` gives the given teacher the teacher and direction-manager roles for the department first. Scripts act in another role with `actAs`."
  - Add: "**The archive is read by the supervisors recorded in it.** `ArchivedFile.SupervisorId` / `ArchivedReview.SupervisorId` are the student's supervisor at archiving time; an acting teacher sees only those rows. There are no group reviewers any more."
- **Log:** add one dated line summarising phase 12: the checks per script and in total, the review outcome, and that O1 (from the phase 11 log) is fixed. Also add to the phase 11 entry's parked list, after "O1 (…)", the words "— fixed in phase 12".

`docs/superpowers/test-backlog.md`: add

```markdown
## Phase 12 — Scoped staff roles

- `RoleCoverage`: a faculty assignment covers its departments and groups, a department assignment its groups, a group assignment only itself; a group assignment never covers a department; an inactive account covers nothing.
- `RoleAssignmentUsage.FindBlockersAsync`: each kind of work blocks in its own role only; work outside the scope does not block; another assignment of the same role covering the place frees it; archived students and approved steps do not block.
- `StaffService.AddAssignmentAsync`: role and scope kind by name only; a direction manager at group level refused; an unknown place refused; a duplicate refused.
- `AuthService`: the first held role in sign-in order; none gives `Staff`; switching to a role not held refused; a non-staff account cannot switch.
- `SessionStateValidator`: a staff claim that is not a staff role refused; a withdrawn role refused; `Staff` always accepted for a staff account.
- `ReviewPanel.SeatFor` / `ActsFor`: a seat is decided only in its role; an administrator may decide an extra seat.
- `TopicApprovalPanel.SeatsOf`: the direction seat only while acting as direction manager, the supervision seat only while acting as teacher.
- `AccessScope`: each acting role's students, groups and steps; a standards controller opens only the steps of the group steps they control.
- `ReservationService.CompleteAsync`: a replacement refreshes the student's unfinished steps and approves a Submitted step whose new panel is satisfied; a first topic touches nothing.
- `ArchiveService`: rows stamped with the supervisor; an acting teacher sees only their rows, counts included.
```

- [ ] **Step 9: Commit**

```bash
git add -A
```

```bash
git status --short
```

Check the list:
- `.superpowers/checks/scoped-roles-check.mjs`, `frontend/diploma-tracker-web/src/pages/StaffPage.tsx` (renamed) and `StaffMemberPage.tsx` must appear;
- `.superpowers/sdd/`, `App_Data/`, `bin/`, `obj/`, `PROJECT_PAPER.md` and `frontend/diploma-tracker-web/README.md` must not.

```bash
git commit -m "Implement scoped staff roles"
```

```bash
git log --oneline -3
```

Expected: `Implement scoped staff roles` on top, followed by the planning commit.

- [ ] **Step 10: Report and stop**

Report to the owner:
- the verification numbers from Step 6, the review outcome and the commit hash;
- that **the other machine must drop its own database** when it next pulls;
- a plain-language list for manual testing, per role:
  - **Administrator:**
    - *Staff* (was *Teachers*): each person's roles as badges; open a person to add a role (role, then faculty / department / group) or remove one. Removing a role in use is refused and lists what to hand over first.
    - *Groups*: no *Reviewers* section; assigning steps and changing their dates stays here and only here.
    - The student form lists as supervisors only the teachers whose role covers the chosen group.
  - **Any staff member with more than one role:** the user menu has *Діяти як*; switching changes the tabs and the dashboard.
  - **Teacher:** *My topics* offers only directions of covered departments; the review queue and the groups are those of their own students and panel seats; *Archive* shows only their former students' work.
  - **Direction manager:** *Directions* now also holds the topic requests of their directions; their review queue holds the direction-manager seats.
  - **Standards controller:** Dashboard, Review, Groups, Documents only.
  - **Staff member with no role:** only Documents and Account.
  - **Student:** the proposal form offers only teachers who cover their group.
  - **O1:** when an administrator replaces a student's topic and the new one completes, a submitted step waiting only for a seat that no longer exists is approved at once.
- The demo accounts to use: `.superpowers/demo/README.md`, *Walkthrough (phase 12)*.

Then stop. The owner tests by hand and reports defects as follow-up commits. Phase 7 (document preview and commenting) is the last increment after this one.

---

## Plan self-review

- **Spec coverage:**
  - §2 decisions and §3 model: Task 1 Steps 1–2 (entities, mapping), 4 (coverage), 12 (seeds, deletion of places with their assignments).
  - §4 roles within scope, *When coverage is checked*: topics and proposals in Task 3 Steps 1–2; the student form in Task 3 Step 3; extra reviewers and standards controllers in Task 2 Step 4 (3) and Task 1 Step 11; directions in Task 1 Step 11.
  - §4.1 group reviewers removed: Task 2 Steps 1, 5 (group-step writes), 6 (archive), 7 (dashboards), 10 (comments); scripts and demo in Task 4; interface in Task 6 Step 4.
  - §4.2 what each role sees: Task 2 Steps 2–4 and 9 (endpoint roles); navigation in Task 5 Step 4; dashboards in Task 2 Step 7 and Task 6 Step 9.
  - §5 acting role: Task 1 Step 10 (sign-in, switch, session check); Task 2 Step 3 (seats by role); the switcher in Task 5 Steps 3 and 5.
  - §6 administration: Task 1 Steps 6–9 (service, removal check, controller); Task 6 Steps 1–3 (pages).
  - §7 delivery: Task 7.
  - O1 follow-up: Task 3 Step 2 (6); checked by `scoped-roles-check` O01–O04.
- **Placeholders:** none. Page edits in Task 6 name the state, calls and keys they touch; the new script copies one named block of an existing script.
- **Type consistency:**
  - `RoleAssignmentResponse` (C#) ↔ `RoleAssignment` (TS): `id`, `role`, `scopeKind`, `scopeId`, `scopeName`, `scopePath`, `facultyId`, `departmentId`, `groupId`, `createdAt`.
  - `StaffResponse` ↔ `StaffMember`; `CurrentUserResponse.{Role, AccountRole, Assignments}` ↔ `CurrentUser.{role, accountRole, assignments}`.
  - `RoleAssignmentBlocker(Kind, Label)` ↔ `RoleAssignmentBlocker.{kind, label}`; kinds are `RoleAssignmentUsage`'s five constants and the five `staff.blockers.*` keys.
  - `StaffOptionsQuery.{Search, Role, GroupId, DepartmentId, StudentTaskId}` ↔ `searchStaff(search, { role, groupId, departmentId, studentTaskId })`; `StaffListQuery` ↔ `getStaff({ role, groupId, departmentId })`.
  - `ActingRoles` names ↔ `ActingRole` union ↔ `roles.*` keys ↔ `homeRouteByRole` / `navigationByRole` keys.
  - `IStudentWorkflowService.RefreshStudentPanelsAsync` (phase 11) is what `ReservationService.CompleteAsync` calls.
  - `ITopicService.GetSupervisorsAsync(UserContext, Guid?)` ↔ `TopicsController.GetSupervisors([FromQuery] Guid? departmentId)` ↔ `getTopicSupervisors(departmentId?)`.

