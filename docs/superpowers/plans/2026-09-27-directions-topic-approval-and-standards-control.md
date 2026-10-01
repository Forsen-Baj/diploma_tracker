# Directions, Topic Approval and Standards Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Direction managers open directions inside departments and every topic belongs to one. A reserved topic becomes a student's only after an administrator, the direction's manager and the supervisor approve it; approvers can return it for changes or reject it. The direction manager and a group step's standards controller sit on the step review panels.

**Architecture:** The data model gains `Direction` (department → direction → topic), two capability flags on teacher accounts, `ReservationDecision` rows behind a pure `TopicApprovalPanel` evaluator, and a standards controller on `GroupTask`. Topic approval follows the step-panel pattern from phase 9: seats are derived when a request is read, never stored. The approval rows are facts, an edit moves `ContentChangedAt` so older approvals stop counting, and completion happens in the same save as the approval that satisfies the last seat. `ReviewPanel` grows from two seat kinds to four (supervisor, direction manager, extra, standards control) with one rule: one person, one seat, first in that order.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-27-directions-topic-approval-and-standards-control-design.md`. Phase 12 (`2026-09-27-scoped-staff-roles-design.md`) is not part of this plan.

**Prerequisites:** phases 1–10 implemented and committed; branch `phase11-12` at `1e76dc8` or later.

## Global Constraints

- Every topic has exactly one direction, and its department is `Direction.DepartmentId`. `Topic.DepartmentId` no longer exists.
- Direction: `Name` required, at most 200 characters, unique within its department. `Description` at most 2000. `ManagerId` is an active teacher with `IsDirectionManager`.
- The two capabilities are `AppUser.IsDirectionManager` and `AppUser.IsStandardsController`, meaningful on `Teacher` accounts only. The server reads them from the database on every request and never from the token.
- A topic request is **open** while `Pending` or `Returned`, and the topic is `Reserved` while its request is open.
- The three seats on a request are Administration (any administrator), Direction (the **current** manager of the topic's direction) and Supervision (the **current** supervisor). A seat is satisfied by an `Approved` or `Edited` decision from the right person with `DecidedAt >= ContentChangedAt`. One person's approval fills every seat they hold.
- The creator's approval is written when a request is made, for a creator who holds a seat on it. A proposal starts with none.
- Approve, return and edit wording need `Pending`. Reject works on any open request. Resubmit needs `Returned` and is the student's. Cancel works on any open request; the phase 4 deadline rule for a first request still applies.
- A catalogue topic whose request is rejected or cancelled gets back the title and description it had when the request was made. A release keeps the current wording.
- Every action on a request saves under the topic's `RowVersion`. A lost race answers `reservation.changed` (409).
- Step panel seats, in order: Supervisor, DirectionManager, Extra, StandardsControl. One person holds one seat, the first they qualify for. Marked seats require a mark 0–100; the StandardsControl seat approves without a mark and adds nothing to the average.
- The standards controller belongs to a `GroupTask`. Late joiners get the seat automatically, and approved steps are never touched. Every affected step's `UpdatedAt` is touched.
- Error bodies follow the `{ code, message }` contract. Every new code goes into its C# catalogue **and** into both `src/i18n/uk.json` and `src/i18n/en.json`.
- Every `DateTime` is UTC; never `DateTime.Now`.
- **No unit tests.** The existing test project must still compile and pass.
- **Commits: exactly one**, in the final task: `Implement directions, topic approval and standards control`. One bare title line, no body, no trailer.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, anything under `App_Data/`, or `.superpowers/sdd/`.
- The local database is recreated (regenerated `InitialCreate`), with the owner's permission.

## Rulings recorded while planning

- **`Topic.CreatedById` is nullable and stays null for a student's proposal.** The spec names the student as a proposal's creator. The student holds no seat, though, and group deletion deletes student accounts, so a non-null foreign key to the student would block that deletion. Staff accounts are never deleted.
- **Two codes beyond the spec's list:** `direction.departmentInvalid` (400, unknown department in a direction body) and `department.hasDirections` (409, deleting a department that has directions).
- **A teacher cannot move a topic to another direction.** A request that tries answers `access.forbidden`. A teacher naming another supervisor outside their own direction answers `direction.notManager`.
- **A return needs a comment.** `ReturnReservationRequest.Comment` is `[Required]`, so an empty one answers `validation.failed` with a field error. No new code.
- **Adding the step's direction manager or standards controller as an extra reviewer is refused** with `panel.reviewerExists`. They already sit on the panel.
- **A wording edit never completes a request.** Only an administrator and a teacher can hold seats, and nobody holds all three, so an edit always leaves a seat open. Completion is checked after approvals, assignments, and changes of supervisor, direction or manager.
- **`GET /api/reservations/pending?status=Pending`** returns every open request (`Pending` and `Returned`). `waitingForMe=true` narrows it to requests where the caller can approve now.
- **The reservation response shows the topic's current wording** while the request is open or approved, and the snapshot taken at request time for closed history.
- **`StepDetailsResponse.MySeat`** names the caller's seat when they can decide, so the decision form knows whether to ask for a mark.
- **The `GroupTask` standards-controller columns are added in Task 1**, with the rest of the schema, because the teacher-deactivation guard reads them.
- **A creator's approval counts only while the creator's account is active.**
- **Setting the controller a group step already has is a no-op** that answers `affectedSteps: 0`.
- **`giveTopic` in the check scripts opens a direction per call** in the given department, managed by the given teacher (who must be a direction manager; the seeded teacher is). The teacher creates the topic there, so their two seats start approved, and the administrator's assignment adds the third. The topic is approved at once, and every existing script keeps its expectations.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/Direction.cs`, `ReservationDecision.cs`, `ReservationDecisionKind.cs` | New domain |
| `backend/DiplomaTracker.Api/Entities/AppUser.cs`, `Topic.cs`, `Department.cs`, `GroupTask.cs`, `TopicReservation.cs`, `ReservationStatus.cs`, `ReviewSeat.cs` | Adjusted domain |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Services/DirectionErrors.cs`, `StaffErrors.cs`, `TopicErrors.cs`, `TaskErrors.cs`, `AcademicStructureErrors.cs`, `Errors/ErrorCatalog.cs` | Error codes |
| `backend/DiplomaTracker.Api/Services/StaffCapabilityQueries.cs` | "Is this user an active direction manager / standards controller" |
| `backend/DiplomaTracker.Api/Services/DirectionService.cs`, `Interfaces/IDirectionService.cs`, `Controllers/DirectionsController.cs`, `DTOs/Directions/*` | Directions |
| `backend/DiplomaTracker.Api/Services/TopicService.cs`, `DTOs/Topics/*` | Topics under directions |
| `backend/DiplomaTracker.Api/Services/TopicApprovalPanel.cs` | Pure evaluator of a request's three seats |
| `backend/DiplomaTracker.Api/Services/ReservationService.cs`, `Interfaces/IReservationService.cs`, `Controllers/ReservationsController.cs` | Topic requests and approval |
| `backend/DiplomaTracker.Api/Services/TeacherService.cs`, `Interfaces/ITeacherService.cs`, `Controllers/StaffController.cs`, `DTOs/Teachers/*` | Capabilities and the staff picker |
| `backend/DiplomaTracker.Api/Models/CurrentUserResponse.cs`, `Services/AuthService.cs` | Capabilities for the client |
| `backend/DiplomaTracker.Api/Services/ReviewPanel.cs`, `StudentWorkflowService.cs`, `Interfaces/IStudentWorkflowService.cs`, `DTOs/Workflow/StepDetailsResponse.cs` | Step panel seats |
| `backend/DiplomaTracker.Api/Services/AccessScope.cs`, `DashboardService.cs` | Visibility and "mine" |
| `backend/DiplomaTracker.Api/Services/GroupTaskService.cs`, `Controllers/GroupTasksController.cs`, `DTOs/GroupTasks/*` | Standards controller per group step |
| `backend/DiplomaTracker.Api/Services/DbSeeder.cs`, `DepartmentService.cs`, `DocumentTemplateService.cs`, `SecurityLog.cs`, `Program.cs` | Supporting changes |
| `.superpowers/checks/checkCleanup.mjs`, `topics-check.mjs`, `templates-check.mjs`, `hardening-check.mjs`, `directions-approval-check.mjs` (new) | Endpoint verification |
| `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md` | Demo data |
| `frontend/diploma-tracker-web/src/api/types.ts`, `directionsApi.ts` (new), `reservationsApi.ts`, `groupTasksApi.ts`, `workflowApi.ts` | Client |
| `frontend/diploma-tracker-web/src/components/topics/*` (new: `ApprovalSeats.tsx`, `RequestActions.tsx`, `WordingModal.tsx`, `RequiredCommentModal.tsx`, `DirectionFormModal.tsx`, `DirectionsSection.tsx`) | Shared topic components |
| `frontend/diploma-tracker-web/src/components/workflow/ReviewPanelCard.tsx`, `DecisionPanel.tsx`, `StandardsControllerDialog.tsx` (new), `GroupStepsSection.tsx` (new) | Step pages and the *Group steps* view |
| `frontend/diploma-tracker-web/src/pages/*Topics*.tsx`, `DirectionsPage.tsx` (new), `TaskTemplatesPage.tsx`, `TeachersPage.tsx`, `App.tsx`, `components/layout/navigation.ts`, `components/layout/AppShell.tsx` | Pages and navigation |
| `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json` | Translations |
| `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md` | Project records |

---

### Task 1: Schema, directions and staff capabilities

This task lays down the whole phase's schema and makes directions and capabilities work end to end: CRUD for directions, topics that belong to a direction, and the two capability flags on the teacher form. Topic approval itself is Task 2. The build is green at the end.

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/Direction.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Directions/DirectionQuery.cs`, `CreateDirectionRequest.cs`, `UpdateDirectionRequest.cs`, `DirectionResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Teachers/StaffCapability.cs`
- Create: `backend/DiplomaTracker.Api/Services/DirectionErrors.cs`, `StaffErrors.cs`, `StaffCapabilityQueries.cs`, `DirectionService.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IDirectionService.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/DirectionsController.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/AppUser.cs`, `Topic.cs`, `Department.cs`, `GroupTask.cs`, `ReservationStatus.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`, `Services/TopicErrors.cs`, `Services/TaskErrors.cs`, `Services/AcademicStructureErrors.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Topics/CreateTopicRequest.cs`, `UpdateTopicRequest.cs`, `TopicQuery.cs`, `TopicResponse.cs`, `ProposeTopicRequest.cs`
- Replace: `backend/DiplomaTracker.Api/Services/TopicService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ReservationService.cs` (three edits; Task 2 replaces the file)
- Modify: `backend/DiplomaTracker.Api/DTOs/Teachers/CreateTeacherRequest.cs`, `UpdateTeacherRequest.cs`, `TeacherResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TeacherService.cs`, `Interfaces/ITeacherService.cs`, `Controllers/StaffController.cs`
- Modify: `backend/DiplomaTracker.Api/Models/CurrentUserResponse.cs`, `Services/AuthService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs`, `Services/DepartmentService.cs`, `Program.cs`

**Interfaces:**
- Produces:
  - Entities: `Direction`, and `AppDbContext.Directions`.
  - `Topic.DirectionId`, `Topic.Direction`, `Topic.CreatedById`.
  - `AppUser.IsDirectionManager`, `AppUser.IsStandardsController`, `AppUser.ManagedDirections`.
  - `GroupTask.StandardsControllerId`, `StandardsControllerAssignedAt`, `StandardsController`.
  - `ReservationStatus.Returned`.
- Produces: `StaffCapabilityQueries.IsDirectionManagerAsync(this AppDbContext, Guid)` and `IsStandardsControllerAsync(this AppDbContext, Guid)`, both `Task<bool>`.
- Produces: error constants `DirectionErrors.{NotFound, Invalid, NameTaken, HasTopics, NotManager, ManagerInvalid, DepartmentInvalid}`, `StaffErrors.{ManagesDirections, ControlsSteps}`, `TaskErrors.GroupTaskControllerInvalid`, and `AcademicStructureErrors.DepartmentHasDirections`.
- Produces: `IDirectionService` with `GetDirectionsAsync`, `GetDirectionAsync`, `CreateDirectionAsync`, `UpdateDirectionAsync` and `DeleteDirectionAsync`. Task 2 adds the manager-change completion hook to `UpdateDirectionAsync`.
- Produces: `ITeacherService.SearchStaffAsync(string? search, StaffCapability? capability)`.
- Wire shapes, camelCase on the wire:
  - `DirectionResponse`: `id`, `name`, `description`, `departmentId`, `departmentName`, `facultyId`, `facultyName`, `managerId`, `managerName`, `topicsAvailable`, `topicsReserved`, `topicsApproved`, `canManage`, `createdAt`, `updatedAt`.
  - `TopicResponse` gains `directionId`, `directionName`, `directionManagerId`, `directionManagerName`, `canEdit` and `canDelete`.
  - `TeacherResponse` and `CurrentUserResponse` gain `isDirectionManager` and `isStandardsController`.

- [ ] **Step 1: The direction entity and the adjusted entities**

`Entities/Direction.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// A named research area inside one department (design 2026-09-27 §4.1). Every topic belongs to
/// one direction, and a topic's department is its direction's.
public class Direction
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// An active teacher with IsDirectionManager. They approve every topic request in this
    /// direction and sit on the review panel of every step of its students (§5.2, §6).
    public Guid ManagerId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Department Department { get; set; } = null!;
    public AppUser Manager { get; set; } = null!;
    public ICollection<Topic> Topics { get; set; } = new List<Topic>();
}
```

`Entities/AppUser.cs`: add after `IsActive`:

```csharp
    /// Design 2026-09-27 §3: capabilities of a Teacher account. Read from the database on every
    /// request, never from the token.
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
```

and after `SupervisedTopics`:

```csharp
    public ICollection<Direction> ManagedDirections { get; set; } = new List<Direction>();
```

`Entities/Department.cs`: replace the line `public ICollection<Topic> Topics { get; set; } = new List<Topic>();` with:

```csharp
    public ICollection<Direction> Directions { get; set; } = new List<Direction>();
```

`Entities/Topic.cs`: replace the two lines

```csharp
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
```

with:

```csharp
    /// Design 2026-09-27 §4.1: every topic belongs to one direction; its department is the
    /// direction's, and that is what decides which students may discover it.
    public Guid DirectionId { get; set; }
    public Direction Direction { get; set; } = null!;

    /// The staff member who created the topic; their seats on a request start approved (§5.2).
    /// Null for a student's proposal - a student holds no seat, and student accounts are deleted
    /// with their group.
    public Guid? CreatedById { get; set; }
    public AppUser? CreatedBy { get; set; }
```

`Entities/GroupTask.cs`: add after `UpdatedAt`:

```csharp
    /// Design 2026-09-27 §6.1: the standards controller of this group step. They sit on the panel
    /// of every student step of it that is not yet approved; their approvals count only from
    /// StandardsControllerAssignedAt on.
    public Guid? StandardsControllerId { get; set; }
    public DateTime? StandardsControllerAssignedAt { get; set; }
    public AppUser? StandardsController { get; set; }
```

`Entities/ReservationStatus.cs`: the enum becomes

```csharp
public enum ReservationStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled,
    Released,

    /// Design 2026-09-27 §5.1: an approver returned the request for changes. It is still open -
    /// it holds its topic - and waits for the student to resubmit.
    Returned
}
```

- [ ] **Step 2: Mapping**

In `Data/AppDbContext.cs`:

1. Add the set after `Departments`:

```csharp
    public DbSet<Direction> Directions => Set<Direction>();
```

2. In the `user` block, after `user.Property(x => x.IsActive).IsRequired();`:

```csharp
        user.Property(x => x.IsDirectionManager).IsRequired();
        user.Property(x => x.IsStandardsController).IsRequired();
```

3. After the `department` block (before `var user = ...`):

```csharp
        var direction = modelBuilder.Entity<Direction>();
        direction.ToTable("Directions");
        direction.HasKey(x => x.Id);
        direction.Property(x => x.Name).HasMaxLength(200).IsRequired();
        direction.Property(x => x.Description).HasMaxLength(2000);
        direction.Property(x => x.CreatedAt).IsRequired();
        direction.Property(x => x.UpdatedAt).IsRequired();
        direction.HasIndex(x => new { x.DepartmentId, x.Name }).IsUnique();
        direction.HasIndex(x => x.ManagerId);
        direction.HasOne(x => x.Department)
            .WithMany(x => x.Directions)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);
        direction.HasOne(x => x.Manager)
            .WithMany(x => x.ManagedDirections)
            .HasForeignKey(x => x.ManagerId)
            .OnDelete(DeleteBehavior.Restrict);
```

4. In the `groupTask` block, after the `DiplomaTaskTemplate` relationship:

```csharp
        groupTask.HasIndex(x => x.StandardsControllerId);
        groupTask.HasOne(x => x.StandardsController)
            .WithMany()
            .HasForeignKey(x => x.StandardsControllerId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
```

5. In the `topic` block, replace `topic.HasIndex(x => new { x.DepartmentId, x.Status });` with `topic.HasIndex(x => new { x.DirectionId, x.Status });`. Replace the `topic.HasOne(x => x.Department)...` relationship (four lines) with:

```csharp
        topic.HasOne(x => x.Direction)
            .WithMany(x => x.Topics)
            .HasForeignKey(x => x.DirectionId)
            .OnDelete(DeleteBehavior.Restrict);
        topic.HasOne(x => x.CreatedBy)
            .WithMany()
            .HasForeignKey(x => x.CreatedById)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
```

`Restrict` maps to `NO ACTION`: staff accounts are never deleted, and SQL Server would refuse a second cascade path from `Users` anyway.

- [ ] **Step 3: Error codes**

`Services/DirectionErrors.cs`:

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class DirectionErrors
{
    public const string NotFound = "direction.notFound";
    public const string Invalid = "direction.invalid";
    public const string NameTaken = "direction.nameTaken";
    public const string HasTopics = "direction.hasTopics";
    public const string NotManager = "direction.notManager";
    public const string ManagerInvalid = "direction.managerInvalid";
    public const string DepartmentInvalid = "direction.departmentInvalid";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Direction not found."),
        new(Invalid, StatusCodes.Status400BadRequest, "Choose a direction of your department."),
        new(NameTaken, StatusCodes.Status409Conflict, "A direction with this name already exists in the department."),
        new(HasTopics, StatusCodes.Status409Conflict, "The direction still has topics."),
        new(NotManager, StatusCodes.Status403Forbidden, "You do not manage this direction."),
        new(ManagerInvalid, StatusCodes.Status400BadRequest, "The manager must be an active teacher who is a direction manager."),
        new(DepartmentInvalid, StatusCodes.Status400BadRequest, "The selected department does not exist.")
    ];
}
```

`Services/StaffErrors.cs`:

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class StaffErrors
{
    public const string ManagesDirections = "staff.managesDirections";
    public const string ControlsSteps = "staff.controlsSteps";

    public static readonly ErrorDefinition[] All =
    [
        new(ManagesDirections, StatusCodes.Status409Conflict, "This teacher manages a direction. Hand it to another manager first."),
        new(ControlsSteps, StatusCodes.Status409Conflict, "This teacher is the standards controller of a group step. Assign someone else first.")
    ];
}
```

`Services/TaskErrors.cs`: add the constant `public const string GroupTaskControllerInvalid = "groupTask.controllerInvalid";` after `GroupTaskTemplateFacultyMismatch`, and to `All`:

```csharp
        new(GroupTaskControllerInvalid, StatusCodes.Status400BadRequest, "The standards controller must be an active teacher with that responsibility."),
```

`Services/AcademicStructureErrors.cs`: add `public const string DepartmentHasDirections = "department.hasDirections";` after `DepartmentHasGroups`, and to `All`:

```csharp
        new(DepartmentHasDirections, StatusCodes.Status409Conflict, "Cannot delete department because directions are assigned."),
```

`Services/TopicErrors.cs`: delete the `TopicDepartmentInvalid` constant and its `All` entry (replaced by `direction.invalid`).

`Errors/ErrorCatalog.cs`: add `DirectionErrors.All` and `StaffErrors.All` to the `areas` array, after `TopicErrors.All`.

- [ ] **Step 4: Capability queries**

`Services/StaffCapabilityQueries.cs`:

```csharp
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
```

- [ ] **Step 5: Direction contracts**

`DTOs/Directions/DirectionQuery.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Directions;

public class DirectionQuery
{
    public Guid? DepartmentId { get; set; }
    public Guid? ManagerId { get; set; }

    /// Only the caller's own directions.
    public bool Mine { get; set; }
}
```

`DTOs/Directions/CreateDirectionRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Directions;

public class CreateDirectionRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// Administrators only: the direction manager. A direction manager always manages what they create.
    public Guid? ManagerId { get; set; }
}
```

`DTOs/Directions/UpdateDirectionRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Directions;

public class UpdateDirectionRequest
{
    public Guid DepartmentId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    /// Administrators only. Null keeps the current manager.
    public Guid? ManagerId { get; set; }
}
```

`DTOs/Directions/DirectionResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Directions;

public class DirectionResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public Guid ManagerId { get; set; }
    public string ManagerName { get; set; } = string.Empty;
    public int TopicsAvailable { get; set; }
    public int TopicsReserved { get; set; }
    public int TopicsApproved { get; set; }

    /// The caller may edit or delete it: its manager or an administrator.
    public bool CanManage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

- [ ] **Step 6: The direction service**

`Interfaces/IDirectionService.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDirectionService
{
    Task<(IReadOnlyList<DirectionResponse>? directions, string? error)> GetDirectionsAsync(UserContext user, DirectionQuery query);
    Task<(DirectionResponse? direction, string? error)> GetDirectionAsync(UserContext user, Guid id);
    Task<(DirectionResponse? direction, string? error)> CreateDirectionAsync(UserContext user, CreateDirectionRequest request);
    Task<(DirectionResponse? direction, string? error)> UpdateDirectionAsync(UserContext user, Guid id, UpdateDirectionRequest request);
    Task<(bool success, string? error)> DeleteDirectionAsync(UserContext user, Guid id);
}
```

`Services/DirectionService.cs`:

```csharp
using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §4. A direction manager creates directions and manages their own; an
/// administrator manages every direction and names or changes its manager.
public class DirectionService : IDirectionService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<DirectionService> _logger;

    public DirectionService(AppDbContext dbContext, ILogger<DirectionService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<(IReadOnlyList<DirectionResponse>? directions, string? error)> GetDirectionsAsync(UserContext user, DirectionQuery query)
    {
        IQueryable<Direction> directions = _dbContext.Directions.AsNoTracking();

        if (user.IsStudent)
        {
            // A student sees the directions of their own group's department - the ones a
            // proposal may name (§4.3).
            var departmentId = await StudentDepartmentAsync(user.UserId);
            if (departmentId is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            directions = directions.Where(d => d.DepartmentId == departmentId);
        }
        else if (user.IsAdmin || user.IsTeacher)
        {
            if (query.DepartmentId is not null)
            {
                directions = directions.Where(d => d.DepartmentId == query.DepartmentId);
            }

            if (query.ManagerId is not null)
            {
                directions = directions.Where(d => d.ManagerId == query.ManagerId);
            }

            if (query.Mine)
            {
                directions = directions.Where(d => d.ManagerId == user.UserId);
            }
        }
        else
        {
            return (null, CommonErrors.Forbidden);
        }

        var rows = await directions
            .OrderBy(d => d.Department.Faculty.Name)
            .ThenBy(d => d.Department.Name)
            .ThenBy(d => d.Name)
            .Select(Projection(user))
            .ToListAsync();

        return (rows, null);
    }

    public async Task<(DirectionResponse? direction, string? error)> GetDirectionAsync(UserContext user, Guid id)
    {
        var row = await _dbContext.Directions.AsNoTracking()
            .Where(d => d.Id == id)
            .Select(Projection(user))
            .FirstOrDefaultAsync();

        if (row is null)
        {
            return (null, DirectionErrors.NotFound);
        }

        if (user.IsStudent && row.DepartmentId != await StudentDepartmentAsync(user.UserId))
        {
            return (null, DirectionErrors.NotFound);
        }

        return (row, null);
    }

    public async Task<(DirectionResponse? direction, string? error)> CreateDirectionAsync(UserContext user, CreateDirectionRequest request)
    {
        Guid managerId;
        if (user.IsAdmin)
        {
            if (request.ManagerId is not { } named || !await _dbContext.IsDirectionManagerAsync(named))
            {
                return (null, DirectionErrors.ManagerInvalid);
            }

            managerId = named;
        }
        else if (user.IsTeacher && await _dbContext.IsDirectionManagerAsync(user.UserId))
        {
            managerId = user.UserId;
        }
        else
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!await _dbContext.Departments.AnyAsync(d => d.Id == request.DepartmentId))
        {
            return (null, DirectionErrors.DepartmentInvalid);
        }

        var name = request.Name.Trim();
        if (await _dbContext.Directions.AnyAsync(d => d.DepartmentId == request.DepartmentId && d.Name == name))
        {
            return (null, DirectionErrors.NameTaken);
        }

        var now = DateTime.UtcNow;
        var direction = new Direction
        {
            Id = Guid.NewGuid(),
            DepartmentId = request.DepartmentId,
            Name = name,
            Description = IdentityNormalizer.Optional(request.Description),
            ManagerId = managerId,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Directions.Add(direction);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, DirectionErrors.NameTaken);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Created", "Direction", direction.Id);
        return await GetDirectionAsync(user, direction.Id);
    }

    public async Task<(DirectionResponse? direction, string? error)> UpdateDirectionAsync(UserContext user, Guid id, UpdateDirectionRequest request)
    {
        var direction = await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == id);
        var access = CheckManageable(user, direction);
        if (access is not null)
        {
            return (null, access);
        }

        var editable = direction!;

        if (request.DepartmentId != editable.DepartmentId)
        {
            if (!await _dbContext.Departments.AnyAsync(d => d.Id == request.DepartmentId))
            {
                return (null, DirectionErrors.DepartmentInvalid);
            }

            // §4.2: the department decides who may discover the direction's topics, so a direction
            // moves only while it has none.
            if (await _dbContext.Topics.AnyAsync(t => t.DirectionId == editable.Id))
            {
                return (null, DirectionErrors.HasTopics);
            }
        }

        if (request.ManagerId is { } managerId && managerId != editable.ManagerId)
        {
            if (!user.IsAdmin)
            {
                return (null, CommonErrors.Forbidden);
            }

            if (!await _dbContext.IsDirectionManagerAsync(managerId))
            {
                return (null, DirectionErrors.ManagerInvalid);
            }

            // §4.2: the direction's approval seat and its step-panel seats move to the new manager
            // at once - both are derived from ManagerId whenever they are read.
            editable.ManagerId = managerId;
        }

        var name = request.Name.Trim();
        if (await _dbContext.Directions.AnyAsync(d => d.Id != editable.Id && d.DepartmentId == request.DepartmentId && d.Name == name))
        {
            return (null, DirectionErrors.NameTaken);
        }

        editable.Name = name;
        editable.Description = IdentityNormalizer.Optional(request.Description);
        editable.DepartmentId = request.DepartmentId;
        editable.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, DirectionErrors.NameTaken);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Updated", "Direction", editable.Id);
        return await GetDirectionAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteDirectionAsync(UserContext user, Guid id)
    {
        var direction = await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == id);
        var access = CheckManageable(user, direction);
        if (access is not null)
        {
            return (false, access);
        }

        if (await _dbContext.Topics.AnyAsync(t => t.DirectionId == id))
        {
            return (false, DirectionErrors.HasTopics);
        }

        _dbContext.Directions.Remove(direction!);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (false, DirectionErrors.HasTopics);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Deleted", "Direction", id);
        return (true, null);
    }

    private static string? CheckManageable(UserContext user, Direction? direction)
    {
        if (direction is null)
        {
            return DirectionErrors.NotFound;
        }

        if (user.IsAdmin || (user.IsTeacher && direction.ManagerId == user.UserId))
        {
            return null;
        }

        return user.IsTeacher ? DirectionErrors.NotManager : CommonErrors.Forbidden;
    }

    private Task<Guid?> StudentDepartmentAsync(Guid userId) =>
        _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => (Guid?)p.Group.DepartmentId)
            .FirstOrDefaultAsync();

    private static Expression<Func<Direction, DirectionResponse>> Projection(UserContext user)
    {
        var me = user.UserId;
        var isAdmin = user.IsAdmin;

        return d => new DirectionResponse
        {
            Id = d.Id,
            Name = d.Name,
            Description = d.Description,
            DepartmentId = d.DepartmentId,
            DepartmentName = d.Department.Name,
            FacultyId = d.Department.FacultyId,
            FacultyName = d.Department.Faculty.Name,
            ManagerId = d.ManagerId,
            ManagerName = d.Manager.LastName + " " + d.Manager.FirstName
                + (d.Manager.Patronymic == null ? "" : " " + d.Manager.Patronymic),
            TopicsAvailable = d.Topics.Count(t => t.Status == TopicStatus.Available),
            TopicsReserved = d.Topics.Count(t => t.Status == TopicStatus.Reserved),
            TopicsApproved = d.Topics.Count(t => t.Status == TopicStatus.Approved),
            CanManage = isAdmin || d.ManagerId == me,
            CreatedAt = d.CreatedAt,
            UpdatedAt = d.UpdatedAt
        };
    }
}
```

`Controllers/DirectionsController.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/directions")]
[Authorize]
public class DirectionsController : ApiControllerBase
{
    private readonly IDirectionService _directions;

    public DirectionsController(IDirectionService directions)
    {
        _directions = directions;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DirectionQuery query)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (directions, error) = await _directions.GetDirectionsAsync(user, query);
        return directions is null ? ErrorResult(error) : Ok(directions);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.GetDirectionAsync(user, id);
        return direction is null ? ErrorResult(error) : Ok(direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDirectionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.CreateDirectionAsync(user, request);
        return direction is null ? ErrorResult(error) : CreatedAtAction(nameof(GetById), new { id = direction.Id }, direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDirectionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.UpdateDirectionAsync(user, id, request);
        return direction is null ? ErrorResult(error) : Ok(direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _directions.DeleteDirectionAsync(user, id);
        return success ? NoContent() : ErrorResult(error);
    }
}
```

`Program.cs`: add after the `ITopicService` registration:

```csharp
builder.Services.AddScoped<IDirectionService, DirectionService>();
```

- [ ] **Step 7: Topic contracts**

`DTOs/Topics/CreateTopicRequest.cs` and `UpdateTopicRequest.cs`: replace `public Guid DepartmentId { get; set; }` with:

```csharp
    public Guid DirectionId { get; set; }
```

`DTOs/Topics/TopicQuery.cs`: add `public Guid? DirectionId { get; set; }` after `DepartmentId` (the administrator's department filter stays and now matches through the direction).

`DTOs/Topics/ProposeTopicRequest.cs`: add after `SupervisorId`:

```csharp
    /// Design 2026-09-27 §4.3: a direction of the student's own department.
    public Guid DirectionId { get; set; }
```

`DTOs/Topics/TopicResponse.cs`: add after `FacultyName`:

```csharp
    public Guid DirectionId { get; set; }
    public string DirectionName { get; set; } = string.Empty;
    public Guid DirectionManagerId { get; set; }
    public string DirectionManagerName { get; set; } = string.Empty;
```

and after `HasSubmissions`:

```csharp
    /// Whether the caller may open the topic form (an administrator at any status; the supervisor
    /// or the direction's manager while the topic is an available catalogue topic).
    public bool CanEdit { get; set; }

    /// Whether the caller may delete it: the same people, and only while it is available.
    public bool CanDelete { get; set; }
```

- [ ] **Step 8: Replace `Services/TopicService.cs`**

```csharp
using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class TopicService : ITopicService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<TopicService> _logger;

    public TopicService(AppDbContext dbContext, ILogger<TopicService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<(IReadOnlyList<TopicResponse>? topics, string? error)> GetTopicsAsync(UserContext user, TopicQuery query)
    {
        IQueryable<Topic> topics = _dbContext.Topics.AsNoTracking();

        if (user.IsStudent)
        {
            var student = await LoadStudentAsync(user.UserId);
            if (student is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            // The topic the student HOLDS comes from their profile; a topic they have REQUESTED is
            // their open reservation - Pending, or Returned to them for changes. Both stay visible
            // in the catalogue.
            var requestedTopicId = await _dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.StudentProfileId == student.Id
                    && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned))
                .Select(r => r.TopicId)
                .FirstOrDefaultAsync();

            var ownTopicIds = new List<Guid>();
            if (student.TopicId is not null)
            {
                ownTopicIds.Add(student.TopicId.Value);
            }
            if (requestedTopicId is not null && requestedTopicId != student.TopicId)
            {
                ownTopicIds.Add(requestedTopicId.Value);
            }

            // Design 2026-09-27 §4.1: a topic's department is its direction's.
            topics = topics.Where(t =>
                ownTopicIds.Contains(t.Id)
                || (t.Direction.DepartmentId == student.DepartmentId
                    && t.Origin == TopicOrigin.Catalogue
                    && t.Status == TopicStatus.Available
                    && t.Supervisor.IsActive));
        }
        else if (user.IsTeacher)
        {
            // §5.4: a direction manager also sees every topic in their directions, at any status.
            topics = topics.Where(t => t.SupervisorId == user.UserId || t.Direction.ManagerId == user.UserId);
        }
        else if (!user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Escape SQL Server's own LIKE wildcards before they reach Contains(), which
            // translates to LIKE '%...%': unescaped, a search for "50%" or "a_b" would match
            // as a pattern instead of literal text.
            var search = query.Search.Trim()
                .Replace("[", "[[]")
                .Replace("%", "[%]")
                .Replace("_", "[_]");
            topics = topics.Where(t => EF.Functions.Like(t.Title, $"%{search}%")
                || (t.Description != null && EF.Functions.Like(t.Description, $"%{search}%")));
        }

        if (query.SupervisorId is not null)
        {
            topics = topics.Where(t => t.SupervisorId == query.SupervisorId);
        }

        if (query.DirectionId is not null)
        {
            topics = topics.Where(t => t.DirectionId == query.DirectionId);
        }

        if (user.IsAdmin && query.DepartmentId is not null)
        {
            topics = topics.Where(t => t.Direction.DepartmentId == query.DepartmentId);
        }

        if (!user.IsStudent && !string.IsNullOrWhiteSpace(query.Status))
        {
            if (!Enum.TryParse<TopicStatus>(query.Status, ignoreCase: true, out var status))
            {
                return (null, CommonErrors.ValidationFailed);
            }

            topics = topics.Where(t => t.Status == status);
        }

        var rows = await topics
            .OrderBy(t => t.Title)
            .Select(Projection)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, user)).ToList(), null);
    }

    public async Task<(TopicResponse? topic, string? error)> GetTopicAsync(UserContext user, Guid id)
    {
        var row = await _dbContext.Topics.AsNoTracking()
            .Where(t => t.Id == id)
            .Select(Projection)
            .FirstOrDefaultAsync();

        if (row is null)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (user.IsTeacher && row.SupervisorId != user.UserId && row.DirectionManagerId != user.UserId)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Topic", id);
            return (null, TopicErrors.TopicNotFound);
        }

        if (user.IsStudent)
        {
            var student = await LoadStudentAsync(user.UserId);
            if (student is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            var isOwn = row.Holder?.StudentProfileId == student.Id || row.Request?.StudentProfileId == student.Id;
            var isVisibleCatalogue = row.DepartmentId == student.DepartmentId
                && row.Origin == TopicOrigin.Catalogue
                && row.Status == TopicStatus.Available
                && row.SupervisorIsActive;

            if (!isOwn && !isVisibleCatalogue)
            {
                SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Topic", id);
                return (null, TopicErrors.TopicNotFound);
            }
        }

        return (ToResponse(row, user), null);
    }

    public async Task<(TopicResponse? topic, string? error)> CreateTopicAsync(UserContext user, CreateTopicRequest request)
    {
        var direction = await _dbContext.Directions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == request.DirectionId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var (supervisorId, supervisorError) = ChooseSupervisor(user, direction.ManagerId, request.SupervisorId, current: null);
        if (supervisorError is not null)
        {
            return (null, supervisorError);
        }

        if (supervisorId is null || !await IsActiveTeacherAsync(supervisorId.Value))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = supervisorId.Value,
            DirectionId = direction.Id,
            CreatedById = user.UserId,
            Origin = TopicOrigin.Catalogue,
            Status = TopicStatus.Available,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Topics.Add(topic);
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, user.UserId, "Created", "Topic", topic.Id);
        return await GetTopicAsync(user, topic.Id);
    }

    public async Task<(TopicResponse? topic, string? error)> UpdateTopicAsync(UserContext user, Guid id, UpdateTopicRequest request)
    {
        var topic = await _dbContext.Topics
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckUpdatable(user, topic);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var editable = topic!;

        // §4.3: only an administrator moves a topic to another direction.
        if (request.DirectionId != editable.DirectionId && !user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        var direction = request.DirectionId == editable.DirectionId
            ? editable.Direction
            : await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == request.DirectionId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var (supervisorId, supervisorError) = ChooseSupervisor(user, editable.Direction.ManagerId, request.SupervisorId, editable.SupervisorId);
        if (supervisorError is not null)
        {
            return (null, supervisorError);
        }

        if (supervisorId is null || !await IsActiveTeacherAsync(supervisorId.Value))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }

        var now = DateTime.UtcNow;

        // An administrator may move a topic that a student already holds - or has merely
        // requested - to another supervisor. The student's supervisor moves with it, in this
        // same save, so the topic and the student never disagree about who supervises the work.
        // StudentProfile.TopicId is written only on approval, so an Approved topic's holder is
        // found there; a Reserved topic's requester has no such FK yet and is found through the
        // open reservation instead.
        if (supervisorId != editable.SupervisorId && editable.Status != TopicStatus.Available)
        {
            var holder = editable.Status == TopicStatus.Approved
                ? await _dbContext.StudentProfiles.FirstOrDefaultAsync(p => p.TopicId == editable.Id)
                : await _dbContext.TopicReservations
                    .Where(r => r.TopicId == editable.Id
                        && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned))
                    .Select(r => r.StudentProfile)
                    .FirstOrDefaultAsync();

            if (holder is not null)
            {
                holder.SupervisorId = supervisorId;
                holder.UpdatedAt = now;
            }
        }

        editable.Title = request.Title.Trim();
        editable.Description = IdentityNormalizer.Optional(request.Description);
        editable.DirectionId = direction.Id;
        editable.SupervisorId = supervisorId.Value;
        editable.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            // A lost RowVersion race is a concurrency conflict on the topic itself, reported as
            // topic.notAvailable, not as topic.notEditable.
            return (null, TopicErrors.TopicNotAvailable);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Updated", "Topic", editable.Id);
        return await GetTopicAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id)
    {
        var topic = await _dbContext.Topics
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckDeletable(user, topic);
        if (accessError is not null)
        {
            return (false, accessError);
        }

        _dbContext.Topics.Remove(topic!);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return (false, TopicErrors.TopicNotAvailable);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Deleted", "Topic", id);
        return (true, null);
    }

    public async Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync()
    {
        var teachers = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Teacher" && u.IsActive)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return teachers.Select(t => new SupervisorOption(t.Id, PersonName.Full(t))).ToList();
    }

    /// §4.3: a teacher supervises what they create; a direction manager names any teacher under
    /// their own direction; an administrator names anyone. `current` is the topic's supervisor on
    /// an edit and null on a create.
    private static (Guid? id, string? error) ChooseSupervisor(UserContext user, Guid directionManagerId, Guid? requested, Guid? current)
    {
        if (user.IsAdmin)
        {
            return (requested ?? current, null);
        }

        var unchanged = current ?? user.UserId;
        if (requested is null || requested == unchanged)
        {
            return (unchanged, null);
        }

        return directionManagerId == user.UserId
            ? (requested, null)
            : (null, DirectionErrors.NotManager);
    }

    private Task<bool> IsActiveTeacherAsync(Guid userId) =>
        _dbContext.Users.AnyAsync(u => u.Id == userId && u.Role == "Teacher" && u.IsActive);

    /// Editing: an administrator may amend any topic at any status. The supervisor or the
    /// direction's manager may amend an available catalogue topic only; once a student asks for
    /// it, wording changes go through the request (design 2026-09-27 §5.3).
    private static string? CheckUpdatable(UserContext user, Topic? topic)
    {
        var access = CheckTopicAccess(user, topic);
        if (access is not null)
        {
            return access;
        }

        if (user.IsAdmin)
        {
            return null;
        }

        return topic!.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available
            ? TopicErrors.TopicNotEditable
            : null;
    }

    /// Deleting stays restricted to available catalogue topics for everyone, administrators
    /// included: removing a topic a student is working on would strand them. Release it first.
    private static string? CheckDeletable(UserContext user, Topic? topic)
    {
        var access = CheckTopicAccess(user, topic);
        if (access is not null)
        {
            return access;
        }

        return topic!.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available
            ? TopicErrors.TopicNotEditable
            : null;
    }

    private static string? CheckTopicAccess(UserContext user, Topic? topic)
    {
        if (topic is null)
        {
            return TopicErrors.TopicNotFound;
        }

        if (user.IsAdmin)
        {
            return null;
        }

        if (!user.IsTeacher)
        {
            return CommonErrors.Forbidden;
        }

        return topic.SupervisorId == user.UserId || topic.Direction.ManagerId == user.UserId
            ? null
            : TopicErrors.TopicNotOwner;
    }

    private async Task<StudentScope?> LoadStudentAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => new StudentScope(p.Id, p.Group.DepartmentId, p.TopicId))
            .FirstOrDefaultAsync();
    }

    private static TopicResponse ToResponse(TopicRow row, UserContext user)
    {
        var showStudent = !user.IsStudent;

        // The holder wins: a topic can be held by one student and requested by another only
        // through an administrator's assignment, and the holder is the topic's real state.
        var party = row.Holder ?? row.Request;

        var manages = user.IsAdmin
            || (user.IsTeacher && (row.SupervisorId == user.UserId || row.DirectionManagerId == user.UserId));
        var availableCatalogue = row.Origin == TopicOrigin.Catalogue && row.Status == TopicStatus.Available;

        return new TopicResponse
        {
            Id = row.Id,
            Title = row.Title,
            Description = row.Description,
            SupervisorId = row.SupervisorId,
            SupervisorName = PersonName.Full(row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic),
            DepartmentId = row.DepartmentId,
            DepartmentName = row.DepartmentName,
            FacultyName = row.FacultyName,
            DirectionId = row.DirectionId,
            DirectionName = row.DirectionName,
            DirectionManagerId = row.DirectionManagerId,
            DirectionManagerName = PersonName.Full(row.DirectionManagerLastName, row.DirectionManagerFirstName, row.DirectionManagerPatronymic),
            Origin = row.Origin.ToString(),
            Status = row.Status.ToString(),
            ActiveReservationId = party?.ReservationId,
            ActiveReservationStatus = party?.Status.ToString(),
            StudentProfileId = showStudent ? party?.StudentProfileId : null,
            StudentName = showStudent ? party?.Name : null,
            GroupCode = showStudent ? party?.GroupCode : null,
            // O1: only meaningful for the holder (release action) - an open request has nothing
            // to submit against yet, so it is always false there.
            HasSubmissions = row.Holder?.HasSubmissions ?? false,
            CanEdit = user.IsAdmin || (manages && availableCatalogue),
            CanDelete = manages && availableCatalogue,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }

    /// The holder comes from StudentProfile.TopicId - the source of truth - and the open request
    /// from TopicReservations, which is what a request actually is. Each is projected as one
    /// nested object, so SQL Server plans two OUTER APPLYs instead of a scalar subquery per field.
    private static readonly Expression<Func<Topic, TopicRow>> Projection = t => new TopicRow
    {
        Id = t.Id,
        Title = t.Title,
        Description = t.Description,
        SupervisorId = t.SupervisorId,
        SupervisorFirstName = t.Supervisor.FirstName,
        SupervisorLastName = t.Supervisor.LastName,
        SupervisorPatronymic = t.Supervisor.Patronymic,
        SupervisorIsActive = t.Supervisor.IsActive,
        DepartmentId = t.Direction.DepartmentId,
        DepartmentName = t.Direction.Department.Name,
        FacultyName = t.Direction.Department.Faculty.Name,
        DirectionId = t.DirectionId,
        DirectionName = t.Direction.Name,
        DirectionManagerId = t.Direction.ManagerId,
        DirectionManagerFirstName = t.Direction.Manager.FirstName,
        DirectionManagerLastName = t.Direction.Manager.LastName,
        DirectionManagerPatronymic = t.Direction.Manager.Patronymic,
        Origin = t.Origin,
        Status = t.Status,
        Holder = t.Holders
            .Select(p => new TopicPartyRow
            {
                ReservationId = p.TopicReservations
                    .Where(r => r.Status == ReservationStatus.Approved)
                    .Select(r => (Guid?)r.Id)
                    .FirstOrDefault(),
                Status = ReservationStatus.Approved,
                StudentProfileId = p.Id,
                LastName = p.User.LastName,
                FirstName = p.User.FirstName,
                GroupCode = p.Group.Code,
                HasSubmissions = p.StudentTasks.Any(st => st.Submissions.Any())
            })
            .FirstOrDefault(),
        Request = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned)
            .Select(r => new TopicPartyRow
            {
                ReservationId = r.Id,
                Status = r.Status,
                StudentProfileId = r.StudentProfileId,
                LastName = r.StudentProfile.User.LastName,
                FirstName = r.StudentProfile.User.FirstName,
                GroupCode = r.StudentProfile.Group.Code
            })
            .FirstOrDefault(),
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt
    };

    private sealed record StudentScope(Guid Id, Guid DepartmentId, Guid? TopicId);

    private sealed class TopicRow
    {
        public Guid Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string? Description { get; init; }
        public Guid SupervisorId { get; init; }
        public string SupervisorFirstName { get; init; } = string.Empty;
        public string SupervisorLastName { get; init; } = string.Empty;
        public string? SupervisorPatronymic { get; init; }
        public bool SupervisorIsActive { get; init; }
        public Guid DepartmentId { get; init; }
        public string DepartmentName { get; init; } = string.Empty;
        public string FacultyName { get; init; } = string.Empty;
        public Guid DirectionId { get; init; }
        public string DirectionName { get; init; } = string.Empty;
        public Guid DirectionManagerId { get; init; }
        public string DirectionManagerFirstName { get; init; } = string.Empty;
        public string DirectionManagerLastName { get; init; } = string.Empty;
        public string? DirectionManagerPatronymic { get; init; }
        public TopicOrigin Origin { get; init; }
        public TopicStatus Status { get; init; }
        public TopicPartyRow? Holder { get; init; }
        public TopicPartyRow? Request { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }

    /// One party on a topic: the student who holds it, or the student asking for it.
    private sealed class TopicPartyRow
    {
        public Guid? ReservationId { get; init; }
        public ReservationStatus Status { get; init; }
        public Guid StudentProfileId { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;
        public bool HasSubmissions { get; init; }

        public string Name => LastName + " " + FirstName;
    }
}
```

- [ ] **Step 9: Keep the reservation service compiling**

Task 2 replaces this file entirely. Here, three edits keep the build green:

1. In `ReserveAsync`, the topic load becomes

```csharp
        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == topicId);
```

and `if (topic.DepartmentId != student.Group.DepartmentId)` becomes `if (topic.Direction.DepartmentId != student.Group.DepartmentId)`.

2. In `ProposeAsync`, after the `teacherIsValid` check, insert:

```csharp
        // Design 2026-09-27 §4.3: a proposal names a direction of the student's own department.
        if (!await _dbContext.Directions.AnyAsync(d => d.Id == request.DirectionId && d.DepartmentId == student.Group.DepartmentId))
        {
            return (null, DirectionErrors.Invalid);
        }
```

and in the new `Topic`, replace `DepartmentId = student.Group.DepartmentId,` with `DirectionId = request.DirectionId,`.

3. In `SetStudentTopicAsync`, the topic load gains `.Include(t => t.Direction)` after `.Include(t => t.Supervisor)`, and `topic.DepartmentId != student.Group.DepartmentId` becomes `topic.Direction.DepartmentId != student.Group.DepartmentId`.

- [ ] **Step 10: Capabilities on the teacher form**

`DTOs/Teachers/CreateTeacherRequest.cs` and `UpdateTeacherRequest.cs`: add at the end of each class:

```csharp
    /// Design 2026-09-27 §3.
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
```

`DTOs/Teachers/TeacherResponse.cs`: add after `IsActive`:

```csharp
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
```

`DTOs/Teachers/StaffCapability.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Teachers;

/// Narrows the staff picker to teachers holding one capability (design 2026-09-27 §3). Bound from
/// the query string by name, case-insensitively: `?capability=directionManager`.
public enum StaffCapability
{
    DirectionManager,
    StandardsController
}
```

`Interfaces/ITeacherService.cs`: `SearchStaffAsync` becomes

```csharp
    Task<IReadOnlyList<StaffOptionResponse>> SearchStaffAsync(string? search, StaffCapability? capability);
```

`Services/TeacherService.cs`:

1. In `CreateTeacherAsync`, the new `AppUser` gains

```csharp
            IsDirectionManager = request.IsDirectionManager,
            IsStandardsController = request.IsStandardsController,
```

2. In `UpdateTeacherAsync`, after the e-mail uniqueness check, insert:

```csharp
        // §3: a capability in use cannot be taken away; the administrator reassigns first.
        if (user.IsDirectionManager && !request.IsDirectionManager
            && await _dbContext.Directions.AnyAsync(d => d.ManagerId == id))
        {
            return (null, StaffErrors.ManagesDirections);
        }

        if (user.IsStandardsController && !request.IsStandardsController
            && await _dbContext.GroupTasks.AnyAsync(g => g.StandardsControllerId == id))
        {
            return (null, StaffErrors.ControlsSteps);
        }
```

and after `user.Email = email;`:

```csharp
        user.IsDirectionManager = request.IsDirectionManager;
        user.IsStandardsController = request.IsStandardsController;
```

3. In `DeactivateTeacherAsync`, after the not-found check:

```csharp
        if (await _dbContext.Directions.AnyAsync(d => d.ManagerId == id))
        {
            return (false, StaffErrors.ManagesDirections);
        }

        if (await _dbContext.GroupTasks.AnyAsync(g => g.StandardsControllerId == id))
        {
            return (false, StaffErrors.ControlsSteps);
        }
```

4. `SearchStaffAsync` gains the parameter and, after the base query, the filter:

```csharp
    public async Task<IReadOnlyList<StaffOptionResponse>> SearchStaffAsync(string? search, StaffCapability? capability)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == "Teacher" || u.Role == "Admin"));

        // Design 2026-09-27 §3: the direction-manager and standards-controller pickers.
        query = capability switch
        {
            StaffCapability.DirectionManager => query.Where(u => u.Role == "Teacher" && u.IsDirectionManager),
            StaffCapability.StandardsController => query.Where(u => u.Role == "Teacher" && u.IsStandardsController),
            _ => query
        };
```

The rest of the method is unchanged.

5. `MapTeacher` gains `IsDirectionManager = user.IsDirectionManager,` and `IsStandardsController = user.IsStandardsController,`.

`Controllers/StaffController.cs`: add `using DiplomaTracker.Api.DTOs.Teachers;`, and the action becomes

```csharp
    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] string? search, [FromQuery] StaffCapability? capability)
    {
        return Ok(await _teachers.SearchStaffAsync(search, capability));
    }
```

`Models/CurrentUserResponse.cs`: add

```csharp
    public bool IsDirectionManager { get; set; }
    public bool IsStandardsController { get; set; }
```

`Services/AuthService.cs`, in `MapCurrentUser`: add `IsDirectionManager = user.IsDirectionManager,` and `IsStandardsController = user.IsStandardsController`.

- [ ] **Step 11: Seed and department guard**

`Services/DbSeeder.cs`:

1. `SeedAsync` keeps the seeded teacher: replace the teacher line with

```csharp
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", "Teacher", now);
```

and after `EnsureTaskTemplatesAsync(...)`:

```csharp
        await EnsureTeacherCapabilitiesAsync(dbContext, teacher, now);
        await EnsureDirectionAsync(dbContext, department.Id, "Software Engineering", teacher.Id, now);
```

2. Add the two methods:

```csharp
    // Design 2026-09-27 §9: the seeded teacher is a direction manager and a standards controller,
    // so the check scripts have one of each to work with.
    private static async Task EnsureTeacherCapabilitiesAsync(AppDbContext dbContext, AppUser teacher, DateTime now)
    {
        if (teacher.IsDirectionManager && teacher.IsStandardsController)
        {
            return;
        }

        teacher.IsDirectionManager = true;
        teacher.IsStandardsController = true;
        teacher.UpdatedAt = now;
        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureDirectionAsync(AppDbContext dbContext, Guid departmentId, string name, Guid managerId, DateTime now)
    {
        if (await dbContext.Directions.AnyAsync(d => d.DepartmentId == departmentId && d.Name == name))
        {
            return;
        }

        dbContext.Directions.Add(new Direction
        {
            Id = Guid.NewGuid(),
            DepartmentId = departmentId,
            Name = name,
            Description = "The seeded department's direction.",
            ManagerId = managerId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }
```

`Services/DepartmentService.cs`, in `DeleteDepartmentAsync`, after the groups check:

```csharp
        if (await _dbContext.Directions.AnyAsync(d => d.DepartmentId == id))
        {
            return (false, AcademicStructureErrors.DepartmentHasDirections);
        }
```

- [ ] **Step 12: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`. A leftover `DepartmentId` on `Topic` anywhere else shows up here. `grep -rn "\.DepartmentId" backend/DiplomaTracker.Api/Services` must list only group, student and direction uses, never a topic's.

No commit: the phase commits once, in Task 7.

---

### Task 2: Topic approval

This task makes a request wait for three approvals and adds return, resubmit, wording edits and the decision timeline. The build is green at the end.

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/ReservationDecision.cs`, `ReservationDecisionKind.cs`
- Create: `backend/DiplomaTracker.Api/Services/TopicApprovalPanel.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Topics/ReturnReservationRequest.cs`, `WordingRequest.cs`, `ApprovalSeatResponse.cs`, `ReservationDecisionResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/TopicReservation.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TopicErrors.cs`, `SecurityLog.cs`
- Replace: `backend/DiplomaTracker.Api/DTOs/Topics/ReservationResponse.cs`
- Replace: `backend/DiplomaTracker.Api/Interfaces/IReservationService.cs`, `Services/ReservationService.cs`, `Controllers/ReservationsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TopicService.cs` (`UpdateTopicAsync` and the constructor)
- Modify: `backend/DiplomaTracker.Api/Services/DirectionService.cs` (`UpdateDirectionAsync` and the constructor)
- Modify: `backend/DiplomaTracker.Api/Services/DashboardService.cs`, `DocumentTemplateService.cs`

**Interfaces:**
- Consumes: everything Task 1 produced; `ReservationStatus.Returned`.
- Produces:
  - `ReservationDecisionKind { Approved, Returned, Rejected, Edited }` and `AppDbContext.ReservationDecisions`.
  - `TopicReservation.TopicDescription`, `ContentChangedAt` and `Decisions`.
  - `TopicApprovalPanel.Seat { Administration, Direction, Supervision }`, `Evaluate(Guid supervisorId, Guid directionManagerId, DateTime contentChangedAt, IReadOnlyList<DecisionFact>)`, `SeatsOf(UserContext, Guid supervisorId, Guid directionManagerId)` and `HasOpenSeat(State, IReadOnlyList<Seat>)`.
  - `IReservationService.CompleteSatisfiedRequestsAsync(IReadOnlyCollection<Guid> topicIds)`.
  - Error constants `TopicErrors.ApprovalNotApprover`, `ApprovalSeatSatisfied` and `ReservationChanged`.
- `ReservationResponse` on the wire keeps its phase 4 fields and gains:
  - `directionId`, `directionName`, `directionManagerName`;
  - `seats: ApprovalSeatResponse[]` (`seat`, `holderName`, `isSatisfied`, `approvedByName`, `approvedAt`);
  - `timeline: ReservationDecisionResponse[]` (`kind`, `deciderName`, `comment`, `decidedAt`);
  - `returnComment`, `canDecide`, `canEditWording`, `canReject`, `canRelease`, `canResubmit`.
- Routes:
  - `GET /api/reservations/{id}`;
  - `POST /api/reservations/{id}/return` with `{ comment }`;
  - `PUT /api/reservations/{id}/wording` with `{ title, description? }`;
  - `POST /api/reservations/{id}/resubmit` with `{ title, description? }`;
  - `GET /api/reservations/pending?status=Pending|Approved&waitingForMe=true|false`.

- [ ] **Step 1: Entities**

`Entities/ReservationDecisionKind.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum ReservationDecisionKind
{
    Approved,
    Returned,
    Rejected,

    /// An approver changed the wording while the request waited. It counts as their approval and
    /// makes every earlier approval stop counting (design 2026-09-27 §5.3).
    Edited
}
```

`Entities/ReservationDecision.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// One approver's action on a topic request (design 2026-09-27 §5.1). Rows are never changed or
/// deleted while the request exists; together they are its timeline, and TopicApprovalPanel reads
/// the seats from them.
public class ReservationDecision
{
    public Guid Id { get; set; }
    public Guid ReservationId { get; set; }
    public Guid DeciderId { get; set; }

    /// Whether the decider was an administrator when deciding - the administration seat is filled
    /// by any administrator, so the role at that moment is what counts.
    public bool DeciderWasAdministrator { get; set; }
    public ReservationDecisionKind Kind { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public TopicReservation Reservation { get; set; } = null!;
    public AppUser Decider { get; set; } = null!;
}
```

`Entities/TopicReservation.cs`: add after `TopicTitle`:

```csharp
    /// The topic's description when the request was made. With TopicTitle, what a catalogue topic
    /// goes back to when the request ends without approval (§5.3).
    public string? TopicDescription { get; set; }
```

after `DecidedAt`:

```csharp
    /// When the wording last changed while the request was open - set when it is made, on every
    /// approver's edit and on the student's resubmission. Approvals older than this do not count.
    public DateTime ContentChangedAt { get; set; }
    public ICollection<ReservationDecision> Decisions { get; set; } = new List<ReservationDecision>();
```

- [ ] **Step 2: Mapping**

In `Data/AppDbContext.cs`:

1. Add the set after `TopicReservations`:

```csharp
    public DbSet<ReservationDecision> ReservationDecisions => Set<ReservationDecision>();
```

2. In the `reservation` block, after `reservation.Property(x => x.TopicTitle)...`:

```csharp
        reservation.Property(x => x.TopicDescription).HasMaxLength(4000);
        reservation.Property(x => x.ContentChangedAt).IsRequired();
```

3. The topic index filter becomes `"[TopicId] IS NOT NULL AND [Status] IN ('Pending', 'Returned', 'Approved')"`, and the pending-per-student index is replaced by the open-per-student one. The comment above them is kept, and its first sentence becomes "Two separate filters: a student holding an approved topic may have an open request at the same time."

```csharp
        reservation.HasIndex(x => x.StudentProfileId, "IX_TopicReservations_OpenPerStudent")
            .IsUnique()
            .HasFilter("[Status] IN ('Pending', 'Returned')");
```

4. After the `reservation` block:

```csharp
        var reservationDecision = modelBuilder.Entity<ReservationDecision>();
        reservationDecision.ToTable("ReservationDecisions");
        reservationDecision.HasKey(x => x.Id);
        reservationDecision.Property(x => x.Kind).HasConversion<string>().HasMaxLength(50).IsRequired();
        reservationDecision.Property(x => x.Comment).HasMaxLength(1000);
        reservationDecision.Property(x => x.DecidedAt).IsRequired();
        reservationDecision.HasIndex(x => new { x.ReservationId, x.DecidedAt });
        reservationDecision.HasIndex(x => x.DeciderId);
        reservationDecision.HasOne(x => x.Reservation)
            .WithMany(x => x.Decisions)
            .HasForeignKey(x => x.ReservationId)
            .OnDelete(DeleteBehavior.Cascade);
        reservationDecision.HasOne(x => x.Decider)
            .WithMany()
            .HasForeignKey(x => x.DeciderId)
            .OnDelete(DeleteBehavior.Restrict);
```

- [ ] **Step 3: Error codes and the log event**

`Services/TopicErrors.cs`:
- delete `ReservationNotSupervisor` and its `All` entry (replaced by `approval.notApprover`);
- add the constants

```csharp
    public const string ApprovalNotApprover = "approval.notApprover";
    public const string ApprovalSeatSatisfied = "approval.seatSatisfied";
    public const string ReservationChanged = "reservation.changed";
```

and to `All`:

```csharp
        new(ApprovalNotApprover, StatusCodes.Status403Forbidden, "You do not approve this topic request."),
        new(ApprovalSeatSatisfied, StatusCodes.Status409Conflict, "Your approval of this request is already recorded."),
        new(ReservationChanged, StatusCodes.Status409Conflict, "Someone else acted on this request first. Reload and try again."),
```

`Services/SecurityLog.cs`: add after `TopicAssigned`:

```csharp
    /// Action is Approved, Returned, Rejected, Edited, Resubmitted or Completed.
    public static void TopicRequestAction(ILogger logger, Guid actorUserId, string action, Guid reservationId) =>
        logger.LogInformation(
            "Topic request {Action}: ActorUserId={ActorUserId}, ReservationId={ReservationId}",
            action, actorUserId, reservationId);
```

- [ ] **Step 4: The evaluator**

`Services/TopicApprovalPanel.cs`:

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §5.2. A topic request has three seats, worked out when it is read and never
/// stored: any administrator, the current manager of the topic's direction, and the topic's current
/// supervisor. A seat is satisfied by an Approved or Edited decision from the right person given
/// no earlier than the request's last wording change. One person's approval fills every seat they
/// hold. Pure: callers load the facts, this decides, so every reader agrees.
public static class TopicApprovalPanel
{
    public enum Seat
    {
        Administration,
        Direction,
        Supervision
    }

    public sealed record DecisionFact(Guid DeciderId, bool DeciderWasAdministrator, ReservationDecisionKind Kind, DateTime DecidedAt);

    /// HolderId is null for the administration seat, which any administrator fills.
    public sealed record SeatState(Seat Seat, Guid? HolderId, bool IsSatisfied, Guid? ApprovedById, DateTime? ApprovedAt);

    public sealed record State(IReadOnlyList<SeatState> Seats)
    {
        public bool IsComplete => Seats.All(s => s.IsSatisfied);

        public int Satisfied => Seats.Count(s => s.IsSatisfied);
    }

    public static State Evaluate(Guid supervisorId, Guid directionManagerId, DateTime contentChangedAt, IReadOnlyList<DecisionFact> decisions)
    {
        var approvals = decisions
            .Where(d => (d.Kind == ReservationDecisionKind.Approved || d.Kind == ReservationDecisionKind.Edited)
                && d.DecidedAt >= contentChangedAt)
            .OrderByDescending(d => d.DecidedAt)
            .ToList();

        var administration = approvals.FirstOrDefault(d => d.DeciderWasAdministrator);
        var direction = approvals.FirstOrDefault(d => d.DeciderId == directionManagerId);
        var supervision = approvals.FirstOrDefault(d => d.DeciderId == supervisorId);

        return new State(
        [
            new SeatState(Seat.Administration, null, administration is not null, administration?.DeciderId, administration?.DecidedAt),
            new SeatState(Seat.Direction, directionManagerId, direction is not null, direction?.DeciderId, direction?.DecidedAt),
            new SeatState(Seat.Supervision, supervisorId, supervision is not null, supervision?.DeciderId, supervision?.DecidedAt)
        ]);
    }

    /// The seats a caller holds on a request (§5.3). Administrators hold the administration seat
    /// only; supervisors and direction managers are always teachers.
    public static IReadOnlyList<Seat> SeatsOf(UserContext user, Guid supervisorId, Guid directionManagerId)
    {
        var seats = new List<Seat>(3);
        if (user.IsAdmin)
        {
            seats.Add(Seat.Administration);
        }

        if (user.IsTeacher && directionManagerId == user.UserId)
        {
            seats.Add(Seat.Direction);
        }

        if (user.IsTeacher && supervisorId == user.UserId)
        {
            seats.Add(Seat.Supervision);
        }

        return seats;
    }

    public static bool HasOpenSeat(State state, IReadOnlyList<Seat> seats) =>
        seats.Any(seat => !state.Seats.Single(s => s.Seat == seat).IsSatisfied);
}
```

- [ ] **Step 5: Contracts**

`DTOs/Topics/ReturnReservationRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class ReturnReservationRequest
{
    /// What the student should change. Required: a whitespace-only comment fails [Required] too.
    [Required, MaxLength(1000)]
    public string Comment { get; set; } = string.Empty;
}
```

`DTOs/Topics/WordingRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

/// A topic's title and description, as an approver edits them or a returned student resubmits them.
public class WordingRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }
}
```

`DTOs/Topics/ApprovalSeatResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class ApprovalSeatResponse
{
    /// Administration, Direction or Supervision.
    public string Seat { get; set; } = string.Empty;

    /// The person who holds the seat; null for the administration seat.
    public string? HolderName { get; set; }
    public bool IsSatisfied { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTime? ApprovedAt { get; set; }
}
```

`DTOs/Topics/ReservationDecisionResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationDecisionResponse
{
    /// Approved, Returned, Rejected or Edited.
    public string Kind { get; set; } = string.Empty;
    public string DeciderName { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
}
```

Replace `DTOs/Topics/ReservationResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationResponse
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }

    /// The topic's current wording while the request is open or approved; the wording at request
    /// time for closed history.
    public string TopicTitle { get; set; } = string.Empty;
    public string? TopicDescription { get; set; }
    public string? Origin { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorName { get; set; }
    public Guid? DirectionId { get; set; }
    public string? DirectionName { get; set; }
    public string? DirectionManagerName { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentEmail { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public bool CanCancel { get; set; }

    /// True when the student has at least one Submission on any of their steps - releasing this
    /// reservation would then be refused with reservation.hasSubmissions (O1).
    public bool HasSubmissions { get; set; }

    /// The topic the student holds today, when this is an open request from a student who already
    /// has one - that is, an administrator's assignment over a held topic. Null otherwise.
    public Guid? CurrentTopicId { get; set; }
    public string? CurrentTopicTitle { get; set; }

    /// Design 2026-09-27 §5.4: the three seats of an open request (empty otherwise), and the
    /// decisions made on it, oldest first.
    public IReadOnlyList<ApprovalSeatResponse> Seats { get; set; } = [];
    public IReadOnlyList<ReservationDecisionResponse> Timeline { get; set; } = [];

    /// The comment of the return the request is waiting on, while it is Returned.
    public string? ReturnComment { get; set; }

    /// The caller holds a seat that has not approved yet and the request waits for approvers.
    public bool CanDecide { get; set; }
    public bool CanEditWording { get; set; }
    public bool CanReject { get; set; }
    public bool CanRelease { get; set; }
    public bool CanResubmit { get; set; }
}
```

- [ ] **Step 6: Replace `Interfaces/IReservationService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IReservationService
{
    Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId);
    Task<(ReservationResponse? reservation, string? error)> ProposeAsync(UserContext user, ProposeTopicRequest request);
    Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId);
    Task<(ReservationResponse? reservation, string? error)> ReturnAsync(UserContext user, Guid reservationId, ReturnReservationRequest request);
    Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> EditWordingAsync(UserContext user, Guid reservationId, WordingRequest request);
    Task<(ReservationResponse? reservation, string? error)> ResubmitAsync(UserContext user, Guid reservationId, WordingRequest request);
    Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId);
    Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> SetStudentTopicAsync(Guid studentId, Guid? topicId, Guid administratorId);
    Task<(ReservationResponse? reservation, string? error)> GetAsync(UserContext user, Guid reservationId);
    Task<(IReadOnlyList<ReservationResponse>? reservations, string? error)> GetMineAsync(UserContext user);
    Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status, bool waitingForMe);
    Task SettleReservationsForArchiveAsync(Guid studentProfileId, DateTime now);

    /// Approves every Pending request for these topics whose seats are all satisfied now - after a
    /// change of supervisor, direction or direction manager (design 2026-09-27 §5.2).
    Task CompleteSatisfiedRequestsAsync(IReadOnlyCollection<Guid> topicIds);
}
```

- [ ] **Step 7: Replace `Services/ReservationService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §5. A request holds its topic while it is open (Pending or Returned). It
/// becomes the student's topic the moment an administrator, the direction's manager and the
/// supervisor have all approved the current wording; TopicApprovalPanel decides that from the
/// ReservationDecision rows. StudentProfile.TopicId stays the single source of truth for which topic
/// a student holds - it is written only when a request completes.
public class ReservationService : IReservationService
{
    private readonly AppDbContext _dbContext;
    private readonly ITopicSettingsService _settings;
    private readonly ILogger<ReservationService> _logger;

    public ReservationService(AppDbContext dbContext, ITopicSettingsService settings, ILogger<ReservationService> logger)
    {
        _dbContext = dbContext;
        _settings = settings;
        _logger = logger;
    }

    // ---------- the student's requests ----------

    public async Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == topicId);

        if (topic is null || topic.Origin != TopicOrigin.Catalogue)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (topic.Direction.DepartmentId != student.Group.DepartmentId)
        {
            return (null, TopicErrors.TopicNotInYourDepartment);
        }

        if (topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var now = DateTime.UtcNow;
        topic.Status = TopicStatus.Reserved;
        topic.UpdatedAt = now;

        var reservation = NewRequest(topic, student, now);
        _dbContext.TopicReservations.Add(reservation);

        // Nobody holds all three seats, so a request made by a student never completes at once.
        await AddCreatorApprovalAsync(reservation, topic, now);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ProposeAsync(UserContext user, ProposeTopicRequest request)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        if (!await _dbContext.Users.AnyAsync(u => u.Id == request.SupervisorId && u.Role == "Teacher" && u.IsActive))
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }

        // §4.3: a proposal names a direction of the student's own department.
        var direction = await _dbContext.Directions
            .FirstOrDefaultAsync(d => d.Id == request.DirectionId && d.DepartmentId == student.Group.DepartmentId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = request.SupervisorId,
            DirectionId = direction.Id,
            Direction = direction,
            Origin = TopicOrigin.StudentProposal,
            Status = TopicStatus.Reserved,
            CreatedAt = now,
            UpdatedAt = now
        };

        // A proposal's creator is the student, who holds no seat: it starts with no approvals.
        var reservation = NewRequest(topic, student, now);
        _dbContext.Topics.Add(topic);
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.ReservationAlreadyActive);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    /// §5.3: the returned student edits the wording - a catalogue topic's too - and sends the
    /// request again. Every approval must then be given again, the creator's included.
    public async Task<(ReservationResponse? reservation, string? error)> ResubmitAsync(UserContext user, Guid reservationId, WordingRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (reservation.Status != ReservationStatus.Returned || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Topic.Title = request.Title.Trim();
        reservation.Topic.Description = IdentityNormalizer.Optional(request.Description);
        reservation.Topic.UpdatedAt = now;
        reservation.ContentChangedAt = now;
        reservation.Status = ReservationStatus.Pending;

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Resubmitted", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForActionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (!IsOpen(reservation.Status) || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        // The deadline blocks cancelling a first request, but not one made while the student
        // already holds a topic. Checked after the state, so cancelling a closed request is always
        // reported as an invalid state rather than a closed selection.
        if (!await _settings.IsSelectionOpenAsync()
            && !await HasApprovedReservationAsync(reservation.StudentProfileId))
        {
            return (null, TopicErrors.SelectionClosed);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Status = ReservationStatus.Cancelled;
        reservation.DecidedAt = now;
        CloseWithoutApproval(reservation, now);

        return await CommitAsync(transaction, reservation.Id, user);
    }

    // ---------- the approvers ----------

    public async Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (seats, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        if (!TopicApprovalPanel.HasOpenSeat(Evaluate(reservation), seats))
        {
            return (null, TopicErrors.ApprovalSeatSatisfied);
        }

        if (!reservation.Topic!.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        var decision = AddDecision(reservation, user, ReservationDecisionKind.Approved, null, now);
        reservation.Topic.UpdatedAt = now;

        var completes = Evaluate(reservation, decision).IsComplete;
        if (completes)
        {
            var completeError = await CompleteAsync(reservation, now);
            if (completeError is not null)
            {
                return (null, completeError);
            }
        }

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, completes ? "Completed" : "Approved", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReturnAsync(UserContext user, Guid reservationId, ReturnReservationRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (seats, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        // A return is an approver's decision in an open seat, like an approval (§5.3).
        if (!TopicApprovalPanel.HasOpenSeat(Evaluate(reservation), seats))
        {
            return (null, TopicErrors.ApprovalSeatSatisfied);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        AddDecision(reservation, user, ReservationDecisionKind.Returned, request.Comment.Trim(), now);
        reservation.Status = ReservationStatus.Returned;
        reservation.Topic!.UpdatedAt = now;

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Returned", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (!IsOpen(reservation!.Status))
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        var now = DateTime.UtcNow;
        var comment = IdentityNormalizer.Optional(request.Comment);
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        AddDecision(reservation, user, ReservationDecisionKind.Rejected, comment, now);
        reservation.Status = ReservationStatus.Rejected;
        reservation.DecisionComment = comment;
        reservation.DecidedAt = now;
        CloseWithoutApproval(reservation, now);

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Rejected", reservationId);
        }

        return result;
    }

    /// §5.3: an approver edits the wording while the request waits. The edit is their approval,
    /// and every other seat must approve the new wording. It never completes the request: nobody
    /// holds all three seats, so at least one is left open.
    public async Task<(ReservationResponse? reservation, string? error)> EditWordingAsync(UserContext user, Guid reservationId, WordingRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Topic!.Title = request.Title.Trim();
        reservation.Topic.Description = IdentityNormalizer.Optional(request.Description);
        reservation.Topic.UpdatedAt = now;
        reservation.ContentChangedAt = now;
        AddDecision(reservation, user, ReservationDecisionKind.Edited, null, now);

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Edited", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Approved)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        // O1: a topic cannot be taken away once the student has submitted a step.
        if (await HasSubmissionsAsync(reservation.StudentProfileId))
        {
            return (null, TopicErrors.ReservationHasSubmissions);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Status = ReservationStatus.Released;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        reservation.StudentProfile.TopicId = null;
        reservation.StudentProfile.SupervisorId = null;
        reservation.StudentProfile.UpdatedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await CommitAsync(transaction, reservation.Id, user);
    }

    /// <summary>
    /// The administrator's assignment from the student form (§5.3). Whatever the student had asked
    /// for is withdrawn, and a new request is made carrying the administrator's approval and the
    /// topic creator's. A topic the student already holds stays theirs until the new request
    /// completes, which may be at once when the creator's seats cover the rest. A null
    /// <paramref name="topicId"/> clears the student's topic and supervisor at once, as before.
    /// </summary>
    public async Task<(ReservationResponse? reservation, string? error)> SetStudentTopicAsync(Guid studentId, Guid? topicId, Guid administratorId)
    {
        var student = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .Include(p => p.Group)
            .FirstOrDefaultAsync(p => p.Id == studentId && p.User.Role == "Student");

        if (student is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        if (student.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        // O1: only a removal to "no topic" is guarded; replacing the topic stays allowed.
        if (topicId is null && student.TopicId is not null && await HasSubmissionsAsync(student.Id))
        {
            return (null, TopicErrors.ReservationHasSubmissions);
        }

        Topic? topic = null;
        if (topicId is not null)
        {
            topic = await _dbContext.Topics
                .Include(t => t.Supervisor)
                .Include(t => t.Direction)
                .FirstOrDefaultAsync(t => t.Id == topicId.Value);

            // topicId is a request-body field: an unknown value is 400, never the 404 the same
            // endpoint uses for an unknown student id in the URL.
            if (topic is null)
            {
                return (null, TopicErrors.TopicInvalid);
            }

            if (topic.Id == student.TopicId)
            {
                return (null, TopicErrors.TopicAlreadyYours);
            }

            if (topic.Direction.DepartmentId != student.Group.DepartmentId)
            {
                return (null, TopicErrors.TopicNotInYourDepartment);
            }

            if (topic.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
            {
                return (null, TopicErrors.TopicNotAvailable);
            }
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        await CancelOpenRequestAsync(student.Id, now);

        if (topic is null)
        {
            await ReleaseCurrentTopicAsync(student.Id, now, null);
            student.TopicId = null;
            student.SupervisorId = null;
            student.UpdatedAt = now;

            var clearConflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
            if (clearConflict is not null)
            {
                return (null, clearConflict);
            }

            await transaction.CommitAsync();
            SecurityLog.TopicAssigned(_logger, student.Id, administratorId, null);
            return (null, null);
        }

        // Two phases, as everywhere a student's reservation is replaced: the withdrawn request is
        // saved before the new open one is inserted under IX_TopicReservations_OpenPerStudent,
        // because EF picks its own statement order within one save.
        var phase1Conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (phase1Conflict is not null)
        {
            return (null, phase1Conflict);
        }

        topic.Status = TopicStatus.Reserved;
        topic.UpdatedAt = now;
        var reservation = NewRequest(topic, student, now);
        _dbContext.TopicReservations.Add(reservation);

        var administration = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = administratorId,
            DeciderWasAdministrator = true,
            Kind = ReservationDecisionKind.Approved,
            DecidedAt = now
        };
        _dbContext.ReservationDecisions.Add(administration);
        var creator = await AddCreatorApprovalAsync(reservation, topic, now);

        var added = creator is null ? new[] { administration } : new[] { administration, creator };
        if (Evaluate(reservation, added).IsComplete)
        {
            var completeError = await CompleteAsync(reservation, now);
            if (completeError is not null)
            {
                return (null, completeError);
            }
        }

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        await transaction.CommitAsync();
        SecurityLog.TopicAssigned(_logger, student.Id, administratorId, topic.Id);

        _dbContext.ChangeTracker.Clear();
        return (await LoadResponseAsync(reservation.Id, new UserContext(administratorId, "Admin")), null);
    }

    public async Task CompleteSatisfiedRequestsAsync(IReadOnlyCollection<Guid> topicIds)
    {
        if (topicIds.Count == 0)
        {
            return;
        }

        var ids = await _dbContext.TopicReservations.AsNoTracking()
            .Where(r => r.TopicId != null && topicIds.Contains(r.TopicId.Value) && r.Status == ReservationStatus.Pending)
            .Select(r => r.Id)
            .ToListAsync();

        foreach (var id in ids)
        {
            _dbContext.ChangeTracker.Clear();
            var reservation = await LoadForActionAsync(id);
            if (reservation?.Topic is null
                || reservation.StudentProfile.ArchivedAt is not null
                || !Evaluate(reservation).IsComplete)
            {
                continue;
            }

            var now = DateTime.UtcNow;
            await using var transaction = await _dbContext.Database.BeginTransactionAsync();
            if (await CompleteAsync(reservation, now) is not null)
            {
                continue;
            }

            reservation.Topic.UpdatedAt = now;
            try
            {
                await _dbContext.SaveChangesAsync();
                await transaction.CommitAsync();
                SecurityLog.TopicRequestAction(_logger, Guid.Empty, "Completed", id);
            }
            catch (DbUpdateException)
            {
                // Someone acted on the request at the same moment; their own save decides it.
                _dbContext.ChangeTracker.Clear();
            }
        }

        _dbContext.ChangeTracker.Clear();
    }

    /// Cancels an open request and releases an approved topic for a student who is being
    /// archived, so an archived profile never keeps a live reservation. Does not save - the caller
    /// commits, in the same save as archiving the profile.
    public async Task SettleReservationsForArchiveAsync(Guid studentProfileId, DateTime now)
    {
        await CancelOpenRequestAsync(studentProfileId, now);
        await ReleaseCurrentTopicAsync(studentProfileId, now, null);
    }

    // ---------- reads ----------

    public async Task<(ReservationResponse? reservation, string? error)> GetAsync(UserContext user, Guid reservationId)
    {
        var row = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.Id == reservationId))
            .FirstOrDefaultAsync();

        var visible = row is not null
            && (user.IsAdmin
                || (user.IsStudent && row.StudentUserId == user.UserId)
                || (user.IsTeacher && (row.SupervisorId == user.UserId || row.DirectionManagerId == user.UserId)));

        if (!visible)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        return (await ToResponseAsync(row!, user), null);
    }

    public async Task<(IReadOnlyList<ReservationResponse>? reservations, string? error)> GetMineAsync(UserContext user)
    {
        var studentId = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == user.UserId)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync();

        if (studentId is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        // A student who already holds a topic may cancel an open request after the deadline - the
        // deadline governs choosing a topic, not revising the choice.
        var selectionOpen = await _settings.IsSelectionOpenAsync() || await HasApprovedReservationAsync(studentId.Value);
        var rows = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.StudentProfileId == studentId))
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, user, selectionOpen && IsOpen(row.Status))).ToList(), null);
    }

    /// §5.4. "Pending" asks for every open request - those waiting for approvers and those returned
    /// to the student. A teacher sees requests for topics they supervise and, as a direction
    /// manager, every request in their directions. An administrator sees them all, including the
    /// history of proposals whose topic was deleted by design.
    public async Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status, bool waitingForMe)
    {
        var me = user.UserId;
        IQueryable<TopicReservation> query = _dbContext.TopicReservations.AsNoTracking();

        query = status is ReservationStatus.Pending or ReservationStatus.Returned
            ? query.Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned)
            : query.Where(r => r.Status == status);

        if (!user.IsAdmin)
        {
            query = query.Where(r => r.Topic != null && (r.Topic.SupervisorId == me || r.Topic.Direction.ManagerId == me));
        }

        var rows = await Project(query).OrderBy(r => r.CreatedAt).ToListAsync();
        var responses = rows.Select(row => ToResponse(row, user, canCancel: false));
        return (waitingForMe ? responses.Where(r => r.CanDecide) : responses).ToList();
    }

    // ---------- helpers ----------

    private static bool IsOpen(ReservationStatus status) =>
        status is ReservationStatus.Pending or ReservationStatus.Returned;

    private static TopicReservation NewRequest(Topic topic, StudentProfile student, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        TopicId = topic.Id,
        Topic = topic,
        TopicTitle = topic.Title,
        TopicDescription = topic.Description,
        StudentProfileId = student.Id,
        StudentProfile = student,
        Status = ReservationStatus.Pending,
        CreatedAt = now,
        ContentChangedAt = now
    };

    private ReservationDecision AddDecision(TopicReservation reservation, UserContext user, ReservationDecisionKind kind, string? comment, DateTime now)
    {
        var decision = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = user.UserId,
            DeciderWasAdministrator = user.IsAdmin,
            Kind = kind,
            Comment = comment,
            DecidedAt = now
        };

        // Added through its DbSet, never only through the tracked parent's collection: a child with
        // a preset key reached through a navigation is taken for an existing row (PROJECT_MEMORY).
        _dbContext.ReservationDecisions.Add(decision);
        return decision;
    }

    /// §5.2: the topic's creator has already approved it in every seat they hold - a teacher who
    /// supervises what they created, a direction manager in their own direction, an administrator.
    /// Only an active creator counts. Returns the row, or null when the creator holds no seat.
    private async Task<ReservationDecision?> AddCreatorApprovalAsync(TopicReservation reservation, Topic topic, DateTime now)
    {
        if (topic.CreatedById is not { } creatorId)
        {
            return null;
        }

        var creator = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == creatorId && u.IsActive)
            .Select(u => new { u.Role })
            .FirstOrDefaultAsync();
        if (creator is null)
        {
            return null;
        }

        var isAdministrator = creator.Role == "Admin";
        var holdsSeat = isAdministrator || creatorId == topic.SupervisorId || creatorId == topic.Direction.ManagerId;
        if (!holdsSeat)
        {
            return null;
        }

        var decision = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = creatorId,
            DeciderWasAdministrator = isAdministrator,
            Kind = ReservationDecisionKind.Approved,
            DecidedAt = now
        };
        _dbContext.ReservationDecisions.Add(decision);
        return decision;
    }

    /// The seats of a loaded request, counting decisions just added in this unit of work. EF may
    /// or may not have fixed them up into reservation.Decisions yet, hence the de-duplication.
    private static TopicApprovalPanel.State Evaluate(TopicReservation reservation, params ReservationDecision[] added)
    {
        var decisions = reservation.Decisions
            .Concat(added)
            .DistinctBy(d => d.Id)
            .Select(d => new TopicApprovalPanel.DecisionFact(d.DeciderId, d.DeciderWasAdministrator, d.Kind, d.DecidedAt))
            .ToList();

        return TopicApprovalPanel.Evaluate(reservation.Topic!.SupervisorId, reservation.Topic.Direction.ManagerId, reservation.ContentChangedAt, decisions);
    }

    /// §5.2: every seat is satisfied - the request becomes the student's topic. A topic the student
    /// already holds is released first, in its own save inside the caller's transaction: both rows
    /// belong to the same student under IX_TopicReservations_ApprovedPerStudent, and one save
    /// would transiently violate it whenever EF emits the new row's UPDATE first.
    private async Task<string?> CompleteAsync(TopicReservation reservation, DateTime now)
    {
        await ReleaseCurrentTopicAsync(reservation.StudentProfileId, now, null);
        var phase1Conflict = await SaveRequestAsync(reservation.StudentProfileId, TopicErrors.ReservationChanged);
        if (phase1Conflict is not null)
        {
            return phase1Conflict;
        }

        reservation.Status = ReservationStatus.Approved;
        reservation.DecidedAt = now;
        reservation.Topic!.Status = TopicStatus.Approved;
        reservation.Topic.UpdatedAt = now;
        reservation.StudentProfile.TopicId = reservation.Topic.Id;
        reservation.StudentProfile.SupervisorId = reservation.Topic.SupervisorId;
        reservation.StudentProfile.UpdatedAt = now;
        return null;
    }

    private static (IReadOnlyList<TopicApprovalPanel.Seat> seats, string? error) CheckApprover(UserContext user, TopicReservation? reservation)
    {
        if (reservation is null)
        {
            return ([], TopicErrors.ReservationNotFound);
        }

        if (reservation.Topic is null)
        {
            return ([], TopicErrors.ReservationInvalidState);
        }

        var seats = TopicApprovalPanel.SeatsOf(user, reservation.Topic.SupervisorId, reservation.Topic.Direction.ManagerId);
        return seats.Count == 0 ? (seats, TopicErrors.ApprovalNotApprover) : (seats, null);
    }

    private async Task<TopicReservation?> LoadForActionAsync(Guid reservationId)
    {
        return await _dbContext.TopicReservations
            .Include(r => r.Topic).ThenInclude(t => t!.Supervisor)
            .Include(r => r.Topic).ThenInclude(t => t!.Direction)
            .Include(r => r.StudentProfile)
            .Include(r => r.Decisions)
            .FirstOrDefaultAsync(r => r.Id == reservationId);
    }

    private async Task<StudentProfile?> LoadStudentForActionAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles
            .Include(p => p.Group)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.UserId == userId && p.User.Role == "Student" && p.User.IsActive);
    }

    /// A student with no topic may ask for one while nothing of theirs is open. A student who holds
    /// a topic cannot file another request; only an administrator replaces it (task 7 bug 9).
    private async Task<string?> CheckStudentMayRequestAsync(StudentProfile student)
    {
        if (student.TopicId is not null)
        {
            return TopicErrors.ReservationTopicHeld;
        }

        if (await HasOpenRequestAsync(student.Id))
        {
            return TopicErrors.ReservationAlreadyActive;
        }

        if (!await _settings.IsSelectionOpenAsync())
        {
            return TopicErrors.SelectionClosed;
        }

        return null;
    }

    private Task<bool> HasOpenRequestAsync(Guid studentProfileId) =>
        _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned));

    private Task<bool> HasApprovedReservationAsync(Guid studentProfileId) =>
        _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && r.Status == ReservationStatus.Approved);

    /// O1: whether the student has at least one Submission on any of their steps.
    private Task<bool> HasSubmissionsAsync(Guid studentProfileId) =>
        _dbContext.Submissions.AnyAsync(s => s.StudentTask.StudentProfileId == studentProfileId);

    /// Withdraws a student's open request - an administrator decided instead, or the student is
    /// being archived. The caller saves.
    private async Task CancelOpenRequestAsync(Guid studentProfileId, DateTime now)
    {
        var open = await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .FirstOrDefaultAsync(r => r.StudentProfileId == studentProfileId
                && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned));
        if (open is null)
        {
            return;
        }

        open.Status = ReservationStatus.Cancelled;
        open.DecidedAt = now;
        if (open.Topic is not null)
        {
            CloseWithoutApproval(open, now);
        }
    }

    /// Settles the approved topic a student is leaving behind: the reservation becomes Released, a
    /// catalogue topic returns to Available (keeping its wording) and a proposal is deleted. Clears
    /// the student's TopicId/SupervisorId in the same pass, because StudentProfile.Topic is
    /// Restrict and the deleted proposal must not still be referenced. The caller saves.
    private async Task ReleaseCurrentTopicAsync(Guid studentProfileId, DateTime now, string? comment)
    {
        var current = await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .Include(r => r.StudentProfile)
            .FirstOrDefaultAsync(r => r.StudentProfileId == studentProfileId
                && r.Status == ReservationStatus.Approved);
        if (current is null)
        {
            return;
        }

        current.Status = ReservationStatus.Released;
        current.DecisionComment = comment;
        current.DecidedAt = now;
        current.StudentProfile.TopicId = null;
        current.StudentProfile.SupervisorId = null;
        current.StudentProfile.UpdatedAt = now;

        if (current.Topic is not null)
        {
            ReturnOrRemoveTopic(current.Topic, now);
        }
    }

    /// §5.3: a request that ends without approval (rejected or cancelled). A proposal is deleted; a
    /// catalogue topic goes back to the catalogue with the wording it had when the request was
    /// made, so nobody's edits during an unfinished request change the catalogue.
    private void CloseWithoutApproval(TopicReservation reservation, DateTime now)
    {
        var topic = reservation.Topic!;
        if (topic.Origin == TopicOrigin.StudentProposal)
        {
            _dbContext.Topics.Remove(topic);
            return;
        }

        topic.Title = reservation.TopicTitle;
        topic.Description = reservation.TopicDescription;
        topic.Status = TopicStatus.Available;
        topic.UpdatedAt = now;
    }

    /// A released topic: a proposal disappears, a catalogue topic keeps its current wording.
    private void ReturnOrRemoveTopic(Topic topic, DateTime now)
    {
        if (topic.Origin == TopicOrigin.StudentProposal)
        {
            _dbContext.Topics.Remove(topic);
            return;
        }

        topic.Status = TopicStatus.Available;
        topic.UpdatedAt = now;
    }

    private async Task<string?> SaveRequestAsync(Guid studentProfileId, string topicConflictError)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return topicConflictError;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();

            // Two concurrent requests from the same student both pass CheckStudentMayRequestAsync
            // before either inserts; the open-per-student index turns the second into this.
            return await HasOpenRequestAsync(studentProfileId)
                ? TopicErrors.ReservationAlreadyActive
                : topicConflictError;
        }
    }

    private async Task<(ReservationResponse? reservation, string? error)> CommitAsync(IDbContextTransaction transaction, Guid reservationId, UserContext user)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return (null, TopicErrors.ReservationChanged);
        }

        await transaction.CommitAsync();
        _dbContext.ChangeTracker.Clear();
        return (await LoadResponseAsync(reservationId, user), null);
    }

    private async Task<ReservationResponse?> LoadResponseAsync(Guid reservationId, UserContext user)
    {
        var row = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.Id == reservationId))
            .FirstOrDefaultAsync();
        return row is null ? null : await ToResponseAsync(row, user);
    }

    private async Task<ReservationResponse> ToResponseAsync(ReservationRow row, UserContext user)
    {
        var canCancel = user.IsStudent
            && row.StudentUserId == user.UserId
            && IsOpen(row.Status)
            && (await _settings.IsSelectionOpenAsync() || await HasApprovedReservationAsync(row.StudentProfileId));
        return ToResponse(row, user, canCancel);
    }

    private static IQueryable<ReservationRow> Project(IQueryable<TopicReservation> source) =>
        source.Select(r => new ReservationRow
        {
            Id = r.Id,
            TopicId = r.TopicId,
            SnapshotTitle = r.TopicTitle,
            SnapshotDescription = r.TopicDescription,
            LiveTitle = r.Topic != null ? r.Topic.Title : null,
            LiveDescription = r.Topic != null ? r.Topic.Description : null,
            Origin = r.Topic != null ? (TopicOrigin?)r.Topic.Origin : null,
            SupervisorId = r.Topic != null ? (Guid?)r.Topic.SupervisorId : null,
            SupervisorLastName = r.Topic != null ? r.Topic.Supervisor.LastName : null,
            SupervisorFirstName = r.Topic != null ? r.Topic.Supervisor.FirstName : null,
            SupervisorPatronymic = r.Topic != null ? r.Topic.Supervisor.Patronymic : null,
            DirectionId = r.Topic != null ? (Guid?)r.Topic.DirectionId : null,
            DirectionName = r.Topic != null ? r.Topic.Direction.Name : null,
            DirectionManagerId = r.Topic != null ? (Guid?)r.Topic.Direction.ManagerId : null,
            DirectionManagerLastName = r.Topic != null ? r.Topic.Direction.Manager.LastName : null,
            DirectionManagerFirstName = r.Topic != null ? r.Topic.Direction.Manager.FirstName : null,
            DirectionManagerPatronymic = r.Topic != null ? r.Topic.Direction.Manager.Patronymic : null,
            StudentProfileId = r.StudentProfileId,
            StudentUserId = r.StudentProfile.UserId,
            StudentLastName = r.StudentProfile.User.LastName,
            StudentFirstName = r.StudentProfile.User.FirstName,
            StudentPatronymic = r.StudentProfile.User.Patronymic,
            StudentEmail = r.StudentProfile.User.Email,
            GroupCode = r.StudentProfile.Group.Code,
            Status = r.Status,
            DecisionComment = r.DecisionComment,
            CreatedAt = r.CreatedAt,
            DecidedAt = r.DecidedAt,
            ContentChangedAt = r.ContentChangedAt,
            StudentCurrentTopicId = r.StudentProfile.TopicId,
            StudentCurrentTopicTitle = r.StudentProfile.Topic != null ? r.StudentProfile.Topic.Title : null,
            HasSubmissions = r.StudentProfile.StudentTasks.Any(t => t.Submissions.Any()),
            Decisions = r.Decisions
                .OrderBy(d => d.DecidedAt)
                .Select(d => new DecisionRow
                {
                    DeciderId = d.DeciderId,
                    DeciderWasAdministrator = d.DeciderWasAdministrator,
                    Kind = d.Kind,
                    Comment = d.Comment,
                    DecidedAt = d.DecidedAt,
                    LastName = d.Decider.LastName,
                    FirstName = d.Decider.FirstName,
                    Patronymic = d.Decider.Patronymic
                })
                .ToList()
        });

    private static ReservationResponse ToResponse(ReservationRow row, UserContext user, bool canCancel)
    {
        var isOpen = IsOpen(row.Status);
        var isLive = isOpen || row.Status == ReservationStatus.Approved;
        var isChangeRequest = isOpen && row.StudentCurrentTopicId is not null && row.StudentCurrentTopicId != row.TopicId;

        var supervisorName = row.SupervisorId is null ? null : PersonName.Full(row.SupervisorLastName ?? "", row.SupervisorFirstName ?? "", row.SupervisorPatronymic);
        var managerName = row.DirectionManagerId is null ? null : PersonName.Full(row.DirectionManagerLastName ?? "", row.DirectionManagerFirstName ?? "", row.DirectionManagerPatronymic);

        IReadOnlyList<TopicApprovalPanel.Seat> callerSeats = row.SupervisorId is { } supervisorId && row.DirectionManagerId is { } managerId
            ? TopicApprovalPanel.SeatsOf(user, supervisorId, managerId)
            : [];

        TopicApprovalPanel.State? state = isOpen && row.SupervisorId is { } openSupervisorId && row.DirectionManagerId is { } openManagerId
            ? TopicApprovalPanel.Evaluate(
                openSupervisorId,
                openManagerId,
                row.ContentChangedAt,
                row.Decisions.Select(d => new TopicApprovalPanel.DecisionFact(d.DeciderId, d.DeciderWasAdministrator, d.Kind, d.DecidedAt)).ToList())
            : null;

        string? NameOf(Guid? deciderId) => row.Decisions.FirstOrDefault(d => d.DeciderId == deciderId) is { } decision
            ? PersonName.Full(decision.LastName, decision.FirstName, decision.Patronymic)
            : null;

        return new ReservationResponse
        {
            Id = row.Id,
            TopicId = row.TopicId,
            TopicTitle = isLive && row.LiveTitle is not null ? row.LiveTitle : row.SnapshotTitle,
            TopicDescription = isLive && row.TopicId is not null ? row.LiveDescription : row.SnapshotDescription,
            Origin = row.Origin?.ToString(),
            SupervisorId = row.SupervisorId,
            SupervisorName = supervisorName,
            DirectionId = row.DirectionId,
            DirectionName = row.DirectionName,
            DirectionManagerName = managerName,
            StudentProfileId = row.StudentProfileId,
            StudentName = PersonName.Full(row.StudentLastName, row.StudentFirstName, row.StudentPatronymic),
            StudentEmail = row.StudentEmail,
            GroupCode = row.GroupCode,
            Status = row.Status.ToString(),
            DecisionComment = row.DecisionComment,
            CreatedAt = row.CreatedAt,
            DecidedAt = row.DecidedAt,
            CanCancel = canCancel,
            HasSubmissions = row.HasSubmissions,
            CurrentTopicId = isChangeRequest ? row.StudentCurrentTopicId : null,
            CurrentTopicTitle = isChangeRequest ? row.StudentCurrentTopicTitle : null,
            Seats = state?.Seats.Select(seat => new ApprovalSeatResponse
            {
                Seat = seat.Seat.ToString(),
                HolderName = seat.Seat switch
                {
                    TopicApprovalPanel.Seat.Direction => managerName,
                    TopicApprovalPanel.Seat.Supervision => supervisorName,
                    _ => null
                },
                IsSatisfied = seat.IsSatisfied,
                ApprovedByName = seat.IsSatisfied ? NameOf(seat.ApprovedById) : null,
                ApprovedAt = seat.ApprovedAt
            }).ToList() ?? [],
            Timeline = row.Decisions.Select(d => new ReservationDecisionResponse
            {
                Kind = d.Kind.ToString(),
                DeciderName = PersonName.Full(d.LastName, d.FirstName, d.Patronymic),
                Comment = d.Comment,
                DecidedAt = d.DecidedAt
            }).ToList(),
            ReturnComment = row.Status == ReservationStatus.Returned
                ? row.Decisions.LastOrDefault(d => d.Kind == ReservationDecisionKind.Returned)?.Comment
                : null,
            CanDecide = row.Status == ReservationStatus.Pending && state is not null && TopicApprovalPanel.HasOpenSeat(state, callerSeats),
            CanEditWording = row.Status == ReservationStatus.Pending && callerSeats.Count > 0,
            CanReject = isOpen && callerSeats.Count > 0,
            CanRelease = row.Status == ReservationStatus.Approved && callerSeats.Count > 0,
            CanResubmit = user.IsStudent && row.StudentUserId == user.UserId && row.Status == ReservationStatus.Returned
        };
    }

    private sealed class ReservationRow
    {
        public Guid Id { get; init; }
        public Guid? TopicId { get; init; }
        public string SnapshotTitle { get; init; } = string.Empty;
        public string? SnapshotDescription { get; init; }
        public string? LiveTitle { get; init; }
        public string? LiveDescription { get; init; }
        public TopicOrigin? Origin { get; init; }
        public Guid? SupervisorId { get; init; }
        public string? SupervisorLastName { get; init; }
        public string? SupervisorFirstName { get; init; }
        public string? SupervisorPatronymic { get; init; }
        public Guid? DirectionId { get; init; }
        public string? DirectionName { get; init; }
        public Guid? DirectionManagerId { get; init; }
        public string? DirectionManagerLastName { get; init; }
        public string? DirectionManagerFirstName { get; init; }
        public string? DirectionManagerPatronymic { get; init; }
        public Guid StudentProfileId { get; init; }
        public Guid StudentUserId { get; init; }
        public string StudentLastName { get; init; } = string.Empty;
        public string StudentFirstName { get; init; } = string.Empty;
        public string? StudentPatronymic { get; init; }
        public string StudentEmail { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;
        public ReservationStatus Status { get; init; }
        public string? DecisionComment { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? DecidedAt { get; init; }
        public DateTime ContentChangedAt { get; init; }
        public Guid? StudentCurrentTopicId { get; init; }
        public string? StudentCurrentTopicTitle { get; init; }
        public bool HasSubmissions { get; init; }
        public List<DecisionRow> Decisions { get; init; } = [];
    }

    private sealed class DecisionRow
    {
        public Guid DeciderId { get; init; }
        public bool DeciderWasAdministrator { get; init; }
        public ReservationDecisionKind Kind { get; init; }
        public string? Comment { get; init; }
        public DateTime DecidedAt { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string? Patronymic { get; init; }
    }
}
```

- [ ] **Step 8: Replace `Controllers/ReservationsController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/reservations")]
[Authorize]
public class ReservationsController : ApiControllerBase
{
    private readonly IReservationService _reservationService;

    public ReservationsController(IReservationService reservationService)
    {
        _reservationService = reservationService;
    }

    [Authorize(Roles = "Student")]
    [HttpPost("/api/topics/{topicId:guid}/reserve")]
    public Task<IActionResult> Reserve(Guid topicId) =>
        Run(user => _reservationService.ReserveAsync(user, topicId));

    [Authorize(Roles = "Student")]
    [HttpPost("/api/topics/proposals")]
    public Task<IActionResult> Propose([FromBody] ProposeTopicRequest request) =>
        Run(user => _reservationService.ProposeAsync(user, request));

    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid id) =>
        Run(user => _reservationService.GetAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/approve")]
    public Task<IActionResult> Approve(Guid id) =>
        Run(user => _reservationService.ApproveAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/return")]
    public Task<IActionResult> Return(Guid id, [FromBody] ReturnReservationRequest request) =>
        Run(user => _reservationService.ReturnAsync(user, id, request));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id, [FromBody] DecisionRequest? request) =>
        Run(user => _reservationService.RejectAsync(user, id, request ?? new DecisionRequest()));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}/wording")]
    public Task<IActionResult> EditWording(Guid id, [FromBody] WordingRequest request) =>
        Run(user => _reservationService.EditWordingAsync(user, id, request));

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/resubmit")]
    public Task<IActionResult> Resubmit(Guid id, [FromBody] WordingRequest request) =>
        Run(user => _reservationService.ResubmitAsync(user, id, request));

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid id) =>
        Run(user => _reservationService.CancelAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/release")]
    public Task<IActionResult> Release(Guid id, [FromBody] DecisionRequest? request) =>
        Run(user => _reservationService.ReleaseAsync(user, id, request ?? new DecisionRequest()));

    [Authorize(Roles = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reservations, error) = await _reservationService.GetMineAsync(user);
        return reservations is null ? ErrorResult(error) : Ok(reservations);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("pending")]
    public async Task<IActionResult> ForDecision(
        [FromQuery] ReservationStatus status = ReservationStatus.Pending,
        [FromQuery] bool waitingForMe = false)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _reservationService.GetForDecisionAsync(user, status, waitingForMe));
    }

    private async Task<IActionResult> Run(Func<Services.UserContext, Task<(ReservationResponse? reservation, string? error)>> action)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reservation, error) = await action(user);
        return reservation is null ? ErrorResult(error) : Ok(reservation);
    }
}
```

The route `{id:guid}` does not clash with `mine` or `pending`, because both are literal segments and the GUID constraint rejects them.

- [ ] **Step 9: Completion after a change of supervisor, direction or manager**

`Services/TopicService.cs`:

1. The constructor takes the reservation service:

```csharp
    private readonly AppDbContext _dbContext;
    private readonly IReservationService _reservations;
    private readonly ILogger<TopicService> _logger;

    public TopicService(AppDbContext dbContext, IReservationService reservations, ILogger<TopicService> logger)
    {
        _dbContext = dbContext;
        _reservations = reservations;
        _logger = logger;
    }
```

2. In `UpdateTopicAsync`, directly before `editable.Title = request.Title.Trim();`, insert:

```csharp
        var title = request.Title.Trim();
        var description = IdentityNormalizer.Optional(request.Description);
        var supervisorChanged = supervisorId != editable.SupervisorId;
        var directionChanged = direction.Id != editable.DirectionId;

        // Design 2026-09-27 §5.3: while a request waits for approvals, a change of wording counts
        // as the editor's approval and every other seat must approve the new wording. Only an
        // administrator reaches here for a Reserved topic - teachers edit available topics only.
        // After approval nothing reopens.
        if ((title != editable.Title || description != editable.Description) && editable.Status == TopicStatus.Reserved)
        {
            var open = await _dbContext.TopicReservations
                .FirstOrDefaultAsync(r => r.TopicId == editable.Id && r.Status == ReservationStatus.Pending);
            if (open is not null)
            {
                open.ContentChangedAt = now;
                _dbContext.ReservationDecisions.Add(new ReservationDecision
                {
                    Id = Guid.NewGuid(),
                    ReservationId = open.Id,
                    DeciderId = user.UserId,
                    DeciderWasAdministrator = user.IsAdmin,
                    Kind = ReservationDecisionKind.Edited,
                    DecidedAt = now
                });
            }
        }
```

and change the two assignments that follow to `editable.Title = title;` and `editable.Description = description;`.

3. Directly before the final `return await GetTopicAsync(user, editable.Id);` of `UpdateTopicAsync`, insert:

```csharp
        // §5.2: the new supervisor or the new direction's manager may already have approved the
        // current wording, which would complete the request now.
        if ((supervisorChanged || directionChanged) && editable.Status == TopicStatus.Reserved)
        {
            await _reservations.CompleteSatisfiedRequestsAsync([editable.Id]);
        }
```

`Services/DirectionService.cs`:

1. The constructor takes `IReservationService reservations` between `dbContext` and `logger`, stored in `private readonly IReservationService _reservations;`.

2. In `UpdateDirectionAsync`, declare `var managerChanged = false;` before the `if (request.ManagerId is { } managerId ...)` block, and set `managerChanged = true;` after `editable.ManagerId = managerId;`.

3. Directly before the final `return await GetDirectionAsync(user, editable.Id);`, insert:

```csharp
        if (managerChanged)
        {
            // §4.2: the new manager may already have approved some of the direction's open requests.
            var reservedTopicIds = await _dbContext.Topics
                .Where(t => t.DirectionId == editable.Id && t.Status == TopicStatus.Reserved)
                .Select(t => t.Id)
                .ToListAsync();
            await _reservations.CompleteSatisfiedRequestsAsync(reservedTopicIds);
        }
```

- [ ] **Step 10: Other readers of an open request**

`Services/DashboardService.cs`, in `GetAdminAsync`, the `withRequest` count becomes

```csharp
        var withRequest = await students.CountAsync(p =>
            p.TopicId == null && p.TopicReservations.Any(r =>
                r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned));
```

`Services/DocumentTemplateService.cs`: both `r.Status == ReservationStatus.Pending` conditions (the explicit-topic check near line 622 and `DefaultTopicAsync` near line 681) become `(r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned)`. A returned student can still generate documents for the topic they asked for.

- [ ] **Step 11: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

```bash
grep -rn "ReservationNotSupervisor\|TopicDepartmentInvalid\|PendingPerStudent" backend/DiplomaTracker.Api --include=*.cs
```

Expected: no output outside `Migrations/`, which Task 7 regenerates.

---

### Task 3: Step panel seats and standards control

This task seats the direction manager and the standards controller on the step panels, lets an administrator set a group step's controller, and widens visibility to match. The build is green at the end.

**Files:**
- Modify: `backend/DiplomaTracker.Api/Entities/ReviewSeat.cs`
- Replace: `backend/DiplomaTracker.Api/Services/ReviewPanel.cs`, `Services/AccessScope.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs`, `Interfaces/IStudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Workflow/StepDetailsResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/GroupTasks/SetStandardsControllerRequest.cs`, `StandardsControllerChangeResponse.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/GroupTasks/GroupTaskResponse.cs`, `Services/GroupTaskService.cs`, `Controllers/GroupTasksController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DashboardService.cs`

**Interfaces:**
- Consumes:
  - `GroupTask.StandardsControllerId` and `StandardsControllerAssignedAt` (Task 1);
  - `StaffCapabilityQueries.IsStandardsControllerAsync` (Task 1);
  - `TaskErrors.GroupTaskControllerInvalid` (Task 1).
- Produces:
  - `ReviewSeat { Supervisor, DirectionManager, Extra, StandardsControl }`;
  - `ReviewPanel.Facts(Guid? SupervisorId, Guid? DirectionManagerId, StandardsControlFact? StandardsControl, IReadOnlyList<ExtraSeatFact> Extras, IReadOnlyList<ReviewFact> Reviews)`;
  - `ReviewPanel.Evaluate(Facts)`, `SeatFor(UserContext, PanelState, bool allowAdminStandIn = true)`, `IsSeatSatisfied(PanelState, ReviewSeat, Guid)` and `IsMarked(ReviewSeat)`.
- Produces: `IStudentWorkflowService.SetStandardsControllerAsync(UserContext user, Guid groupTaskId, Guid? controllerId)` returning `(StandardsControllerChangeResponse?, string?)`.
- Wire:
  - `StepDetailsResponse.mySeat` (`"Supervisor"`, `"DirectionManager"`, `"Extra"`, `"StandardsControl"` or null);
  - `GroupTaskResponse` gains `standardsControllerId`, `standardsControllerName` and `standardsControlApproved`;
  - `PUT /api/group-tasks/{id}/standards-controller` with `{ userId }`, answering `{ groupTaskId, affectedSteps, approvedSteps }`.

- [ ] **Step 1: Seats**

`Entities/ReviewSeat.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// The panel seat a decision fills (design 2026-09-24 §3.1, 2026-09-27 §6). One person holds one
/// seat on a step: the first they qualify for, in this order.
public enum ReviewSeat
{
    Supervisor,
    DirectionManager,
    Extra,
    StandardsControl
}
```

The seat is persisted as a string, so existing values keep their meaning.

- [ ] **Step 2: Replace `Services/ReviewPanel.cs`**

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-24 §3.2 and 2026-09-27 §6. A step's panel is never stored as one list. It is the
/// student's CURRENT supervisor, the CURRENT manager of their topic's direction, one seat per extra
/// reviewer on that step, and the standards controller of the group's step. A seat is satisfied by
/// an approval that fills it on ANY version of the step - approvals are sticky. Pure: callers load
/// the facts, this decides, so every reader agrees on what the panel is.
public static class ReviewPanel
{
    public sealed record ExtraSeatFact(Guid ReviewerId, DateTime AddedAt);

    public sealed record StandardsControlFact(Guid ControllerId, DateTime AssignedAt);

    public sealed record ReviewFact(
        Guid ReviewerId,
        bool ReviewerIsAdmin,
        ReviewSeat Seat,
        SubmissionDecision Decision,
        int? Mark,
        DateTime DecidedAt);

    /// What the panel of one step is made of, as loaded.
    public sealed record Facts(
        Guid? SupervisorId,
        Guid? DirectionManagerId,
        StandardsControlFact? StandardsControl,
        IReadOnlyList<ExtraSeatFact> Extras,
        IReadOnlyList<ReviewFact> Reviews)
    {
        public PanelState Evaluate() => ReviewPanel.Evaluate(this);
    }

    /// ReviewerId is null only for a supervisor seat whose student has no supervisor (a topic
    /// released while a version waits) - an administrator can still fill it.
    public sealed record SeatState(ReviewSeat Seat, Guid? ReviewerId, bool IsSatisfied, int? Mark);

    public sealed record PanelState(IReadOnlyList<SeatState> Seats)
    {
        public int Size => Seats.Count;

        public int Satisfied => Seats.Count(s => s.IsSatisfied);

        public bool IsComplete => Seats.All(s => s.IsSatisfied);

        /// The step mark: the average of the marks behind every satisfied marked seat, rounded to
        /// a whole number, half away from zero. The standards control seat carries no mark.
        public int? AverageMark()
        {
            var marks = Seats.Where(s => s.IsSatisfied && s.Mark is not null).Select(s => s.Mark!.Value).ToList();
            return marks.Count == 0 ? null : (int)Math.Round(marks.Average(), MidpointRounding.AwayFromZero);
        }
    }

    /// Whether approving in this seat takes a mark (§6): every seat but standards control.
    public static bool IsMarked(ReviewSeat seat) => seat != ReviewSeat.StandardsControl;

    /// Seats in order: Supervisor (always first), DirectionManager, Extra..., StandardsControl. One
    /// person holds one seat - whoever already sits earlier in that order is not seated again later,
    /// which is how phase 9 already absorbed an extra naming the supervisor. An extra seat counts
    /// only approvals given after it was added, the standards control seat only those given after
    /// the controller was assigned.
    public static PanelState Evaluate(Facts facts)
    {
        var approvals = facts.Reviews
            .Where(r => r.Decision == SubmissionDecision.Approved)
            .OrderByDescending(r => r.DecidedAt)
            .ToList();

        var seated = new HashSet<Guid>();
        var seats = new List<SeatState>();

        var supervisorApproval = approvals.FirstOrDefault(r =>
            r.Seat == ReviewSeat.Supervisor && (r.ReviewerId == facts.SupervisorId || r.ReviewerIsAdmin));
        seats.Add(new SeatState(ReviewSeat.Supervisor, facts.SupervisorId, supervisorApproval is not null, supervisorApproval?.Mark));
        if (facts.SupervisorId is { } supervisorId)
        {
            seated.Add(supervisorId);
        }

        if (facts.DirectionManagerId is { } managerId && seated.Add(managerId))
        {
            var approval = approvals.FirstOrDefault(r => r.Seat == ReviewSeat.DirectionManager && r.ReviewerId == managerId);
            seats.Add(new SeatState(ReviewSeat.DirectionManager, managerId, approval is not null, approval?.Mark));
        }

        foreach (var extra in facts.Extras.OrderBy(e => e.AddedAt))
        {
            if (!seated.Add(extra.ReviewerId))
            {
                continue;
            }

            var approval = approvals.FirstOrDefault(r =>
                r.Seat == ReviewSeat.Extra && r.ReviewerId == extra.ReviewerId && r.DecidedAt >= extra.AddedAt);
            seats.Add(new SeatState(ReviewSeat.Extra, extra.ReviewerId, approval is not null, approval?.Mark));
        }

        if (facts.StandardsControl is { } control && seated.Add(control.ControllerId))
        {
            var approval = approvals.FirstOrDefault(r =>
                r.Seat == ReviewSeat.StandardsControl && r.ReviewerId == control.ControllerId && r.DecidedAt >= control.AssignedAt);
            seats.Add(new SeatState(ReviewSeat.StandardsControl, control.ControllerId, approval is not null, null));
        }

        return new PanelState(seats);
    }

    /// The seat the caller's decision fills, or null when they have none. Their own seat wins; an
    /// administrator with no seat of their own stands in for the supervisor by default
    /// (`allowAdminStandIn: true`) - that power drives `canDecide` and the decision form. "Your
    /// decision" (`isMyDecision`) passes `allowAdminStandIn: false`, so it counts only a seat the
    /// caller actually holds.
    public static ReviewSeat? SeatFor(UserContext user, PanelState panel, bool allowAdminStandIn = true)
    {
        var own = panel.Seats.FirstOrDefault(s => s.ReviewerId == user.UserId);
        if (own is not null)
        {
            return own.Seat;
        }

        return allowAdminStandIn && user.IsAdmin ? ReviewSeat.Supervisor : null;
    }

    public static bool IsSeatSatisfied(PanelState panel, ReviewSeat seat, Guid userId) =>
        seat == ReviewSeat.Supervisor
            ? panel.Seats[0].IsSatisfied
            : panel.Seats.Any(s => s.Seat == seat && s.ReviewerId == userId && s.IsSatisfied);
}
```

- [ ] **Step 3: Replace `Services/AccessScope.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §6.2: a direction manager is treated as a supervisor for the students whose
/// topic is in their direction; a standards controller as an extra reviewer on the steps they
/// control, and nothing more.
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.Groups.Where(g =>
                g.Reviewers.Any(r => r.ReviewerId == me)
                || g.Students.Any(s => s.ArchivedAt == null
                    && (s.SupervisorId == me || (s.Topic != null && s.Topic.Direction.ManagerId == me))));
        }

        return _dbContext.Groups.Where(_ => false);
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.StudentProfiles.Where(s =>
                s.ArchivedAt == null
                && (s.SupervisorId == me
                    || (s.Topic != null && s.Topic.Direction.ManagerId == me)
                    || s.Group.Reviewers.Any(r => r.ReviewerId == me)));
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

        if (user.IsTeacher)
        {
            var me = user.UserId;
            return _dbContext.StudentProfiles.Where(s =>
                s.ArchivedAt == null
                && (s.SupervisorId == me
                    || (s.Topic != null && s.Topic.Direction.ManagerId == me)
                    || s.Group.Reviewers.Any(r => r.ReviewerId == me)
                    || s.StudentTasks.Any(t => t.Reviewers.Any(r => r.ReviewerId == me)
                        || (t.GroupTask.StandardsControllerId == me && t.GroupTask.GroupId == s.GroupId))));
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

        if (!user.IsTeacher)
        {
            return Task.FromResult(false);
        }

        var me = user.UserId;
        var reviewable = ReviewableStudents(user).Select(s => s.Id);
        return task.AnyAsync(t =>
            reviewable.Contains(t.StudentProfileId)
            || (t.StudentProfile.ArchivedAt == null
                && (t.Reviewers.Any(r => r.ReviewerId == me) || t.GroupTask.StandardsControllerId == me)));
    }
}
```

Update the doc comments in `Interfaces/IAccessScope.cs` on `ReviewOverviewStudents` and `CanSeeStudentTaskAsync`. Each gains one sentence: "A direction manager counts as a supervisor for the students of their directions; a standards controller as an extra reviewer on the steps they control (design 2026-09-27 §6.2)."

- [ ] **Step 4: Contracts**

`DTOs/Workflow/StepDetailsResponse.cs`: add after `PendingSubmissionId`:

```csharp
    /// The seat the caller decides in when CanDecide is true (design 2026-09-27 §6): the decision
    /// form asks for a mark in every seat but StandardsControl.
    public string? MySeat { get; set; }
```

`DTOs/GroupTasks/GroupTaskResponse.cs`: add after `StudentTaskCount`:

```csharp
    /// Design 2026-09-27 §6.1.
    public Guid? StandardsControllerId { get; set; }
    public string? StandardsControllerName { get; set; }

    /// Students of the group whose step the current controller has approved.
    public int StandardsControlApproved { get; set; }
```

`DTOs/GroupTasks/SetStandardsControllerRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class SetStandardsControllerRequest
{
    /// The new standards controller, or null to remove the current one.
    public Guid? UserId { get; set; }
}
```

`DTOs/GroupTasks/StandardsControllerChangeResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class StandardsControllerChangeResponse
{
    public Guid GroupTaskId { get; set; }

    /// Student steps of this group step that were not yet approved - the ones the change applies to.
    public int AffectedSteps { get; set; }

    /// Of those, the Submitted steps the change left with every seat satisfied, approved at once.
    public int ApprovedSteps { get; set; }
}
```

- [ ] **Step 5: The workflow service**

`Interfaces/IStudentWorkflowService.cs`: add `using DiplomaTracker.Api.DTOs.GroupTasks;` and

```csharp
    Task<(StandardsControllerChangeResponse? result, string? error)> SetStandardsControllerAsync(UserContext user, Guid groupTaskId, Guid? controllerId);
```

In `Services/StudentWorkflowService.cs`:

1. Add `using DiplomaTracker.Api.DTOs.GroupTasks;`.

2. **Delete** the private `PanelFacts` record and its doc comment. Every `PanelFacts` in the file becomes `ReviewPanel.Facts`. That covers the return type of `LoadPanelFactsAsync` and the `facts with { ... }` expressions; `Facts` is a record, so `with` still works.

3. `ApproveAsync` becomes:

```csharp
    public async Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request)
    {
        // Mark is bound as decimal, not int, so a fractional value reaches here instead of failing
        // model binding. Whether a mark is required at all depends on the caller's seat (design
        // 2026-09-27 §6), which DecideAsync resolves; a mark that is given must be valid anyway.
        if (request.Mark is not null && (request.Mark is < 0 or > 100 || request.Mark % 1 != 0))
        {
            return (null, WorkflowErrors.MarkOutOfRange);
        }

        return await DecideAsync(
            user,
            submissionId,
            SubmissionDecision.Approved,
            request.Mark is null ? null : (int)request.Mark.Value,
            IdentityNormalizer.Optional(request.Comment));
    }
```

4. In `DecideAsync`, replace

```csharp
        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var seat = ReviewPanel.SeatFor(user, facts.SupervisorId, facts.Extras);
```

with

```csharp
        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var panelBefore = facts.Evaluate();
        var seat = ReviewPanel.SeatFor(user, panelBefore);
```

5. Replace the `SeatSatisfied` check `if (ReviewPanel.IsSeatSatisfied(facts.Evaluate(), seat.Value, user.UserId))` with the following. The seat-satisfied return stays inside it.

```csharp
        if (ReviewPanel.IsSeatSatisfied(panelBefore, seat.Value, user.UserId))
        {
            return (null, WorkflowErrors.SeatSatisfied);
        }

        // Design 2026-09-27 §6: a marked seat approves with a mark; the standards control seat
        // approves without one and adds nothing to the step's average.
        if (decision == SubmissionDecision.Approved)
        {
            if (!ReviewPanel.IsMarked(seat.Value))
            {
                mark = null;
            }
            else if (mark is null)
            {
                return (null, WorkflowErrors.MarkRequired);
            }
        }
```

6. In the approval branch, replace the `after` evaluation with

```csharp
            var after = ReviewPanel.Evaluate(facts with
            {
                Reviews = [.. facts.Reviews, new ReviewPanel.ReviewFact(user.UserId, user.IsAdmin, seat.Value, decision, mark, now)]
            });
```

7. `LoadPanelFactsAsync` becomes:

```csharp
    /// Loads the panel facts of many steps in three queries, whatever their number - the queue and
    /// "My work" show a panel count on every row.
    private async Task<Dictionary<Guid, ReviewPanel.Facts>> LoadPanelFactsAsync(IReadOnlyCollection<Guid> studentTaskIds)
    {
        var ids = studentTaskIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, ReviewPanel.Facts>();
        }

        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new
            {
                t.Id,
                t.StudentProfile.SupervisorId,
                DirectionManagerId = t.StudentProfile.Topic != null ? (Guid?)t.StudentProfile.Topic.Direction.ManagerId : null,
                t.GroupTask.StandardsControllerId,
                t.GroupTask.StandardsControllerAssignedAt
            })
            .ToListAsync();

        var extras = await _dbContext.StudentTaskReviewers.AsNoTracking()
            .Where(r => ids.Contains(r.StudentTaskId))
            .Select(r => new { r.StudentTaskId, r.ReviewerId, r.AddedAt })
            .ToListAsync();

        var reviews = await _dbContext.SubmissionReviews.AsNoTracking()
            .Where(r => ids.Contains(r.Submission.StudentTaskId))
            .Select(r => new
            {
                r.Submission.StudentTaskId,
                r.ReviewerId,
                ReviewerIsAdmin = r.Reviewer.Role == "Admin",
                r.Seat,
                r.Decision,
                r.Mark,
                r.DecidedAt
            })
            .ToListAsync();

        var extrasByTask = extras.ToLookup(e => e.StudentTaskId);
        var reviewsByTask = reviews.ToLookup(r => r.StudentTaskId);

        return tasks.ToDictionary(
            t => t.Id,
            t => new ReviewPanel.Facts(
                t.SupervisorId,
                t.DirectionManagerId,
                t.StandardsControllerId is { } controllerId && t.StandardsControllerAssignedAt is { } assignedAt
                    ? new ReviewPanel.StandardsControlFact(controllerId, assignedAt)
                    : null,
                extrasByTask[t.Id].Select(e => new ReviewPanel.ExtraSeatFact(e.ReviewerId, e.AddedAt)).ToList(),
                reviewsByTask[t.Id]
                    .Select(r => new ReviewPanel.ReviewFact(r.ReviewerId, r.ReviewerIsAdmin, r.Seat, r.Decision, r.Mark, r.DecidedAt))
                    .ToList()));
    }
```

8. `CompleteIfPanelSatisfiedAsync` becomes:

```csharp
    /// Completes a `Submitted` step at once when its panel is already fully satisfied - after a
    /// resubmission whose sticky approvals fill every seat, after a removal, and after a change of
    /// the standards controller. `adjust` applies a panel change this unit of work has not saved
    /// yet (a seat being removed or replaced) before the evaluation.
    private async Task CompleteIfPanelSatisfiedAsync(StudentTask task, Submission latest, DateTime now, Func<ReviewPanel.Facts, ReviewPanel.Facts>? adjust = null)
    {
        if (task.Status != StudentTaskStatus.Submitted || latest.Decision is not null)
        {
            return;
        }

        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        if (adjust is not null)
        {
            facts = adjust(facts);
        }

        var after = facts.Evaluate();
        if (after.IsComplete)
        {
            CompleteStep(latest, task, after, now);
        }
    }
```

In `RemoveReviewerAsync` the call becomes

```csharp
            await CompleteIfPanelSatisfiedAsync(task, latest, now,
                facts => facts with { Extras = facts.Extras.Where(e => e.ReviewerId != reviewerId).ToList() });
```

9. In `AddReviewerAsync`, after the `PanelReviewerIsSupervisor` check, insert:

```csharp
        // Design 2026-09-27 §6: the direction manager and the standards controller already sit on
        // this step's panel.
        var panelFacts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        if (panelFacts.DirectionManagerId == reviewerId || panelFacts.StandardsControl?.ControllerId == reviewerId)
        {
            return (null, WorkflowErrors.PanelReviewerExists);
        }
```

10. In `BuildDetailsAsync`, the seat line becomes `var seat = user.IsStudent ? null : ReviewPanel.SeatFor(user, panel);`. In the `new StepDetailsResponse { ... }` initializer, after `PendingSubmissionId`, add `MySeat = canDecide ? seat!.Value.ToString() : null,`.

11. In `GetReviewStudentsAsync`, the seat line becomes `var seat = ReviewPanel.SeatFor(user, panel, allowAdminStandIn: false);`.

12. In `WaitingForCallerQuery`, the teacher branch becomes:

```csharp
        if (user.IsTeacher)
        {
            var me = user.UserId;

            // One predicate per seat, in ReviewPanel.Evaluate's order, each excluding the seats an
            // earlier one absorbs - a person decides once, in their first seat (design 2026-09-27 §6).
            query = query.Where(s => s.StudentTask.StudentProfile.ArchivedAt == null && (
                (s.StudentTask.StudentProfile.SupervisorId == me
                    && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                        r.Seat == ReviewSeat.Supervisor
                        && r.Decision == SubmissionDecision.Approved
                        && (r.ReviewerId == me || r.Reviewer.Role == "Admin")))
                || (s.StudentTask.StudentProfile.SupervisorId != me
                    && s.StudentTask.StudentProfile.Topic != null
                    && s.StudentTask.StudentProfile.Topic.Direction.ManagerId == me
                    && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                        r.Seat == ReviewSeat.DirectionManager
                        && r.Decision == SubmissionDecision.Approved
                        && r.ReviewerId == me))
                || (s.StudentTask.StudentProfile.SupervisorId != me
                    && (s.StudentTask.StudentProfile.Topic == null || s.StudentTask.StudentProfile.Topic.Direction.ManagerId != me)
                    && s.StudentTask.Reviewers.Any(x => x.ReviewerId == me
                        && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                            r.Seat == ReviewSeat.Extra
                            && r.Decision == SubmissionDecision.Approved
                            && r.ReviewerId == me
                            && r.DecidedAt >= x.AddedAt)))
                || (s.StudentTask.GroupTask.StandardsControllerId == me
                    && s.StudentTask.StudentProfile.SupervisorId != me
                    && (s.StudentTask.StudentProfile.Topic == null || s.StudentTask.StudentProfile.Topic.Direction.ManagerId != me)
                    && !s.StudentTask.Reviewers.Any(x => x.ReviewerId == me)
                    && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                        r.Seat == ReviewSeat.StandardsControl
                        && r.Decision == SubmissionDecision.Approved
                        && r.ReviewerId == me
                        && r.DecidedAt >= s.StudentTask.GroupTask.StandardsControllerAssignedAt))));
        }
```

13. In `BuildReviewStudentProjection`, both `CanOpen = ...` expressions gain two more alternatives:

```csharp
                    CanOpen = isAdmin
                        || p.SupervisorId == callerId
                        || (p.Topic != null && p.Topic.Direction.ManagerId == callerId)
                        || p.Group.Reviewers.Any(r => r.ReviewerId == callerId)
                        || t.Reviewers.Any(r => r.ReviewerId == callerId)
                        || t.GroupTask.StandardsControllerId == callerId,
```

14. In `GetGroupProgressAsync`, the `mineIds` predicate becomes

```csharp
                .Where(p => studentIds.Contains(p.Id)
                    && (p.SupervisorId == user.UserId
                        || (p.Topic != null && p.Topic.Direction.ManagerId == user.UserId)
                        || p.StudentTasks.Any(t => t.Reviewers.Any(r => r.ReviewerId == user.UserId)
                            || t.GroupTask.StandardsControllerId == user.UserId)))
```

15. Add the new method after `RemoveReviewerAsync`:

```csharp
    /// Design 2026-09-27 §6.1: an administrator sets, replaces or removes a group step's standards
    /// controller. The seat is derived from the group step, so it reaches every student step of it
    /// that is not yet approved - and any student who joins later - with nothing copied. Each
    /// affected step is touched so its RowVersion orders this change against decisions, and a
    /// Submitted step left with every seat satisfied is approved now.
    public async Task<(StandardsControllerChangeResponse? result, string? error)> SetStandardsControllerAsync(UserContext user, Guid groupTaskId, Guid? controllerId)
    {
        var groupTask = await _dbContext.GroupTasks.FirstOrDefaultAsync(g => g.Id == groupTaskId);
        if (groupTask is null)
        {
            return (null, TaskErrors.GroupTaskNotFound);
        }

        if (controllerId is not null && !await _dbContext.IsStandardsControllerAsync(controllerId.Value))
        {
            return (null, TaskErrors.GroupTaskControllerInvalid);
        }

        if (groupTask.StandardsControllerId == controllerId)
        {
            return (new StandardsControllerChangeResponse { GroupTaskId = groupTask.Id }, null);
        }

        var now = DateTime.UtcNow;
        groupTask.StandardsControllerId = controllerId;
        groupTask.StandardsControllerAssignedAt = controllerId is null ? null : now;
        groupTask.UpdatedAt = now;

        var tasks = await _dbContext.StudentTasks
            .Where(t => t.GroupTaskId == groupTask.Id
                && t.Status != StudentTaskStatus.Approved
                && t.StudentProfile.ArchivedAt == null
                && t.StudentProfile.GroupId == groupTask.GroupId)
            .ToListAsync();

        var control = controllerId is { } id ? new ReviewPanel.StandardsControlFact(id, now) : null;
        var approvedNow = 0;
        foreach (var task in tasks)
        {
            task.UpdatedAt = now;
            if (task.Status != StudentTaskStatus.Submitted)
            {
                continue;
            }

            var latest = await _dbContext.Submissions
                .Where(s => s.StudentTaskId == task.Id)
                .OrderByDescending(s => s.Version)
                .FirstAsync();

            await CompleteIfPanelSatisfiedAsync(task, latest, now, facts => facts with { StandardsControl = control });
            if (task.Status == StudentTaskStatus.Approved)
            {
                approvedNow++;
            }
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelChanged);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, controllerId is null ? "StandardsControllerRemoved" : "StandardsControllerSet", "GroupTask", groupTask.Id);
        return (new StandardsControllerChangeResponse
        {
            GroupTaskId = groupTask.Id,
            AffectedSteps = tasks.Count,
            ApprovedSteps = approvedNow
        }, null);
    }
```

The per-step queries in the loop are bounded by one group's size. Only `Submitted` steps take the two extra queries.

- [ ] **Step 6: Group steps show their controller**

`Services/GroupTaskService.cs`:

1. `ProjectGroupTasks` gains, after `StudentTaskCount`:

```csharp
            StandardsControllerId = x.StandardsControllerId,
            StandardsControllerName = x.StandardsController == null
                ? null
                : x.StandardsController.LastName + " " + x.StandardsController.FirstName,
            StandardsControlApproved = x.StandardsControllerId == null
                ? 0
                : x.StudentTasks.Count(st => st.StudentProfile.ArchivedAt == null
                    && st.Submissions.SelectMany(s => s.Reviews).Any(r =>
                        r.Seat == ReviewSeat.StandardsControl
                        && r.Decision == SubmissionDecision.Approved
                        && r.ReviewerId == x.StandardsControllerId
                        && r.DecidedAt >= x.StandardsControllerAssignedAt))
```

2. `MapGroupTask` is used right after a create, when no controller exists yet. It gains `StandardsControllerId = groupTask.StandardsControllerId,`; the name stays null and the count 0.

`Controllers/GroupTasksController.cs`: add `using DiplomaTracker.Api.DTOs.GroupTasks;` if missing. Inject `IStudentWorkflowService workflow` into the constructor as `_workflow`, and add:

```csharp
    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}/standards-controller")]
    public async Task<IActionResult> SetStandardsController(Guid id, [FromBody] SetStandardsControllerRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (result, error) = await _workflow.SetStandardsControllerAsync(user, id, request.UserId);
        return result is null ? ErrorResult(error) : Ok(result);
    }
```

The class-level `[Authorize(Roles = "Admin,Teacher")]` and this method-level attribute both apply, so only administrators reach it.

- [ ] **Step 7: Dashboards count the direction manager as a supervisor**

`Services/DashboardService.cs`, `GroupRowsAsync`: every per-student condition names the supervisor, and each must accept the direction manager too.
- Replace each `s.SupervisorId == me)` (two occurrences) with `s.SupervisorId == me || (s.Topic != null && s.Topic.Direction.ManagerId == me))`.
- Replace each `t.StudentProfile.SupervisorId == me)` (five occurrences) with `t.StudentProfile.SupervisorId == me || (t.StudentProfile.Topic != null && t.StudentProfile.Topic.Direction.ManagerId == me))`.

The doc comment's sentence "narrows every count to their own reviewable students in it (`SupervisorId == me`...)" becomes "(the students they supervise or whose topic is in their direction...)". `OverdueStepsAsync` already goes through `ReviewableStudents` and needs no change.

- [ ] **Step 8: Build and the existing tests**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

```bash
grep -n "PanelFacts\|SeatFor(user, fact\|SeatFor(user, facts" backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs
```

Expected: no output.

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: every test passes. The tests do not touch topics or panels; a compile error here means a test helper builds an entity whose shape changed.

---

### Task 4: Check scripts and demo data

The scripts cannot run until Task 7 recreates the database. This task writes them; Task 7 runs them.

**Files:**
- Modify: `.superpowers/checks/checkCleanup.mjs` (`giveTopic`)
- Replace: `.superpowers/checks/topics-check.mjs`
- Create: `.superpowers/checks/directions-approval-check.mjs`
- Modify: `.superpowers/checks/templates-check.mjs`, `.superpowers/checks/hardening-check.mjs`
- Modify: `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md`

**Interfaces:**
- Consumes the HTTP API of Tasks 1–3 exactly as their **Interfaces** blocks list it.
- `giveTopic(call, cleanup, { admin, teacher, departmentId, studentId, title })` keeps its signature. `teacher` must be a direction manager; every current caller passes the seeded teacher.

- [ ] **Step 1: `giveTopic`**

In `.superpowers/checks/checkCleanup.mjs`, replace the comment above `giveTopic` and the function with:

```js
// Work on the steps starts only once a student holds a topic, and a topic is the student's only
// once an administrator, the direction's manager and the supervisor have approved it (design
// 2026-09-27 §5). This gives one in a single stroke: an administrator opens a direction in the
// student's department managed by `teacher`, `teacher` creates the topic there - so their
// direction and supervision seats start approved - and the administrator's assignment adds the
// third. `teacher` must be a direction manager; the seeded teacher is. The topic and the direction
// are removed in the late phase, after the student's group (and with it the student's hold on the
// topic) is gone. Returns the assignment's response.
export async function giveTopic(call, cleanup, { admin, teacher, departmentId, studentId, title }) {
  const payload = (response) => response.body ?? response.data
  const me = payload(await call('GET', '/api/auth/me', { token: teacher }))
  const direction = payload(await call('POST', '/api/directions', { token: admin, json: { departmentId, name: `Direction ${title}`, managerId: me.id } }))
  cleanup.addLast(`direction ${title}`, () => call('DELETE', `/api/directions/${direction.id}`, { token: admin }))
  const topic = payload(await call('POST', '/api/topics', { token: teacher, json: { title, directionId: direction.id } }))
  cleanup.addLast(`topic ${title}`, () => call('DELETE', `/api/topics/${topic.id}`, { token: admin }))
  return call('PUT', `/api/students/${studentId}/topic`, { token: admin, json: { topicId: topic.id } })
}
```

The late undos run newest first, so the topic is deleted before its direction, and both go before any department the caller registered earlier.

- [ ] **Step 2: `templates-check.mjs` and `hardening-check.mjs`**

`templates-check.mjs`: directly after the line that defines `seedGroup`, add

```js
// Design 2026-09-27: a topic belongs to a direction; the seeded department has one.
const seedDirection = (await call('GET', `/api/directions?departmentId=${seedGroup.departmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering')
```

In the three `/api/topics` calls (creating `topicA` and `topicB`, and the `PUT` that sets `multilineDescription`), replace `departmentId: seedGroup.departmentId` with `directionId: seedDirection.id`. The `/api/groups` calls keep their `departmentId`.

`hardening-check.mjs`: replace the line that creates `reservedTopic` with

```js
// Design 2026-09-27: a topic belongs to a direction; this department gets its own, managed by the seeded teacher.
const hardeningDirection = (await call('POST', '/api/directions', { token: admin, json: { departmentId: hardeningDepartment.id, name: `Hardening ${stamp}`, managerId: (await call('GET', '/api/auth/me', { token: teacher })).body.id } })).body
cleanup.addLast(`direction ${hardeningDirection.name}`, () => call('DELETE', `/api/directions/${hardeningDirection.id}`, { token: admin }))
const reservedTopic = (await call('POST', '/api/topics', { token: teacher, json: { title: `Hardening Topic ${stamp}`, directionId: hardeningDirection.id } })).body
```

Check `24j` still expects `Pending`: the teacher's own topic starts with two of three approvals.

- [ ] **Step 3: Replace `topics-check.mjs`**

The phase 4 checks keep their numbers where the behaviour is unchanged. Where a teacher's approval alone used to complete a request, the administrator's approval now completes it.

```js
import { createCleanup, removeGroup } from './checkCleanup.mjs'

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

async function call(method, path, { token, json } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}

const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token

async function runChecks() {
const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')

const groups = (await call('GET', '/api/groups', { token: admin })).body
const seedGroup = groups.find((g) => g.code === 'SEED-A')
const departmentId = seedGroup.departmentId
// Design 2026-09-27: every topic belongs to a direction. The seeded one is managed by the seeded
// teacher, who therefore holds both the direction and the supervision seat on their own topics:
// the administrator's approval is the one that completes them.
const directionId = (await call('GET', `/api/directions?departmentId=${departmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering').id
// Every student this script creates lives in a group of its own, removed with them at the end.
const ownGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId, code: `TP${stamp}`, academicYear: '2026/2027', description: '' } })).body
cleanup.add(`group ${ownGroup.code}`, () => removeGroup(call, admin, ownGroup))
const teachers = (await call('GET', '/api/teachers', { token: admin })).body
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id

async function createStudent(suffix) {
  const email = `topic.${suffix}.${stamp}@student.local`
  const created = await call('POST', '/api/students', { token: admin, json: { firstName: 'Topic', lastName: `Student${suffix}`, email, studentNumber: `T${suffix}${stamp}`, password: 'Password1!', groupId: ownGroup.id } })
  return { id: created.body.id, token: await login(email, 'Password1!') }
}

const s1 = await createStudent('A')
const s2 = await createStudent('B')
const s3 = await createStudent('C')
const s4 = await createStudent('D') // used only for the topicHeld-refusal sequence (checks 40-48)

const teacher2Email = `teacher2.${stamp}@diploma.local`
const teacher2Id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Second', lastName: 'Teacher', email: teacher2Email, password: 'Teacher456!' } })).body.id
const teacher2 = await login(teacher2Email, 'Teacher456!')
cleanup.add(`teacher ${teacher2Email} -> deactivate`, () => call('PATCH', `/api/teachers/${teacher2Id}/deactivate`, { token: admin }))

const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Catalogue
const t1 = await call('POST', '/api/topics', { token: teacher, json: { title: `Topic One ${stamp}`, description: 'First', directionId } })
check('01 teacher creates topic', t1.status, 201)
const t2 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Two ${stamp}`, directionId } })).body
const t4 = (await call('POST', '/api/topics', { token: admin, json: { title: `Topic Four ${stamp}`, directionId, supervisorId: teacherId } })).body
cleanup.add(`topic ${t4.title}`, () => call('DELETE', `/api/topics/${t4.id}`, { token: admin }))
const t5 = (await call('POST', '/api/topics', { token: teacher2, json: { title: `Topic Five ${stamp}`, directionId } })).body
cleanup.add(`topic ${t5.title}`, () => call('DELETE', `/api/topics/${t5.id}`, { token: admin }))
const t6 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Six ${stamp}`, directionId } })).body
const t7 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Seven ${stamp}`, directionId } })).body
const t8 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eight ${stamp}`, directionId } })).body
check('02 admin topic without supervisor refused', (await call('POST', '/api/topics', { token: admin, json: { title: 'X', directionId } })).body.code, 'topic.supervisorInvalid')
check('03a supervisors list for student', (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.some((t) => t.id === teacherId), true)
check('03 unknown direction refused', (await call('POST', '/api/topics', { token: teacher, json: { title: 'X', directionId: '00000000-0000-0000-0000-000000000001' } })).body.code, 'direction.invalid')

const otherFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Other Faculty ${stamp}`, shortName: `OF${stamp}` } })).body
cleanup.add(`faculty ${otherFaculty.shortName}`, () => call('DELETE', `/api/faculties/${otherFaculty.id}`, { token: admin }))
const otherDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: otherFaculty.id, name: `Other Department ${stamp}`, shortName: `OD${stamp}` } })).body
cleanup.add(`department ${otherDepartment.shortName}`, () => call('DELETE', `/api/departments/${otherDepartment.id}`, { token: admin }))
const otherDirection = (await call('POST', '/api/directions', { token: admin, json: { departmentId: otherDepartment.id, name: `Other Direction ${stamp}`, managerId: teacherId } })).body
cleanup.add(`direction ${otherDirection.name}`, () => call('DELETE', `/api/directions/${otherDirection.id}`, { token: admin }))
const t3 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Other ${stamp}`, directionId: otherDirection.id } })).body
cleanup.add(`topic ${t3.title}`, () => call('DELETE', `/api/topics/${t3.id}`, { token: admin }))

const catalogue = (await call('GET', '/api/topics', { token: s1.token })).body
check('04 student sees own-department topic', catalogue.some((t) => t.id === t1.body.id), true)
check('05 student does not see other department', catalogue.some((t) => t.id === t3.id), false)
check('06 other department reserve refused', (await call('POST', `/api/topics/${t3.id}/reserve`, { token: s1.token })).body.code, 'topic.notInYourDepartment')

// Reserve, reject, reserve, approve, release
const r1 = await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })
check('07 reserve', r1.status, 200)
check('08 reservation pending', r1.body.status, 'Pending')
check('09 second reservation refused', (await call('POST', `/api/topics/${t2.id}/reserve`, { token: s1.token })).body.code, 'reservation.alreadyActive')
check('10 teacher2 holds no seat', (await call('POST', `/api/reservations/${r1.body.id}/approve`, { token: teacher2 })).body.code, 'approval.notApprover')
const rejected = await call('POST', `/api/reservations/${r1.body.id}/reject`, { token: teacher, json: { comment: 'Please narrow the scope' } })
check('11 reject', rejected.body.status, 'Rejected')
check('12 topic available again', (await call('GET', `/api/topics/${t1.body.id}`, { token: admin })).body.status, 'Available')
const mine = (await call('GET', '/api/reservations/mine', { token: s1.token })).body
check('13 history keeps comment', mine[0].decisionComment, 'Please narrow the scope')

const r1b = (await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })).body
check('14 the creator already approved in both of their seats', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: teacher })).body.code, 'approval.seatSatisfied')
check('14a the administration completes it', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: admin })).body.status, 'Approved')
const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
check('15 student topic set', s1Profile.topicTitle, `Topic One ${stamp}`)
check('16 student supervisor set', s1Profile.supervisorId, teacherId)
check('17 approved topic not editable by its teacher', (await call('PUT', `/api/topics/${t1.body.id}`, { token: teacher, json: { title: 'Changed', directionId } })).body.code, 'topic.notEditable')
check('17a admin edits an approved topic', (await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One Amended ${stamp}`, directionId, supervisorId: teacher2Id } })).status, 200)
check('17b student supervisor moved with the topic', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.supervisorId, teacher2Id)
check('17c the approved request shows the current wording', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Topic One Amended ${stamp}`)
check('17d approved topic cannot be deleted', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: admin })).body.code, 'topic.notEditable')
await call('PUT', `/api/topics/${t1.body.id}`, { token: admin, json: { title: `Topic One ${stamp}`, directionId, supervisorId: teacherId } })
check('18 cancel approved refused', (await call('POST', `/api/reservations/${r1b.id}/cancel`, { token: s1.token })).body.code, 'reservation.invalidState')
check('19 release', (await call('POST', `/api/reservations/${r1b.id}/release`, { token: teacher, json: { comment: 'Changed plans' } })).body.status, 'Released')
check('20 student topic cleared', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)

// Proposals
const p1 = await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal ${stamp}`, description: 'Own idea', supervisorId: teacherId, directionId } })
check('21 propose', p1.status, 200)
check('22 teacher sees proposal', (await call('GET', '/api/topics', { token: teacher })).body.some((t) => t.id === p1.body.topicId && t.origin === 'StudentProposal'), true)
check('23 student cancels proposal', (await call('POST', `/api/reservations/${p1.body.id}/cancel`, { token: s1.token })).body.status, 'Cancelled')
check('24 proposal topic deleted', (await call('GET', `/api/topics/${p1.body.topicId}`, { token: admin })).status, 404)
check('25 history keeps title', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Proposal ${stamp}`)
check('26 proposal to non-teacher refused', (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: 'X', supervisorId: s2.id, directionId } })).body.code, 'proposal.teacherInvalid')
const p2 = (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal Two ${stamp}`, supervisorId: teacherId, directionId } })).body
check('27 the supervisor, also the manager, fills two seats', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: teacher })).body.status, 'Pending')
check('27a the administration accepts the proposal', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: admin })).body.status, 'Approved')
check('28 release proposal', (await call('POST', `/api/reservations/${p2.id}/release`, { token: admin, json: {} })).body.status, 'Released')
check('29 released proposal deleted', (await call('GET', `/api/topics/${p2.topicId}`, { token: admin })).status, 404)

// Deadline
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: '2000-01-01T00:00:00Z' } })
check('30 closed selection refuses reserve', (await call('POST', `/api/topics/${t2.id}/reserve`, { token: s1.token })).body.code, 'selection.closed')
check('31 deadline returned', (await call('GET', '/api/settings/topic-selection', { token: s1.token })).body.deadline.startsWith('2000-01-01'), true)
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Concurrency
const race = await Promise.all([
  call('POST', `/api/topics/${t2.id}/reserve`, { token: s2.token }),
  call('POST', `/api/topics/${t2.id}/reserve`, { token: s3.token })
])
const statuses = race.map((r) => r.status).sort().join(',')
check('32 concurrent reserve: one wins', statuses, '200,409')
const loser = race[0].status === 409 ? s2 : s3
const winner = loser === s2 ? s3 : s2
const winnerReservation = race.find((r) => r.status === 200).body

cleanup.add(`topic ${t2.title} (race winner's open reservation)`, async () => {
  await call('POST', `/api/reservations/${winnerReservation.id}/cancel`, { token: winner.token })
  return call('DELETE', `/api/topics/${t2.id}`, { token: admin })
})

// Assignment from the student form (design 2026-09-27 §5.3): it carries the administrator's
// approval; the creator's seats count as for any request; the rest still approve.
const assigned = (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t4.id } })).body
check('33 assigning an administrator\'s topic waits for the manager and the supervisor', assigned.status, 'Pending')
check('33a the teacher, supervisor and manager, completes it', (await call('POST', `/api/reservations/${assigned.id}/approve`, { token: teacher })).body.status, 'Approved')
const replacing = (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body
check('34 assigning over a held topic waits', `${replacing.status} ${replacing.topicId === t5.id}`, 'Pending true')
check('34a the student still holds the first topic', (await call('GET', `/api/students/${loser.id}`, { token: admin })).body.topicId, t4.id)
check('34b the manager\'s approval completes the replacement', (await call('POST', `/api/reservations/${replacing.id}/approve`, { token: teacher })).body.status, 'Approved')
check('35 the displaced topic is available again', (await call('GET', `/api/topics/${t4.id}`, { token: admin })).body.status, 'Available')
check('36 assigning the topic already held refused', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: t5.id } })).body.code, 'topic.alreadyYours')
check('37 clearing the topic', (await call('PUT', `/api/students/${loser.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('38 student has no topic', (await call('GET', `/api/students/${loser.id}`, { token: admin })).body.topicId, null)
check('39 the cleared topic is available again', (await call('GET', `/api/topics/${t5.id}`, { token: admin })).body.status, 'Available')

// Task 7 bug 9: a student holding an approved topic can file no new request; reserve and propose
// are refused with reservation.topicHeld before any topic-specific rule.
const refused = (res) => `${res.status} ${res.body?.code}`
const ch1 = (await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })).body
await call('POST', `/api/reservations/${ch1.id}/approve`, { token: admin })
check('40 reserving another topic while holding one is refused', refused(await call('POST', `/api/topics/${t7.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
check('41 the held topic is still approved', (await call('GET', `/api/topics/${t6.id}`, { token: admin })).body.status, 'Approved')
check('42 proposing while holding a topic is refused the same way', refused(await call('POST', '/api/topics/proposals', { token: s4.token, json: { title: 'Unreachable proposal', supervisorId: teacherId, directionId } })), '409 reservation.topicHeld')
check('43 reserving the topic already held gives topicHeld, not alreadyYours', refused(await call('POST', `/api/topics/${t6.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: '2000-01-01T00:00:00Z' } })
check('44 closed selection still gives topicHeld, not selection.closed', refused(await call('POST', `/api/topics/${t8.id}/reserve`, { token: s4.token })), '409 reservation.topicHeld')
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })
check('45 student still holds the original topic', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, t6.id)

// An administrator replaces the topic directly. The seeded teacher created t6 and t7 and holds
// both teacher seats, so each assignment completes at once. The two-phase save is repeated seven
// times to catch an ordering bug under IX_TopicReservations_ApprovedPerStudent.
let swapsOk = true
let held = t6.id
for (let i = 0; i < 7 && swapsOk; i++) {
  const wanted = held === t6.id ? t7.id : t6.id
  const result = await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: wanted } })
  if (result.body.topicId !== wanted || result.body.status !== 'Approved') {
    swapsOk = false
    console.log(`    swap ${i + 1} failed:`, JSON.stringify(result.body))
    break
  }
  held = wanted
}
check('46 seven consecutive admin-driven topic swaps all succeed', swapsOk, true)
check('47 student holds the last topic asked for', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.topicId, held)
check('48 the other topic returns to the catalogue', (await call('GET', `/api/topics/${held === t6.id ? t7.id : t6.id}`, { token: admin })).body.status, 'Available')

cleanup.add('topics six/seven/eight (task 7 bug 9)', async () => {
  await call('PUT', `/api/students/${s4.id}/topic`, { token: admin, json: { topicId: null } })
  await call('DELETE', `/api/topics/${t6.id}`, { token: admin })
  await call('DELETE', `/api/topics/${t7.id}`, { token: admin })
  return call('DELETE', `/api/topics/${t8.id}`, { token: admin })
})

// Teacher lists and deletion
check('51 open list for teacher', (await call('GET', '/api/reservations/pending', { token: teacher })).body.every((r) => r.status === 'Pending' || r.status === 'Returned'), true)
check('52 approved list for teacher', (await call('GET', '/api/reservations/pending?status=Approved', { token: teacher })).body.some((r) => r.topicId === t7.id || r.topicId === t6.id), true)
check('53 a teacher who neither supervises nor manages cannot delete', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher2 })).body.code, 'topic.notOwner')
check('54 teacher deletes own available topic', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher })).status, 204)

// Review fix wave regression checks (C1, I4): a displaced StudentProposal topic must never be
// deleted while StudentProfiles.TopicId still references it.
async function acceptProposal(student, title) {
  const proposal = (await call('POST', '/api/topics/proposals', { token: student.token, json: { title, supervisorId: teacherId, directionId } })).body
  await call('POST', `/api/reservations/${proposal.id}/approve`, { token: teacher })
  const accepted = (await call('POST', `/api/reservations/${proposal.id}/approve`, { token: admin })).body
  return { proposal, accepted }
}

const s5 = await createStudent('E')
const t9 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Nine ${stamp}`, directionId } })).body
const c1a = await acceptProposal(s5, `Proposal C1a ${stamp}`)
check('55 proposal approved as the student\'s topic', c1a.accepted.status, 'Approved')
check('56 reserving a catalogue topic while holding an approved proposal is refused', refused(await call('POST', `/api/topics/${t9.id}/reserve`, { token: s5.token })), '409 reservation.topicHeld')
check('57 proposing again while holding an approved proposal is refused', refused(await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: 'Unreachable proposal', supervisorId: teacherId, directionId } })), '409 reservation.topicHeld')
check('58 the accepted proposal is still the student\'s topic', (await call('GET', `/api/students/${s5.id}`, { token: admin })).body.topicTitle, `Proposal C1a ${stamp}`)
cleanup.add(`topic ${t9.title} (C1a)`, async () => {
  await call('PUT', `/api/students/${s5.id}/topic`, { token: admin, json: { topicId: null } })
  return call('DELETE', `/api/topics/${t9.id}`, { token: admin })
})

// C1b: an administrator assigns a different topic over a student's approved proposal.
const s6 = await createStudent('F')
const t10 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Ten ${stamp}`, directionId } })).body
const c1b = await acceptProposal(s6, `Proposal C1b ${stamp}`)
check('59 admin assigns over an approved proposal', (await call('PUT', `/api/students/${s6.id}/topic`, { token: admin, json: { topicId: t10.id } })).body.status, 'Approved')
check('60 the old proposal topic is gone after assignment', (await call('GET', `/api/topics/${c1b.proposal.topicId}`, { token: admin })).status, 404)
cleanup.add(`topic ${t10.title} (C1b)`, async () => {
  const approved = (await call('GET', '/api/reservations/mine', { token: s6.token })).body.find((r) => r.status === 'Approved' && r.topicId === t10.id)
  if (approved) {
    await call('POST', `/api/reservations/${approved.id}/release`, { token: teacher, json: { comment: 'check cleanup' } })
  }
  return call('DELETE', `/api/topics/${t10.id}`, { token: admin })
})

// C1c: an administrator clears a student's approved proposal outright.
const s7 = await createStudent('G')
const c1c = await acceptProposal(s7, `Proposal C1c ${stamp}`)
check('61 admin clears an approved proposal', (await call('PUT', `/api/students/${s7.id}/topic`, { token: admin, json: { topicId: null } })).status, 204)
check('62 the cleared proposal topic is gone', (await call('GET', `/api/topics/${c1c.proposal.topicId}`, { token: admin })).status, 404)

// I4: an administrator changing a Reserved topic's supervisor moves the requesting student's
// supervisor with it; the requester is found through the open reservation.
const s8 = await createStudent('H')
const t11 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Eleven ${stamp}`, directionId } })).body
await call('POST', `/api/topics/${t11.id}/reserve`, { token: s8.token })
check('63 topic is Reserved, not yet Approved', (await call('GET', `/api/topics/${t11.id}`, { token: admin })).body.status, 'Reserved')
check('64 admin moves a Reserved topic to a new supervisor', (await call('PUT', `/api/topics/${t11.id}`, { token: admin, json: { title: t11.title, directionId, supervisorId: teacher2Id } })).status, 200)
check("65 the student's supervisor moves with the Reserved topic", (await call('GET', `/api/students/${s8.id}`, { token: admin })).body.supervisorId, teacher2Id)
cleanup.add(`topic ${t11.title} (I4)`, async () => {
  const open = (await call('GET', '/api/reservations/mine', { token: s8.token })).body.find((r) => (r.status === 'Pending' || r.status === 'Returned') && r.topicId === t11.id)
  if (open) {
    await call('POST', `/api/reservations/${open.id}/cancel`, { token: s8.token })
  }
  return call('DELETE', `/api/topics/${t11.id}`, { token: admin })
})
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 4: Create `directions-approval-check.mjs`**

Copy lines 1–75 of `.superpowers/checks/review-panels-check.mjs` verbatim into the new file: imports, `check`, `paceAuth`, `call`, `login`, the `.docx` builder and `form()`. Then make two changes:
- the first two comment lines become `// Design 2026-09-27: directions, topic approval and standards control. Runs against the live` and `// local API on :5000 and leaves nothing behind (checkCleanup.mjs).`;
- the import becomes `import { createCleanup, removeGroup } from './checkCleanup.mjs'`.

Append:

```js
async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')

  const seedGroup = (await call('GET', '/api/groups', { token: admin })).body.find((g) => g.code === 'SEED-A')
  const departmentId = seedGroup.departmentId
  const seedDirection = (await call('GET', `/api/directions?departmentId=${departmentId}`, { token: admin })).body.find((d) => d.name === 'Software Engineering')

  // Staff this script creates. Their deactivation is registered first among the late undos, so it
  // runs after every direction they manage and every group step they control is gone.
  async function makeTeacher(key, capabilities = {}) {
    const email = `dir.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: key, lastName: `Dir${key}${stamp}`, email, password: 'Teacher456!', ...capabilities } })).body.id
    cleanup.addLast(`teacher ${email} -> deactivate`, () => call('PATCH', `/api/teachers/${id}/deactivate`, { token: admin }))
    return { id, email, token: await login(email, 'Teacher456!') }
  }
  const manager = await makeTeacher('Manager', { isDirectionManager: true })
  const supervisor = await makeTeacher('Supervisor')
  const controller = await makeTeacher('Controller', { isStandardsController: true })

  const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId, code: `DA${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))

  const originalDeadline = (await call('GET', '/api/settings/topic-selection', { token: admin })).body.deadline
  cleanup.add('topic-selection deadline', () => call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: originalDeadline } }))
  await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

  async function makeStudent(key) {
    const email = `dir.${key.toLowerCase()}.${stamp}@student.local`
    const id = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Dir', lastName: `Student${key}`, email, studentNumber: `DA${key}${stamp}`, password: 'Password1!', groupId: group.id } })).body.id
    return { id, token: await login(email, 'Password1!') }
  }
  const s1 = await makeStudent('A')
  const s2 = await makeStudent('B')
  const s3 = await makeStudent('C')
  const s4 = await makeStudent('D')
  const s5 = await makeStudent('E')

  // ---------- directions (§4) ----------
  check('D01 a teacher without the capability cannot open a direction', (await call('POST', '/api/directions', { token: supervisor.token, json: { departmentId, name: `Nope ${stamp}` } })).body.code, 'access.forbidden')
  const created = await call('POST', '/api/directions', { token: manager.token, json: { departmentId, name: `Direction A ${stamp}`, description: 'Machine learning' } })
  check('D02 a direction manager opens a direction and manages it', `${created.status} ${created.body.managerId === manager.id}`, '201 true')
  const directionA = created.body
  cleanup.addLast(`direction ${directionA.name}`, () => call('DELETE', `/api/directions/${directionA.id}`, { token: admin }))
  check('D03 the name is unique within the department', (await call('POST', '/api/directions', { token: manager.token, json: { departmentId, name: `Direction A ${stamp}` } })).body.code, 'direction.nameTaken')
  check('D04 an unknown department is refused', (await call('POST', '/api/directions', { token: manager.token, json: { departmentId: '00000000-0000-0000-0000-000000000001', name: `X ${stamp}` } })).body.code, 'direction.departmentInvalid')
  check('D05 an administrator must name a direction manager', (await call('POST', '/api/directions', { token: admin, json: { departmentId, name: `Y ${stamp}`, managerId: supervisor.id } })).body.code, 'direction.managerInvalid')
  check('D06 another manager cannot edit it', (await call('PUT', `/api/directions/${directionA.id}`, { token: teacher, json: { departmentId, name: 'Taken over' } })).body.code, 'direction.notManager')
  check('D07 a student lists their department\'s directions', (await call('GET', '/api/directions', { token: s1.token })).body.some((d) => d.id === directionA.id), true)
  const managerPicker = (await call('GET', `/api/staff/options?capability=directionManager&search=${stamp}`, { token: admin })).body
  check('D08 the manager picker lists only direction managers', managerPicker.map((o) => o.id).join(','), manager.id)
  const managerAccount = (await call('GET', `/api/teachers/${manager.id}`, { token: admin })).body
  check('D09 the capability cannot be cleared while in use', (await call('PUT', `/api/teachers/${manager.id}`, { token: admin, json: { firstName: managerAccount.firstName, lastName: managerAccount.lastName, email: managerAccount.email, isDirectionManager: false } })).body.code, 'staff.managesDirections')
  check('D10 nor can the manager be deactivated', (await call('PATCH', `/api/teachers/${manager.id}/deactivate`, { token: admin })).body.code, 'staff.managesDirections')

  const spareDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: group.facultyId, name: `Spare ${stamp}`, shortName: `SP${stamp}` } })).body
  cleanup.addLast(`department ${spareDepartment.shortName}`, () => call('DELETE', `/api/departments/${spareDepartment.id}`, { token: admin }))
  const spareDirection = (await call('POST', '/api/directions', { token: admin, json: { departmentId: spareDepartment.id, name: `Spare ${stamp}`, managerId: manager.id } })).body
  cleanup.addLast(`direction ${spareDirection.name}`, () => call('DELETE', `/api/directions/${spareDirection.id}`, { token: admin }))
  check('D11 a department with directions cannot be deleted', (await call('DELETE', `/api/departments/${spareDepartment.id}`, { token: admin })).body.code, 'department.hasDirections')

  // ---------- topics under directions (§4.3) ----------
  async function makeTopic(token, title, json) {
    const response = await call('POST', '/api/topics', { token, json: { title, ...json } })
    if (response.status === 201) {
      cleanup.addLast(`topic ${title}`, () => call('DELETE', `/api/topics/${response.body.id}`, { token: admin }))
    }
    return response
  }
  const byManager = await makeTopic(manager.token, `Manager for supervisor ${stamp}`, { directionId: directionA.id, supervisorId: supervisor.id })
  check('T01 a manager publishes a topic for another teacher', `${byManager.status} ${byManager.body.supervisorId === supervisor.id}`, '201 true')
  check('T02 a teacher cannot name another supervisor', (await makeTopic(supervisor.token, `Not mine ${stamp}`, { directionId: directionA.id, supervisorId: manager.id })).body.code, 'direction.notManager')
  const bySupervisor = (await makeTopic(supervisor.token, `Supervisor own ${stamp}`, { directionId: directionA.id, description: 'Original description' })).body
  check('T03 a teacher publishes under any direction', bySupervisor.directionId, directionA.id)
  check('T04 a teacher cannot move a topic to another direction', (await call('PUT', `/api/topics/${bySupervisor.id}`, { token: supervisor.token, json: { title: bySupervisor.title, directionId: seedDirection.id } })).body.code, 'access.forbidden')
  check('T05 the manager sees the topics of their direction', (await call('GET', '/api/topics', { token: manager.token })).body.some((t) => t.id === bySupervisor.id), true)
  check('T06 a direction with topics cannot be deleted', (await call('DELETE', `/api/directions/${directionA.id}`, { token: manager.token })).body.code, 'direction.hasTopics')
  check('T07 a proposal names a direction of the student\'s department', (await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: 'Elsewhere', supervisorId: supervisor.id, directionId: spareDirection.id } })).body.code, 'direction.invalid')

  const satisfied = (reservation) => reservation.seats.filter((s) => s.isSatisfied).map((s) => s.seat).join(',')
  const proposal = (await call('POST', '/api/topics/proposals', { token: s5.token, json: { title: `Proposal ${stamp}`, supervisorId: supervisor.id, directionId: directionA.id } })).body
  check('T08 a proposal starts with no approvals', `${proposal.status}|${satisfied(proposal)}`, 'Pending|')

  // ---------- three approvals (§5.2) ----------
  const r1 = (await call('POST', `/api/topics/${byManager.body.id}/reserve`, { token: s1.token })).body
  check('A01 a reservation waits for approvals', r1.status, 'Pending')
  check('A02 the creator\'s seat starts approved', satisfied(r1), 'Direction')
  check('A03 a teacher without a seat cannot approve', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: teacher })).body.code, 'approval.notApprover')
  check('A04 an approved seat cannot approve again', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: manager.token })).body.code, 'approval.seatSatisfied')
  const afterSupervisor = (await call('POST', `/api/reservations/${r1.id}/approve`, { token: supervisor.token })).body
  check('A05 two of three approvals', `${afterSupervisor.status}|${satisfied(afterSupervisor)}`, 'Pending|Direction,Supervision')
  check('A06 the student holds no topic yet', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)
  check('A07 the administrator sees it waiting for them', (await call('GET', '/api/reservations/pending?waitingForMe=true', { token: admin })).body.some((r) => r.id === r1.id), true)
  check('A08 the supervisor no longer does', (await call('GET', '/api/reservations/pending?waitingForMe=true', { token: supervisor.token })).body.some((r) => r.id === r1.id), false)
  check('A09 the third approval completes it', (await call('POST', `/api/reservations/${r1.id}/approve`, { token: admin })).body.status, 'Approved')
  const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
  check('A10 the topic and the supervisor are the student\'s', `${s1Profile.topicId === byManager.body.id} ${s1Profile.supervisorId === supervisor.id}`, 'true true')

  // ---------- return, resubmit, edits, rejection (§5.3) ----------
  const r2 = (await call('POST', `/api/topics/${bySupervisor.id}/reserve`, { token: s2.token })).body
  check('R01 the supervisor\'s own topic starts with their approval', satisfied(r2), 'Supervision')
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: admin })
  check('R02 a return needs a comment', (await call('POST', `/api/reservations/${r2.id}/return`, { token: manager.token, json: { comment: ' ' } })).body.code, 'validation.failed')
  const returned = (await call('POST', `/api/reservations/${r2.id}/return`, { token: manager.token, json: { comment: 'Narrow the scope' } })).body
  check('R03 the manager returns it', `${returned.status}|${returned.returnComment}|${returned.canResubmit}`, 'Returned|Narrow the scope|false')
  check('R04 a returned request cannot be approved', (await call('POST', `/api/reservations/${r2.id}/approve`, { token: manager.token })).body.code, 'reservation.invalidState')
  check('R05 another student cannot resubmit it', (await call('POST', `/api/reservations/${r2.id}/resubmit`, { token: s1.token, json: { title: 'Mine now' } })).body.code, 'reservation.notYours')
  check('R05a the student may resubmit', (await call('GET', `/api/reservations/${r2.id}`, { token: s2.token })).body.canResubmit, true)
  const resubmitted = (await call('POST', `/api/reservations/${r2.id}/resubmit`, { token: s2.token, json: { title: `Narrowed ${stamp}`, description: 'Narrower' } })).body
  check('R06 resubmitting clears every approval', `${resubmitted.status}|${satisfied(resubmitted)}`, 'Pending|')
  check('R07 the catalogue topic carries the new wording while the request is open', (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body.title, `Narrowed ${stamp}`)
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: admin })
  await call('POST', `/api/reservations/${r2.id}/approve`, { token: supervisor.token })
  const edited = (await call('PUT', `/api/reservations/${r2.id}/wording`, { token: manager.token, json: { title: `Edited ${stamp}` } })).body
  check('R08 an approver\'s edit is their approval and reopens the others', `${edited.status}|${satisfied(edited)}`, 'Pending|Direction')
  check('R09 the timeline records every decision', edited.timeline.map((d) => d.kind).join(','), 'Approved,Approved,Returned,Approved,Approved,Edited')
  check('R10 any approver can reject', (await call('POST', `/api/reservations/${r2.id}/reject`, { token: admin, json: { comment: 'Not this year' } })).body.status, 'Rejected')
  const restored = (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body
  check('R11 the catalogue topic gets its original wording back', `${restored.status}|${restored.title}|${restored.description}`, `Available|Supervisor own ${stamp}|Original description`)
  check('R12 the history keeps the wording asked for', (await call('GET', '/api/reservations/mine', { token: s2.token })).body[0].topicTitle, `Supervisor own ${stamp}`)

  const r2b = (await call('POST', `/api/topics/${bySupervisor.id}/reserve`, { token: s2.token })).body
  await call('POST', `/api/reservations/${r2b.id}/approve`, { token: manager.token })
  const formEdit = await call('PUT', `/api/topics/${bySupervisor.id}`, { token: admin, json: { title: `Admin wording ${stamp}`, directionId: directionA.id, supervisorId: supervisor.id } })
  check('R13 an administrator\'s form edit reopens the other seats', `${formEdit.status}|${satisfied((await call('GET', `/api/reservations/${r2b.id}`, { token: admin })).body)}`, '200|Administration')
  await call('POST', `/api/reservations/${r2b.id}/cancel`, { token: s2.token })
  check('R14 a cancelled request gives the wording back too', (await call('GET', `/api/topics/${bySupervisor.id}`, { token: admin })).body.title, `Supervisor own ${stamp}`)

  // ---------- the administrator's assignment (§5.3) ----------
  const teacherTopic = (await makeTopic(teacher, `Seed manager topic ${stamp}`, { directionId: seedDirection.id })).body
  check('C01 the creator\'s two seats and the assignment complete it at once', (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: teacherTopic.id } })).body.status, 'Approved')
  const replacement = (await call('PUT', `/api/students/${s3.id}/topic`, { token: admin, json: { topicId: bySupervisor.id } })).body
  check('C02 an assignment over a held topic waits', `${replacement.status}|${satisfied(replacement)}`, 'Pending|Administration,Supervision')
  check('C03 the held topic stays the student\'s meanwhile', (await call('GET', `/api/students/${s3.id}`, { token: admin })).body.topicId, teacherTopic.id)
  check('C04 the manager\'s approval completes the replacement', (await call('POST', `/api/reservations/${replacement.id}/approve`, { token: manager.token })).body.status, 'Approved')
  check('C05 the old topic returns to the catalogue', (await call('GET', `/api/topics/${teacherTopic.id}`, { token: admin })).body.status, 'Available')

  // ---------- a change of supervisor can complete a request (§5.2) ----------
  const forSupervisor = (await makeTopic(manager.token, `For the supervisor ${stamp}`, { directionId: directionA.id, supervisorId: supervisor.id })).body
  const r4 = (await call('POST', `/api/topics/${forSupervisor.id}/reserve`, { token: s4.token })).body
  await call('POST', `/api/reservations/${r4.id}/approve`, { token: admin })
  const moved = await call('PUT', `/api/topics/${forSupervisor.id}`, { token: admin, json: { title: forSupervisor.title, directionId: directionA.id, supervisorId: manager.id } })
  check('S01 moving the topic to a supervisor who already approved completes it', `${moved.status}|${moved.body.status}`, '200|Approved')
  check('S02 the student\'s supervisor is the new one', (await call('GET', `/api/students/${s4.id}`, { token: admin })).body.supervisorId, manager.id)

  // ---------- the panel seats (§6) ----------
  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === group.facultyId)
    .sort((a, b) => a.order - b.order)
  await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: '2099-01-01T00:00:00Z' }] } })
  const groupStep = (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0]
  const s1Step = (await call('GET', '/api/student-tasks/mine', { token: s1.token })).body[0]
  const seatsOf = (step) => step.panel.map((s) => s.seat).join(',')
  check('P01 the direction manager sits beside the supervisor', seatsOf((await call('GET', `/api/student-tasks/${s1Step.id}`, { token: supervisor.token })).body), 'Supervisor,DirectionManager')
  check('P02 only a standards controller can be assigned', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: supervisor.id } })).body.code, 'groupTask.controllerInvalid')
  check('P03 a teacher cannot assign one', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: teacher, json: { userId: controller.id } })).status, 403)
  const assignedControl = (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: controller.id } })).body
  check('P04 the controller reaches every student of the step', assignedControl.affectedSteps, 5)
  const controllerAccount = (await call('GET', `/api/teachers/${controller.id}`, { token: admin })).body
  check('P05 the capability cannot be cleared while in use', (await call('PUT', `/api/teachers/${controller.id}`, { token: admin, json: { firstName: controllerAccount.firstName, lastName: controllerAccount.lastName, email: controllerAccount.email, isStandardsController: false } })).body.code, 'staff.controlsSteps')
  check('P06 the standards control seat joins the panel', seatsOf((await call('GET', `/api/student-tasks/${s1Step.id}`, { token: supervisor.token })).body), 'Supervisor,DirectionManager,StandardsControl')
  check('P07 the manager cannot be added as an extra reviewer', (await call('POST', `/api/student-tasks/${s1Step.id}/reviewers`, { token: admin, json: { reviewerId: manager.id } })).body.code, 'panel.reviewerExists')

  check('P08 the student submits', (await call('POST', `/api/student-tasks/${s1Step.id}/submissions`, { token: s1.token, form: form() })).status, 200)
  const controllerView = (await call('GET', `/api/student-tasks/${s1Step.id}`, { token: controller.token })).body
  check('P09 the controller opens the step and decides in their own seat', `${controllerView.canDecide} ${controllerView.mySeat}`, 'true StandardsControl')
  check('P10 the controller sees nothing else of the group', (await call('GET', `/api/groups/${group.id}/progress`, { token: controller.token })).status, 404)
  check('P11 the step waits in the controller\'s queue', (await call('GET', '/api/review/queue', { token: controller.token })).body.items.some((i) => i.studentTaskId === s1Step.id), true)
  check('P12 and in the manager\'s', (await call('GET', '/api/review/queue', { token: manager.token })).body.items.some((i) => i.studentTaskId === s1Step.id), true)
  const pendingId = controllerView.pendingSubmissionId
  check('P13 the controller approves without a mark', (await call('POST', `/api/submissions/${pendingId}/approve`, { token: controller.token, json: {} })).body.panelApproved, 1)
  check('P14 the manager\'s seat needs a mark', (await call('POST', `/api/submissions/${pendingId}/approve`, { token: manager.token, json: {} })).body.code, 'review.markRequired')
  await call('POST', `/api/submissions/${pendingId}/approve`, { token: manager.token, json: { mark: 80 } })
  const done = (await call('POST', `/api/submissions/${pendingId}/approve`, { token: supervisor.token, json: { mark: 91 } })).body
  check('P15 the step completes with the average of the marked seats', `${done.status} ${done.mark}`, 'Approved 86')
  check('P16 the group step counts one student through standards control', (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0].standardsControlApproved, 1)

  // A student who joins later has the controller's seat at once: it is derived from the group step.
  const late = await makeStudent('F')
  const lateStep = (await call('GET', '/api/student-tasks/mine', { token: late.token })).body[0]
  check('P17 a late joiner has the standards control seat', (await call('GET', `/api/student-tasks/${lateStep.id}`, { token: admin })).body.panel.some((s) => s.seat === 'StandardsControl' && s.reviewerId === controller.id), true)
  check('P18 removing the controller', (await call('PUT', `/api/group-tasks/${groupStep.id}/standards-controller`, { token: admin, json: { userId: null } })).status, 200)
  check('P19 the group step has no controller', (await call('GET', `/api/groups/${group.id}/tasks`, { token: admin })).body[0].standardsControllerId, null)
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

Cleanup ordering:
1. The group and the deadline are regular undos and run first. Removing the group archives the students, which cancels their open requests, releases their topics and deletes the proposal.
2. Then the late undos run, newest first: topics, then the spare direction and department, then direction A, and finally the three teachers' deactivation.

A teacher who managed a direction can only be deactivated once it is gone. The controller's group step is deleted with the group.

- [ ] **Step 5: Demo data**

Edit `.superpowers/demo/seed-demo.mjs` in eight places:

1. `TEACHERS`:
   - `petrenko` and `shevchuk` gain `isDirectionManager: true`;
   - a fourth teacher is added: `hrytsenko: { firstName: 'Наталія', lastName: 'Гриценко', patronymic: 'Павлівна', email: 'n.hrytsenko@diploma.local', isStandardsController: true }`.

   The creation loop already spreads each entry into the request, so the flags are sent.

2. After `TEACHERS`, add:

```js
// Design 2026-09-27: every topic belongs to a direction. Петренко manages the three directions of
// ІПЗ, Шевчук the one of ІСТ.
const DIRECTIONS = [
  { key: 'web', dept: 'ipz', manager: 'petrenko', name: 'Вебтехнології та мобільні застосунки', description: 'Вебсистеми, мобільні застосунки та їхня інфраструктура.' },
  { key: 'ai', dept: 'ipz', manager: 'petrenko', name: 'Інтелектуальні системи та аналіз даних', description: 'Машинне навчання, рекомендаційні системи, обробка природної мови.' },
  { key: 'quality', dept: 'ipz', manager: 'petrenko', name: 'Якість і автоматизація розробки ПЗ', description: 'Тестування, автоматизація процесів, планування ресурсів.' },
  { key: 'systems', dept: 'ist', manager: 'shevchuk', name: 'Інформаційні системи та безпека', description: 'Захист мереж, чат-боти, аналітичні панелі.' }
]
```

3. In `TOPICS`, replace each `dept: '...'` with a direction:
   - `monitoring`, `finance` and `volunteer` go to `direction: 'web'`;
   - `recommender` and `sentiment` go to `direction: 'ai'`;
   - `apitesting` and `schedule` go to `direction: 'quality'`;
   - `anomaly`, `chatbot` and `dashboard` go to `direction: 'systems'`.

4. In `STUDENTS`:
   - Бондаренко's comment becomes "step 2 waits for Коваленко and the standards controller after Петренко's approval ("1 of 3")".
   - Мельник's `extras` becomes `{ 0: ['shevchuk'] }`, and the word Петренко in his comment becomes Шевчук. Петренко manages his topic's direction and already sits on the panel.
   - Лисенко's `extras` becomes `{ 1: ['shevchuk'], 2: ['shevchuk'] }`. The comment "step 3 waits for two of three" stays true: supervisor Коваленко, manager Петренко and extra Шевчук.
   - Руденко's `topic` becomes `'returned:recommender'`, with the comment `// Руденко: the direction manager returned her topic request for a sharper wording.`.
   - The comment above `STUDENTS` gains `'returned:<key>'` in its list of topic forms.

5. After the group-reviewers loop (`for (const [key, teacher] of Object.entries(reviewers)) ...`), add:

```js
  console.log('Directions and standards control...')
  const directions = {}
  for (const d of DIRECTIONS) {
    directions[d.key] = await call('POST', '/api/directions', { token: teachers[d.manager].token, json: { departmentId: departments[d.dept].id, name: d.name, description: d.description } })
  }
  // Гриценко checks the formatting of ІП-21's first two steps for every student of the group.
  const ip21Steps = (await call('GET', `/api/groups/${groups.ip21.id}/tasks`, { token: admin })).sort((a, b) => a.taskOrder - b.taskOrder)
  for (const step of ip21Steps.slice(0, 2)) {
    await call('PUT', `/api/group-tasks/${step.id}/standards-controller`, { token: admin, json: { userId: teachers.hrytsenko.id } })
  }
  const controls = (s, stepIndex) => s.group === 'ip21' && stepIndex < 2
  const managerOf = (topic) => DIRECTIONS.find((d) => d.key === topic.direction).manager
```

6. Topic creation sends `directionId: directions[topic.direction].id` instead of `departmentId: departments[topic.dept].id`.

7. The student topic loop becomes:

```js
  // Design 2026-09-27 §5: a topic is the student's once the administration, the direction manager
  // and the supervisor have approved it. The supervisor created every catalogue topic, so their
  // seat - and the manager's, when that is the same person - starts approved.
  for (const s of students) {
    if (!s.topic) continue
    const [kind, key] = s.topic.includes(':') ? s.topic.split(':') : ['approved', s.topic]
    if (kind === 'approved' && key === 'proposal') continue
    const topic = topics[key]
    const supervisor = teachers[topic.supervisor]
    const managerKey = managerOf(topic)
    s.supervisorKey = topic.supervisor
    s.managerKey = managerKey
    const reservation = await call('POST', `/api/topics/${topic.id}/reserve`, { token: s.token })
    if (kind === 'approved') {
      await call('POST', `/api/reservations/${reservation.id}/approve`, { token: admin })
      if (managerKey !== topic.supervisor) {
        await call('POST', `/api/reservations/${reservation.id}/approve`, { token: teachers[managerKey].token })
      }
      s.topicTitle = topic.title
    } else if (kind === 'rejected') {
      // Deliberately without a comment: the student's topic page shows the rejection anyway.
      await call('POST', `/api/reservations/${reservation.id}/reject`, { token: supervisor.token, json: {} })
    } else if (kind === 'returned') {
      await call('POST', `/api/reservations/${reservation.id}/return`, { token: teachers[managerKey].token, json: { comment: 'Уточніть формулювання: тема має відображати предметну область і результат роботи.' } })
      s.topicTitle = topic.title
    } else {
      // 'pending': the creator's seats are in; the others still wait.
      s.topicTitle = topic.title
    }
  }
  for (const proposer of students.filter((s) => s.topic === 'proposal')) {
    const proposal = await call('POST', '/api/topics/proposals', { token: proposer.token, json: { title: proposer.proposal, description: 'Тему запропоновано студентом і погоджено з керівником.', supervisorId: teachers.petrenko.id, directionId: directions.web.id } })
    // Петренко supervises and manages the direction: one approval fills both seats.
    await call('POST', `/api/reservations/${proposal.id}/approve`, { token: teachers.petrenko.token })
    await call('POST', `/api/reservations/${proposal.id}/approve`, { token: admin })
    proposer.topicTitle = proposer.proposal
    proposer.supervisorKey = 'petrenko'
    proposer.managerKey = 'petrenko'
  }
```

8. In the submissions loop, after `const supervisor = teachers[s.supervisorKey]`, add

```js
    // Design 2026-09-27 §6: the direction manager, when not the supervisor, and the standards
    // controller of the group's step sit on the panel too.
    const manager = s.managerKey !== s.supervisorKey ? teachers[s.managerKey] : null
    const approveOthers = async (i, mark) => {
      if (manager) await decide(manager, 'approve', { mark: Math.min(100, mark + 2), comment: 'Погоджено керівником напряму.' })
      if (controls(s, i)) await decide(teachers.hrytsenko, 'approve', { comment: 'Оформлення відповідає вимогам нормоконтролю.' })
    }
```

   `approveOthers` takes the step index because `decide` is defined per step. Declare it inside the per-step loop, after `decide`, not after `supervisor`. Then:
   - In the `'returned'` branch, before `await decide(supervisor, 'approve', { mark: 85, ... })`, add `await approveOthers(i, 85)`.
   - In the approved branch, before `await decide(supervisor, 'approve', { mark, ... })`, add `await approveOthers(i, mark)`.
   - The `'submitted'` branch is unchanged: the step keeps waiting for every seat but the supervisor's.

9. The account list at the end labels each teacher:

```js
  for (const t of Object.values(teachers)) {
    const label = t.isDirectionManager ? 'Керівник напряму' : t.isStandardsController ? 'Нормоконтролер' : 'Викладач'
    console.log(`  ${label}   ${t.lastName} ${t.firstName} ${t.patronymic}: ${t.email}`)
  }
```

`.superpowers/demo/README.md`: in the accounts table,
- Петренко's and Шевчук's role cells become `Викладач, керівник напряму`;
- Петренко's description gains "Manages the three ІПЗ directions: approves every ІПЗ topic request and sits on the panels of their students.";
- Руденко's description gains "Topic request **returned for changes** by the direction manager: *Edit and resubmit* on the topics page.";
- Олійник's becomes "Topic request waiting for the administration: Петренко created the topic and manages its direction, so two of three approvals are in.";
- a new row goes after Шевчук: `| Нормоконтролер | Гриценко Наталія Павлівна | \`n.hrytsenko@diploma.local\` | Standards controller of ІП-21's first two steps: approves without a mark, from the review queue. |`.

Then add a walkthrough section after the phase 8 one:

```markdown
## Walkthrough (phase 11)

- **Administrator:**
  - *Topics → Directions*: four directions with their managers and topic counts.
  - *Topics*: Олійник's request waits for the administration seat; approve it and the student has a topic.
  - *Steps → Group steps → ФІОТ → ІП-21*: Гриценко controls steps 1–2. Change or remove the controller on step 3.
  - *Teachers*: the two responsibility checkboxes.
- **Петренко:**
  - *Directions*: her three directions; publish a topic for Коваленко.
  - *My topics*: requests in her directions with the three seats.
  - Her review queue includes Лисенко's and Мельник's steps as direction manager.
- **Гриценко:** the review queue lists Бондаренко's step 2; approve it without a mark.
- **Руденко:** the topics page shows the return comment; *Edit and resubmit* sends it back to all three approvers.
- **Any student with a topic:** *My topic* shows the three approvals and the history.
```

---

### Task 5: Client, shared components and translations

Everything the pages in Task 6 build on. Frontend paths are relative to `frontend/diploma-tracker-web/src/`. The pages still pass the old props until Task 6, so this task ends with the translation check; the full type check runs at the end of Task 6.

**Files:**
- Modify: `api/types.ts`, `api/reservationsApi.ts`, `api/groupTasksApi.ts`, `api/workflowApi.ts`
- Create: `api/directionsApi.ts`
- Create: `components/topics/ApprovalSeats.tsx`, `RequestTimeline.tsx`, `RequiredCommentModal.tsx`, `WordingModal.tsx`, `RequestActions.tsx`, `DirectionFormModal.tsx`
- Create: `components/workflow/StandardsControllerDialog.tsx`
- Modify: `components/topics/topicTones.ts`, `components/topics/TopicFormModal.tsx`, `components/topics/TopicDetailsModal.tsx`
- Modify: `components/workflow/ReviewPanelCard.tsx`, `components/workflow/DecisionPanel.tsx`
- Modify: `i18n/en.json`, `i18n/uk.json`

**Interfaces:**
- Consumes the wire shapes of Tasks 1–3.
- Produces for Task 6:
  - `ApprovalSeats({ seats })`;
  - `RequestTimeline({ timeline })`;
  - `RequestActions({ reservation, onChanged })`;
  - `WordingModal({ open, title, hint, confirmLabel, initialTitle, initialDescription, loading, onConfirm, onClose })`;
  - `DirectionFormModal({ open, initial, departments, managers, isAdmin, onClose, onSaved })`;
  - `StandardsControllerDialog({ groupTask, onClose, onChanged })`;
  - `TopicFormModal` now takes `directions: Direction[]` instead of `departments`, `supervisors: SupervisorOption[]` instead of `teachers`, and an optional `fixedDirectionId`.

- [ ] **Step 1: Types**

In `api/types.ts`:

1. `CurrentUser` gains `isDirectionManager: boolean` and `isStandardsController: boolean`.

2. `Teacher` gains `isDirectionManager: boolean` and `isStandardsController: boolean`. `CreateTeacherRequest` and `UpdateTeacherRequest` both gain `isDirectionManager: boolean` and `isStandardsController: boolean`.

3. `GroupTask` gains:

```ts
  standardsControllerId: string | null
  standardsControllerName: string | null
  /** Students whose step the current standards controller has approved. */
  standardsControlApproved: number
```

4. `ReservationStatus` becomes `'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Released' | 'Returned'`.

5. `Topic` gains, after `facultyName`:

```ts
  directionId: string
  directionName: string
  directionManagerId: string
  directionManagerName: string
```

and after `hasSubmissions`:

```ts
  /** Whether the caller may open the topic form / delete the topic. */
  canEdit: boolean
  canDelete: boolean
```

6. `TopicRequest` replaces `departmentId: string` with `directionId: string`. `TopicQuery` gains `directionId?: string`. `ProposeTopicRequest` gains `directionId: string`.

7. Add, after `TopicRequest`:

```ts
export type Direction = {
  id: string
  name: string
  description: string | null
  departmentId: string
  departmentName: string
  facultyId: string
  facultyName: string
  managerId: string
  managerName: string
  topicsAvailable: number
  topicsReserved: number
  topicsApproved: number
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export type DirectionRequest = {
  departmentId: string
  name: string
  description?: string
  /** Administrators only. */
  managerId?: string
}

export type DirectionQuery = {
  departmentId?: string
  managerId?: string
  mine?: boolean
}

export type ApprovalSeatName = 'Administration' | 'Direction' | 'Supervision'

export type ApprovalSeat = {
  seat: ApprovalSeatName
  holderName: string | null
  isSatisfied: boolean
  approvedByName: string | null
  approvedAt: string | null
}

export type ReservationDecisionKind = 'Approved' | 'Returned' | 'Rejected' | 'Edited'

export type ReservationDecision = {
  kind: ReservationDecisionKind
  deciderName: string
  comment: string | null
  decidedAt: string
}

export type WordingRequest = {
  title: string
  description?: string
}
```

8. `Reservation` gains, after `supervisorName`:

```ts
  directionId: string | null
  directionName: string | null
  directionManagerName: string | null
```

and at the end:

```ts
  /** The three seats of an open request; empty otherwise. */
  seats: ApprovalSeat[]
  timeline: ReservationDecision[]
  returnComment: string | null
  canDecide: boolean
  canEditWording: boolean
  canReject: boolean
  canRelease: boolean
  canResubmit: boolean
```

The comment on `currentTopicId` becomes `/** Set only on an open request from a student who already holds a topic: that topic. */`.

9. `ReviewSeat` becomes `'Supervisor' | 'DirectionManager' | 'Extra' | 'StandardsControl'`.

10. `StepDetails` gains `/** The caller's seat when they can decide. */ mySeat: ReviewSeat | null`.

11. Add:

```ts
export type StandardsControllerChange = {
  groupTaskId: string
  affectedSteps: number
  approvedSteps: number
}

export type StaffCapability = 'directionManager' | 'standardsController'
```

- [ ] **Step 2: API modules**

`api/directionsApi.ts`:

```ts
import { apiRequest } from './apiClient'
import type { Direction, DirectionQuery, DirectionRequest } from './types'

function toQueryString(query: DirectionQuery): string {
  const params = new URLSearchParams()
  if (query.departmentId) params.set('departmentId', query.departmentId)
  if (query.managerId) params.set('managerId', query.managerId)
  if (query.mine) params.set('mine', 'true')
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function getDirections(query: DirectionQuery = {}): Promise<Direction[]> {
  return apiRequest<Direction[]>(`/api/directions${toQueryString(query)}`)
}

export function createDirection(request: DirectionRequest): Promise<Direction> {
  return apiRequest<Direction>('/api/directions', { method: 'POST', body: JSON.stringify(request) })
}

export function updateDirection(id: string, request: DirectionRequest): Promise<Direction> {
  return apiRequest<Direction>(`/api/directions/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deleteDirection(id: string): Promise<void> {
  await apiRequest<void>(`/api/directions/${id}`, { method: 'DELETE' })
}
```

`api/reservationsApi.ts`:
- the import gains `WordingRequest`;
- `getReservationsForDecision` becomes

```ts
/** `Pending` returns every open request (waiting for approvers or returned to the student). */
export function getReservationsForDecision(status: Extract<ReservationStatus, 'Pending' | 'Approved'> = 'Pending', waitingForMe = false): Promise<Reservation[]> {
  return apiRequest<Reservation[]>(`/api/reservations/pending?status=${status}${waitingForMe ? '&waitingForMe=true' : ''}`)
}
```

- and four functions are added:

```ts
export function getReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}`)
}

export function returnReservation(id: string, comment: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/return`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export function editReservationWording(id: string, request: WordingRequest): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/wording`, { method: 'PUT', body: JSON.stringify(request) })
}

export function resubmitReservation(id: string, request: WordingRequest): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/resubmit`, { method: 'POST', body: JSON.stringify(request) })
}
```

The comment on `setStudentTopic` becomes `/** Assigns a topic (it still needs the other approvals) or, with null, clears it. Admin only. */`.

`api/groupTasksApi.ts`: import `StandardsControllerChange` and add

```ts
/** `null` removes the group step's standards controller. Admin only. */
export async function setStandardsController(groupTaskId: string, userId: string | null): Promise<StandardsControllerChange> {
  return apiRequest<StandardsControllerChange>(`/api/group-tasks/${groupTaskId}/standards-controller`, {
    method: 'PUT',
    body: JSON.stringify({ userId })
  })
}
```

`api/workflowApi.ts`:
- `approveSubmission`'s mark becomes optional: `export function approveSubmission(id: string, mark: number | null, comment?: string)`. The body sends `{ mark: mark ?? undefined, comment }`.
- `searchStaff` gains a capability: `export function searchStaff(search: string, capability?: StaffCapability)`. It sets `params.set('capability', capability)` when given, in the same `URLSearchParams` the function already builds.

- [ ] **Step 3: Small shared components**

`components/topics/topicTones.ts`: `reservationStatusTone` gains `Returned: 'warning'`.

`components/topics/ApprovalSeats.tsx`:

```tsx
import { Check, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import type { ApprovalSeat } from '../../api/types'

/** Design 2026-09-27 §5.4: the three approvals of an open topic request. */
export function ApprovalSeats({ seats }: { seats: ApprovalSeat[] }) {
  const { t } = useTranslation()
  if (seats.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('topics.approvalsLabel')}>
      {seats.map((seat) => (
        <li key={seat.seat}>
          <Badge tone={seat.isSatisfied ? 'success' : 'neutral'}>
            <span className="inline-flex items-center gap-1">
              {seat.isSatisfied ? <Check className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
              {t(`topics.seat.${seat.seat}`)}
              {seat.holderName ? ` · ${seat.holderName}` : ''}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}
```

`components/topics/RequestTimeline.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReservationDecision } from '../../api/types'

/** The decisions made on a topic request, oldest first. */
export function RequestTimeline({ timeline }: { timeline: ReservationDecision[] }) {
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  if (timeline.length === 0) return null

  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('topics.history')}</h4>
      <ol className="mt-1 flex flex-col gap-1">
        {timeline.map((decision, index) => (
          <li key={`${decision.decidedAt}-${index}`} className="text-sm text-text-strong">
            <span className="text-text-muted">{dateFormat.format(new Date(decision.decidedAt))}</span>
            {' · '}
            {decision.deciderName} — {t(`topics.decisionKind.${decision.kind}`)}
            {decision.comment && <span className="block pl-4 text-text-muted">{decision.comment}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
```

`components/topics/RequiredCommentModal.tsx`: a sibling of `DecisionCommentModal` whose comment is required.

```tsx
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'

type RequiredCommentModalProps = {
  open: boolean
  title: ReactNode
  label: string
  confirmLabel: string
  loading?: boolean
  onConfirm: (comment: string) => void
  onClose: () => void
}

export function RequiredCommentModal({ open, title, label, confirmLabel, loading = false, onConfirm, onClose }: RequiredCommentModalProps) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setComment('')
      setError('')
    }
  }, [open])

  const close = () => {
    if (loading) return
    onClose()
  }

  const confirm = () => {
    if (comment.trim() === '') {
      setError(t('validation.required'))
      return
    }
    onConfirm(comment.trim())
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={confirm}>{confirmLabel}</Button>
        </>
      }
    >
      <Textarea label={label} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} error={error} />
    </Modal>
  )
}
```

`components/topics/WordingModal.tsx`:

```tsx
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { WordingRequest } from '../../api/types'

type WordingModalProps = {
  open: boolean
  title: ReactNode
  hint: string
  confirmLabel: string
  initialTitle: string
  initialDescription: string | null
  loading?: boolean
  onConfirm: (request: WordingRequest) => void
  onClose: () => void
}

/** A topic's title and description: an approver's edit, or a returned student's resubmission. */
export function WordingModal({ open, title, hint, confirmLabel, initialTitle, initialDescription, loading = false, onConfirm, onClose }: WordingModalProps) {
  const { t } = useTranslation()
  const [topicTitle, setTopicTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setTopicTitle(initialTitle)
      setDescription(initialDescription ?? '')
    }
  }, [open, initialTitle, initialDescription])

  const close = () => {
    if (loading) return
    onClose()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onConfirm({ title: topicTitle.trim(), description: optional(description) })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{t('common.cancel')}</Button>
          <Button form="wording-form" type="submit" loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">{hint}</p>
      <form id="wording-form" onSubmit={submit} className="flex flex-col gap-4">
        <TextField label={t('topics.title')} maxLength={300} value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} required />
        <Textarea label={t('topics.description')} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>
    </Modal>
  )
}
```

- [ ] **Step 4: The approver's actions**

`components/topics/RequestActions.tsx`: one place for Approve, Return, Reject and Edit wording on a request, driven by the flags the API computes.

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import { approveReservation, editReservationWording, rejectReservation, returnReservation } from '../../api/reservationsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/useToast'
import { DecisionCommentModal } from './DecisionCommentModal'
import { RequiredCommentModal } from './RequiredCommentModal'
import { WordingModal } from './WordingModal'
import type { Reservation } from '../../api/types'

type Action = 'approve' | 'return' | 'reject' | 'wording' | null

type RequestActionsProps = {
  reservation: Reservation
  /** Called after every successful action, and after a 409 so the list catches up. */
  onChanged: () => void
}

export function RequestActions({ reservation, onChanged }: RequestActionsProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [action, setAction] = useState<Action>(null)
  const [isBusy, setIsBusy] = useState(false)

  const run = async (work: () => Promise<Reservation>, success: (result: Reservation) => string) => {
    setIsBusy(true)
    try {
      const result = await work()
      setAction(null)
      toast.success(success(result))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
      if (err instanceof ApiError && err.status === 409) {
        setAction(null)
        onChanged()
      }
    } finally {
      setIsBusy(false)
    }
  }

  if (reservation.status === 'Returned') {
    return (
      <div className="flex items-center gap-1">
        <Badge tone="warning">{t('topics.waitingForStudent')}</Badge>
        {reservation.canReject && (
          <Button variant="ghost" size="sm" onClick={() => setAction('reject')}>{t('topics.reject')}</Button>
        )}
        <DecisionCommentModal
          open={action === 'reject'}
          title={t('topics.rejectTitle')}
          confirmLabel={t('topics.reject')}
          tone="danger"
          loading={isBusy}
          onConfirm={(comment) => void run(() => rejectReservation(reservation.id, comment), () => t('topics.rejected'))}
          onClose={() => setAction(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {reservation.canDecide && (
        <>
          <Button size="sm" onClick={() => setAction('approve')}>{t('topics.approve')}</Button>
          <Button variant="secondary" size="sm" onClick={() => setAction('return')}>{t('topics.return')}</Button>
        </>
      )}
      {reservation.canEditWording && (
        <Button variant="ghost" size="sm" onClick={() => setAction('wording')}>{t('topics.editWording')}</Button>
      )}
      {reservation.canReject && (
        <Button variant="ghost" size="sm" onClick={() => setAction('reject')}>{t('topics.reject')}</Button>
      )}

      <ConfirmDialog
        open={action === 'approve'}
        title={t('topics.approve')}
        message={t('topics.approveConfirm', { title: reservation.topicTitle, student: reservation.studentName })}
        tone="primary"
        loading={isBusy}
        onConfirm={() => void run(() => approveReservation(reservation.id), (result) => t(result.status === 'Approved' ? 'topics.approved' : 'topics.approvalRecorded'))}
        onCancel={() => setAction(null)}
      />
      <RequiredCommentModal
        open={action === 'return'}
        title={t('topics.returnTitle')}
        label={t('topics.returnComment')}
        confirmLabel={t('topics.return')}
        loading={isBusy}
        onConfirm={(comment) => void run(() => returnReservation(reservation.id, comment), () => t('topics.returnedToast'))}
        onClose={() => setAction(null)}
      />
      <DecisionCommentModal
        open={action === 'reject'}
        title={t('topics.rejectTitle')}
        confirmLabel={t('topics.reject')}
        tone="danger"
        loading={isBusy}
        onConfirm={(comment) => void run(() => rejectReservation(reservation.id, comment), () => t('topics.rejected'))}
        onClose={() => setAction(null)}
      />
      <WordingModal
        open={action === 'wording'}
        title={t('topics.editWording')}
        hint={t('topics.editWordingHint')}
        confirmLabel={t('common.save')}
        initialTitle={reservation.topicTitle}
        initialDescription={reservation.topicDescription}
        loading={isBusy}
        onConfirm={(request) => void run(() => editReservationWording(reservation.id, request), () => t('topics.wordingSaved'))}
        onClose={() => setAction(null)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Direction and topic forms**

`components/topics/DirectionFormModal.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createDirection, updateDirection } from '../../api/directionsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { Department, Direction, StaffOption } from '../../api/types'

type DirectionFormModalProps = {
  open: boolean
  initial?: Direction
  departments: Department[]
  /** Direction managers, for an administrator's form; ignored otherwise. */
  managers: StaffOption[]
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

export function DirectionFormModal({ open, initial, departments, managers, isAdmin, onClose, onSaved }: DirectionFormModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [departmentError, setDepartmentError] = useState('')
  const [managerError, setManagerError] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setDepartmentId(initial?.departmentId ?? '')
    setManagerId(initial?.managerId ?? '')
    setDepartmentError('')
    setManagerError('')
    setError('')
  }, [open, initial])

  const departmentOptions: SelectOption[] = departments.map((d) => ({ value: d.id, label: `${d.name} · ${d.facultyName}` }))
  const managerOptions: SelectOption[] = managers.map((m) => ({ value: m.id, label: m.name }))
  if (initial && !managers.some((m) => m.id === initial.managerId)) {
    managerOptions.push({ value: initial.managerId, label: initial.managerName })
  }

  const close = () => {
    if (isSaving) return
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const departmentMissing = !departmentId
    const managerMissing = isAdmin && !managerId
    setDepartmentError(departmentMissing ? t('validation.required') : '')
    setManagerError(managerMissing ? t('validation.required') : '')
    if (departmentMissing || managerMissing) return

    const request = {
      departmentId,
      name: name.trim(),
      description: optional(description),
      managerId: isAdmin ? managerId : undefined
    }

    setError('')
    setIsSaving(true)
    try {
      if (initial) {
        await updateDirection(initial.id, request)
      } else {
        await createDirection(request)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  const managerChanged = isAdmin && initial && managerId !== initial.managerId

  return (
    <Modal
      open={open}
      onClose={close}
      title={initial ? t('directions.edit') : t('directions.add')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="direction-form" type="submit" loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      <form id="direction-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField label={t('directions.name')} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label={t('directions.description')} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label={t('directions.department')}
          value={departmentId}
          onChange={setDepartmentId}
          options={departmentOptions}
          placeholder={t('common.select')}
          error={departmentError}
        />
        {isAdmin && (
          managerOptions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('directions.noManagers')}</p>
          ) : (
            <Select
              label={t('directions.manager')}
              value={managerId}
              onChange={setManagerId}
              options={managerOptions}
              placeholder={t('common.select')}
              hint={managerChanged ? t('directions.managerHint') : undefined}
              error={managerError}
            />
          )
        )}
      </form>
    </Modal>
  )
}
```

`components/topics/TopicFormModal.tsx`: the form picks a direction instead of a department.
- `departments: Department[]` becomes `directions: Direction[]` in the props, and a new optional prop `fixedDirectionId?: string` pre-selects the direction and hides the picker (the direction manager's *Add topic* on a direction row).
- `FormState.departmentId` becomes `directionId`, filled from `initial.directionId` or `fixedDirectionId`.
- The options are grouped by department in the label: `` `${direction.name} · ${direction.departmentName}` ``. Direction and supervisor validation errors keep the existing pattern.
- The request sends `directionId`.
- The supervisor picker shows when `showSupervisor` is true, as today.
- The `Select` label is `t('topics.direction')`, and `showSupervisorMoveWarning` is unchanged.
- The import of `Department` becomes `Direction`.
- `teachers: Teacher[]` becomes `supervisors: SupervisorOption[]`, the active teachers. `/api/teachers` is administrator-only, so a direction manager's page passes `getTopicSupervisors()`, and the administrator's page maps its active teachers to `{ id, name: `${lastName} ${firstName}` }`. The options become `supervisors.map((s) => ({ value: s.id, label: s.name }))`. The existing "keep a deactivated current supervisor selectable" rule now checks `supervisors.some((s) => s.id === initial.supervisorId)`.

`components/topics/TopicDetailsModal.tsx`: the department line becomes two lines, *Direction: name · manager* then *Department: name · faculty*, using `topic.directionName`, `topic.directionManagerName`, `topic.departmentName` and `topic.facultyName`, and `t('topics.direction')` / `t('directions.manager')` for the labels.

- [ ] **Step 6: Step panel for the new seats**

`components/workflow/ReviewPanelCard.tsx`: the approved badge reads

```tsx
{seat.state === 'Approved'
  ? (seat.mark === null ? t('steps.seatState.ApprovedNoMark') : t('steps.seatState.Approved', { mark: seat.mark }))
  : t(`steps.seatState.${seat.state}`)}
```

The seat label already reads `t(`steps.seat.${seat.seat}`)`, so the two new seats only need translations.

`components/workflow/DecisionPanel.tsx`: the standards control seat approves without a mark.
- `const needsMark = step.mySeat !== 'StandardsControl'`.
- `validateApprove` checks the mark only when `needsMark`.
- The mark `TextField` renders only when `needsMark`; otherwise a `<p className="text-sm text-text-muted">{t('steps.standardsControlHint')}</p>` takes its place.
- `approveSubmission(step.pendingSubmissionId, needsMark ? Number(mark) : null, comment.trim() || undefined)`.
- The approve confirmation message is `needsMark ? t('steps.approveConfirm', { mark }) : t('steps.approveConfirmNoMark')`.

- [ ] **Step 7: The standards controller dialog**

`components/workflow/StandardsControllerDialog.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setStandardsController } from '../../api/groupTasksApi'
import { searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { useToast } from '../ui/useToast'
import type { GroupTask, StaffOption } from '../../api/types'

type StandardsControllerDialogProps = {
  groupTask: GroupTask
  onClose: () => void
  onChanged: () => void
}

/** Design 2026-09-27 §6.1: set, change or remove the standards controller of one group step. */
export function StandardsControllerDialog({ groupTask, onClose, onChanged }: StandardsControllerDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [controllers, setControllers] = useState<StaffOption[]>([])
  const [selected, setSelected] = useState(groupTask.standardsControllerId ?? '')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    searchStaff('', 'standardsController')
      .then((options) => { if (!cancelled) setControllers(options) })
      .catch((err) => { if (!cancelled) toast.error(errorMessage(err)) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const options: SelectOption[] = controllers.map((c) => ({ value: c.id, label: c.name }))
  const selectedName = controllers.find((c) => c.id === selected)?.name ?? groupTask.standardsControllerName ?? ''

  const save = async (userId: string | null) => {
    setIsSaving(true)
    try {
      await setStandardsController(groupTask.id, userId)
      toast.success(t(userId ? 'taskTemplates.controllerSet' : 'taskTemplates.controllerRemoved'))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!isSaving) onClose() }}
      title={t('taskTemplates.controllerTitle', { step: groupTask.taskTitle })}
      footer={
        <>
          {groupTask.standardsControllerId && (
            <Button variant="danger" onClick={() => void save(null)} disabled={isSaving}>{t('taskTemplates.removeController')}</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button
            onClick={() => void save(selected)}
            loading={isSaving}
            disabled={!selected || selected === groupTask.standardsControllerId}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!isLoading && options.length === 0 ? (
        <p className="text-sm text-text-muted">{t('taskTemplates.noControllers')}</p>
      ) : (
        <Select label={t('taskTemplates.standardsController')} value={selected} onChange={setSelected} options={options} placeholder={t('common.select')} />
      )}
      {selected && selected !== groupTask.standardsControllerId && (
        <p className="text-sm text-text-muted">{t('taskTemplates.controllerConfirm', { name: selectedName, step: groupTask.taskTitle })}</p>
      )}
      {groupTask.standardsControllerId && (
        <p className="text-sm text-text-muted">{t('taskTemplates.removeHint')}</p>
      )}
    </Modal>
  )
}
```

`Button` already has a `danger` variant (used by `DecisionCommentModal`).

- [ ] **Step 8: Translations**

Add to **both** files. Keys marked *(change)* replace an existing value. `errors.topic.departmentInvalid` and `errors.reservation.notSupervisor` are deleted from both.

`i18n/en.json`:

```json
{
  "nav": { "directions": "Directions" },
  "directions": {
    "title": "Directions",
    "myTitle": "My directions",
    "add": "Add direction",
    "edit": "Edit direction",
    "name": "Name",
    "description": "Description",
    "department": "Department",
    "manager": "Direction manager",
    "topicCounts": "{{available}} available · {{reserved}} reserved · {{approved}} approved",
    "deleteTitle": "Delete direction",
    "deleteConfirm": "Delete the direction «{{name}}»?",
    "none": "No directions yet.",
    "addTopic": "Add topic",
    "topicsTitle": "Topics in my directions",
    "noTopics": "No topics in your directions yet.",
    "managerHint": "Open topic requests and step reviews in this direction move to the new manager.",
    "noManagers": "No teacher is a direction manager yet. Tick the responsibility on the Teachers page."
  },
  "topics": {
    "direction": "Direction",
    "allDirections": "All directions",
    "sections": { "topics": "Topics", "directions": "Directions" },
    "seat": { "Administration": "Administration", "Direction": "Direction manager", "Supervision": "Supervisor" },
    "approvalsLabel": "Approvals",
    "waitingForStudent": "Waiting for the student",
    "return": "Return for changes",
    "returnTitle": "Return the request for changes",
    "returnComment": "What should the student change?",
    "returnedToast": "The request was returned to the student",
    "editWording": "Edit wording",
    "editWordingHint": "Your edit counts as your approval; the other approvers approve the new wording again.",
    "wordingSaved": "Wording saved",
    "approvalRecorded": "Your approval is recorded",
    "returnedNotice": "Your request was returned for changes",
    "resubmit": "Edit and resubmit",
    "resubmitHint": "After you resubmit, every approver approves the new wording again.",
    "resubmitted": "Request sent again",
    "history": "History",
    "decisionKind": { "Approved": "approved", "Returned": "returned for changes", "Rejected": "rejected", "Edited": "edited the wording" },
    "noDirectionsForProposal": "Your department has no directions yet.",
    "reserveConfirm": "Reserve \"{{title}}\"? It becomes yours once the administration, the direction manager and the supervisor approve it; until then you cannot reserve another topic.",
    "proposeHint": "The chosen teacher, the direction manager and the administration receive the proposal; once all three approve, it becomes your topic.",
    "assigned": "Topic assigned. It becomes the student's once every approver has approved it.",
    "replaceConfirm": "Assign \"{{next}}\" instead of \"{{current}}\"? The current topic stays the student's until the new one is approved."
  },
  "reservations": { "status": { "Returned": "Returned for changes" } },
  "steps": {
    "seat": { "DirectionManager": "Direction manager", "StandardsControl": "Standards control" },
    "seatState": { "ApprovedNoMark": "Approved" },
    "standardsControlHint": "Standards control: approve the formatting, or return it with a comment. No mark is given.",
    "approveConfirmNoMark": "Approve this version?"
  },
  "taskTemplates": {
    "sections": { "templates": "Templates", "groupSteps": "Group steps" },
    "group": "Group",
    "selectGroup": "Select a group to see its steps.",
    "noGroupSteps": "This group has no steps yet.",
    "deadline": "Deadline",
    "standardsController": "Standards controller",
    "standardsPassed": "Passed standards control",
    "passedCount": "{{passed}} of {{total}}",
    "setController": "Set standards controller",
    "changeController": "Change",
    "removeController": "Remove standards controller",
    "controllerTitle": "Standards controller for «{{step}}»",
    "noControllers": "No teacher is a standards controller yet. Tick the responsibility on the Teachers page.",
    "controllerConfirm": "{{name}} will check «{{step}}» for every student of the group who has not passed it yet. Approved steps keep their result.",
    "removeHint": "Removing the controller approves at once any step that was waiting only for them.",
    "controllerSet": "Standards controller assigned",
    "controllerRemoved": "Standards controller removed"
  },
  "teachers": {
    "responsibilities": "Responsibilities",
    "isDirectionManager": "Direction manager",
    "isStandardsController": "Standards controller"
  },
  "errors": {
    "direction": {
      "notFound": "Direction not found.",
      "invalid": "Choose a direction of your department.",
      "nameTaken": "A direction with this name already exists in the department.",
      "hasTopics": "The direction still has topics.",
      "notManager": "You do not manage this direction.",
      "managerInvalid": "Choose an active teacher who is a direction manager.",
      "departmentInvalid": "The selected department does not exist."
    },
    "approval": {
      "notApprover": "You do not approve this topic request.",
      "seatSatisfied": "Your approval of this request is already recorded."
    },
    "staff": {
      "managesDirections": "This teacher manages a direction. Hand it to another manager first.",
      "controlsSteps": "This teacher is the standards controller of a group step. Assign someone else first."
    },
    "reservation": { "changed": "Someone else acted on this request first. Reload and try again." },
    "groupTask": { "controllerInvalid": "Choose an active teacher who is a standards controller." },
    "department": { "hasDirections": "The department cannot be deleted while it has directions." }
  }
}
```

`i18n/uk.json`:

```json
{
  "nav": { "directions": "Напрями" },
  "directions": {
    "title": "Напрями",
    "myTitle": "Мої напрями",
    "add": "Додати напрям",
    "edit": "Редагувати напрям",
    "name": "Назва",
    "description": "Опис",
    "department": "Кафедра",
    "manager": "Керівник напряму",
    "topicCounts": "вільних: {{available}} · заброньованих: {{reserved}} · затверджених: {{approved}}",
    "deleteTitle": "Видалити напрям",
    "deleteConfirm": "Видалити напрям «{{name}}»?",
    "none": "Напрямів ще немає.",
    "addTopic": "Додати тему",
    "topicsTitle": "Теми моїх напрямів",
    "noTopics": "У ваших напрямах ще немає тем.",
    "managerHint": "Відкриті запити на затвердження тем і рецензування етапів цього напряму перейдуть до нового керівника.",
    "noManagers": "Жоден викладач ще не є керівником напряму. Позначте це на сторінці «Викладачі»."
  },
  "topics": {
    "direction": "Напрям",
    "allDirections": "Усі напрями",
    "sections": { "topics": "Теми", "directions": "Напрями" },
    "seat": { "Administration": "Адміністрація", "Direction": "Керівник напряму", "Supervision": "Керівник роботи" },
    "approvalsLabel": "Погодження",
    "waitingForStudent": "Очікує студента",
    "return": "Повернути на доопрацювання",
    "returnTitle": "Повернути запит на доопрацювання",
    "returnComment": "Що студенту слід змінити?",
    "returnedToast": "Запит повернуто студенту",
    "editWording": "Редагувати формулювання",
    "editWordingHint": "Ваше редагування зараховується як ваше погодження; інші погоджувачі мають погодити нове формулювання.",
    "wordingSaved": "Формулювання збережено",
    "approvalRecorded": "Ваше погодження враховано",
    "returnedNotice": "Ваш запит повернуто на доопрацювання",
    "resubmit": "Редагувати й надіслати знову",
    "resubmitHint": "Після повторного надсилання всі погоджувачі мають погодити нове формулювання.",
    "resubmitted": "Запит надіслано повторно",
    "history": "Історія",
    "decisionKind": { "Approved": "погодження", "Returned": "повернення на доопрацювання", "Rejected": "відхилення", "Edited": "редагування формулювання" },
    "noDirectionsForProposal": "На вашій кафедрі ще немає напрямів.",
    "reserveConfirm": "Забронювати тему «{{title}}»? Вона стане вашою після погодження адміністрацією, керівником напряму та керівником роботи; доти інші теми бронювати не можна.",
    "proposeHint": "Пропозицію отримають обраний викладач, керівник напряму та адміністрація; після погодження всіма трьома тема стане вашою.",
    "assigned": "Тему призначено. Вона стане темою студента після погодження всіма погоджувачами.",
    "replaceConfirm": "Призначити «{{next}}» замість «{{current}}»? Поточна тема залишиться за студентом, доки нову не буде погоджено."
  },
  "reservations": { "status": { "Returned": "Повернуто на доопрацювання" } },
  "steps": {
    "seat": { "DirectionManager": "Керівник напряму", "StandardsControl": "Нормоконтроль" },
    "seatState": { "ApprovedNoMark": "Зараховано" },
    "standardsControlHint": "Нормоконтроль: зарахуйте оформлення або поверніть його з коментарем. Оцінка не ставиться.",
    "approveConfirmNoMark": "Зарахувати цю версію?"
  },
  "taskTemplates": {
    "sections": { "templates": "Шаблони", "groupSteps": "Етапи груп" },
    "group": "Група",
    "selectGroup": "Оберіть групу, щоб побачити її етапи.",
    "noGroupSteps": "Групі ще не призначено етапів.",
    "deadline": "Термін",
    "standardsController": "Нормоконтролер",
    "standardsPassed": "Пройшли нормоконтроль",
    "passedCount": "{{passed}} з {{total}}",
    "setController": "Призначити нормоконтролера",
    "changeController": "Змінити",
    "removeController": "Зняти нормоконтролера",
    "controllerTitle": "Нормоконтролер етапу «{{step}}»",
    "noControllers": "Жоден викладач ще не є нормоконтролером. Позначте це на сторінці «Викладачі».",
    "controllerConfirm": "{{name}} перевірятиме етап «{{step}}» у кожного студента групи, який ще його не пройшов. Зараховані етапи залишаються зарахованими.",
    "removeHint": "Після зняття нормоконтролера етапи, що чекали лише на нього, зараховуються одразу.",
    "controllerSet": "Нормоконтролера призначено",
    "controllerRemoved": "Нормоконтролера знято"
  },
  "teachers": {
    "responsibilities": "Обов'язки",
    "isDirectionManager": "Керівник напряму",
    "isStandardsController": "Нормоконтролер"
  },
  "errors": {
    "direction": {
      "notFound": "Напрям не знайдено.",
      "invalid": "Оберіть напрям вашої кафедри.",
      "nameTaken": "Напрям із такою назвою вже є на цій кафедрі.",
      "hasTopics": "У напрямі ще є теми.",
      "notManager": "Ви не керуєте цим напрямом.",
      "managerInvalid": "Оберіть активного викладача, який є керівником напряму.",
      "departmentInvalid": "Обраної кафедри не існує."
    },
    "approval": {
      "notApprover": "Ви не погоджуєте цей запит на тему.",
      "seatSatisfied": "Ваше погодження цього запиту вже враховано."
    },
    "staff": {
      "managesDirections": "Цей викладач керує напрямом. Спочатку передайте напрям іншому керівнику.",
      "controlsSteps": "Цей викладач є нормоконтролером етапу групи. Спочатку призначте іншого."
    },
    "reservation": { "changed": "Хтось інший уже прийняв рішення щодо цього запиту. Оновіть сторінку й спробуйте ще раз." },
    "groupTask": { "controllerInvalid": "Оберіть активного викладача, який є нормоконтролером." },
    "department": { "hasDirections": "Неможливо видалити кафедру, поки в неї є напрями." }
  }
}
```

The blocks above show only the new and changed keys: merge them into the existing objects, keeping every other key. Keep each file's key order consistent with its neighbours. The `topics.decisionKind` values read as "name — kind" in `RequestTimeline`.

- [ ] **Step 9: Type check and translations**

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run i18n:check
```

Expected:
- `i18n:check` passes.
- `tsc` reports errors only in the four pages Task 6 rewrites:
  - `pages/AdminTopicsPage.tsx` and `pages/TeacherTopicsPage.tsx` (the topic form's new props);
  - `pages/StudentTopicsPage.tsx` (a proposal needs `directionId`);
  - `pages/TeachersPage.tsx` (the teacher requests' new required flags).

  An error in any other file is this task's to fix.

---

### Task 6: Pages and navigation

The new components come with complete code. Existing pages get focused edits that name the exact state and props they touch. Frontend paths are relative to `frontend/diploma-tracker-web/src/`.

**Files:**
- Create: `components/topics/TopicRequestsTable.tsx`, `components/topics/DirectionsSection.tsx`, `components/workflow/GroupStepsSection.tsx`, `pages/DirectionsPage.tsx`
- Modify: `components/layout/navigation.ts`, `components/layout/AppShell.tsx`, `App.tsx`
- Modify: `pages/AdminTopicsPage.tsx`, `pages/TeacherTopicsPage.tsx`, `pages/StudentTopicsPage.tsx`, `components/topics/MyTopicCard.tsx`
- Modify: `pages/TaskTemplatesPage.tsx`, `pages/TeachersPage.tsx`

**Interfaces:**
- Consumes everything Task 5 produced.
- Produces the `/teacher/directions` route. The *Directions* tab appears for a teacher with `isDirectionManager`.

- [ ] **Step 1: The requests table**

`components/topics/TopicRequestsTable.tsx`:

```tsx
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { ApprovalSeats } from './ApprovalSeats'
import { RequestActions } from './RequestActions'
import type { Reservation } from '../../api/types'

type TopicRequestsTableProps = {
  rows: Reservation[]
  loading: boolean
  onChanged: () => void
}

/** Open topic requests with their three approvals (design 2026-09-27 §5.4); the ones waiting for
 *  the caller come first. */
export function TopicRequestsTable({ rows, loading, onChanged }: TopicRequestsTableProps) {
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b.canDecide) - Number(a.canDecide)), [rows])

  const columns: DataTableColumn<Reservation>[] = [
    {
      key: 'student',
      header: t('topics.student'),
      render: (reservation) => (
        <div>
          <p>{reservation.studentName}</p>
          <p className="text-xs text-text-muted">{reservation.groupCode}</p>
        </div>
      )
    },
    {
      key: 'topic',
      header: t('topics.title'),
      render: (reservation) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>{reservation.topicTitle}</span>
            {reservation.origin === 'StudentProposal' && <Badge tone="neutral">{t('topics.proposalBadge')}</Badge>}
            {reservation.currentTopicId && <Badge tone="warning">{t('topics.changeBadge')}</Badge>}
          </div>
          <p className="text-xs text-text-muted">{reservation.directionName} · {reservation.supervisorName}</p>
          {reservation.currentTopicId && (
            <p className="text-xs text-text-muted">{t('topics.currentTopicLabel', { title: reservation.currentTopicTitle })}</p>
          )}
          <ApprovalSeats seats={reservation.seats} />
        </div>
      )
    },
    { key: 'requestedAt', header: t('topics.requestedAt'), render: (reservation) => dateFormat.format(new Date(reservation.createdAt)) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (reservation) => <RequestActions reservation={reservation} onChanged={onChanged} />
    }
  ]

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      getRowKey={(reservation) => reservation.id}
      loading={loading}
      emptyState={<EmptyState message={t('topics.noRequests')} />}
    />
  )
}
```

- [ ] **Step 2: The directions section**

`components/topics/DirectionsSection.tsx`:

```tsx
import { ListPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../../api/departmentsApi'
import { deleteDirection, getDirections } from '../../api/directionsApi'
import { searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../ui/useToast'
import { DirectionFormModal } from './DirectionFormModal'
import type { Department, Direction, StaffOption } from '../../api/types'

type DirectionsSectionProps = {
  /** 'admin' lists every direction and names managers; 'manager' lists the caller's own. */
  mode: 'admin' | 'manager'
  /** When given, each row offers "Add topic" (the direction manager's page). */
  onAddTopic?: (direction: Direction) => void
  /** Reports the loaded directions, e.g. for the page's topic form. */
  onLoaded?: (directions: Direction[]) => void
}

export function DirectionsSection({ mode, onAddTopic, onLoaded }: DirectionsSectionProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const isAdmin = mode === 'admin'

  const [directions, setDirections] = useState<Direction[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [managers, setManagers] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Direction | undefined>(undefined)
  const [deleting, setDeleting] = useState<Direction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [directionsData, departmentsData, managersData] = await Promise.all([
        getDirections(isAdmin ? {} : { mine: true }),
        getDepartments(),
        isAdmin ? searchStaff('', 'directionManager') : Promise.resolve([] as StaffOption[])
      ])
      setDirections(directionsData)
      setDepartments(departmentsData)
      setManagers(managersData)
      onLoaded?.(directionsData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(undefined)
    setIsFormOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteDirection(deleting.id)
      setDeleting(null)
      toast.success(t('common.deletedToast'))
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: DataTableColumn<Direction>[] = [
    {
      key: 'name',
      header: t('directions.name'),
      render: (direction) => (
        <div>
          <p className="font-medium text-text-strong">{direction.name}</p>
          {direction.description && <p className="text-xs text-text-muted">{direction.description}</p>}
        </div>
      )
    },
    { key: 'department', header: t('directions.department'), render: (direction) => `${direction.departmentName} · ${direction.facultyName}` },
    ...(isAdmin ? [{ key: 'manager', header: t('directions.manager'), render: (direction: Direction) => direction.managerName }] : []),
    {
      key: 'topics',
      header: t('topics.catalogueTitle'),
      render: (direction) => t('directions.topicCounts', {
        available: direction.topicsAvailable,
        reserved: direction.topicsReserved,
        approved: direction.topicsApproved
      })
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (direction) => (
        <div className="flex items-center gap-1">
          {onAddTopic && (
            <Button variant="ghost" size="sm" icon={ListPlus} onClick={() => onAddTopic(direction)}>{t('directions.addTopic')}</Button>
          )}
          {direction.canManage && (
            <>
              <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => { setEditing(direction); setIsFormOpen(true) }} />
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                aria-label={t('common.delete')}
                onClick={() => setDeleting(direction)}
                disabled={direction.topicsAvailable + direction.topicsReserved + direction.topicsApproved > 0}
              />
            </>
          )}
        </div>
      )
    }
  ]

  return (
    <Card
      title={isAdmin ? t('directions.title') : t('directions.myTitle')}
      className="mb-6"
      actions={<Button size="sm" icon={Plus} onClick={openCreate}>{t('directions.add')}</Button>}
    >
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
      <DataTable
        columns={columns}
        rows={directions}
        getRowKey={(direction) => direction.id}
        loading={isLoading}
        emptyState={<EmptyState message={t('directions.none')} />}
      />

      <DirectionFormModal
        open={isFormOpen}
        initial={editing}
        departments={departments}
        managers={managers}
        isAdmin={isAdmin}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false)
          toast.success(t('common.savedToast'))
          void load()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('directions.deleteTitle')}
        message={deleting ? t('directions.deleteConfirm', { name: deleting.name }) : ''}
        loading={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  )
}
```

`Card` already takes an `actions` prop (see `ReviewPanelCard`).

- [ ] **Step 3: The direction manager's page**

`pages/DirectionsPage.tsx`:

```tsx
import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { deleteTopic, getTopics, getTopicSupervisors } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/useToast'
import { DirectionsSection } from '../components/topics/DirectionsSection'
import { TopicFormModal } from '../components/topics/TopicFormModal'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import type { Direction, SupervisorOption, Topic } from '../api/types'

/** Design 2026-09-27 §8: a direction manager's directions, and the topics in them. */
export function DirectionsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [directions, setDirections] = useState<Direction[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formDirectionId, setFormDirectionId] = useState<string | undefined>(undefined)
  const [editingTopic, setEditingTopic] = useState<Topic | undefined>(undefined)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadTopics = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [topicsData, supervisorsData] = await Promise.all([getTopics(), getTopicSupervisors()])
      setTopics(topicsData.filter((topic) => topic.directionManagerId === user?.id))
      setSupervisors(supervisorsData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  if (user && !user.isDirectionManager) {
    return <Navigate to="/teacher/dashboard" replace />
  }

  const confirmDeleteTopic = async () => {
    if (!deletingTopic) return
    setIsDeleting(true)
    try {
      await deleteTopic(deletingTopic.id)
      setDeletingTopic(null)
      toast.success(t('common.deletedToast'))
      await loadTopics()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: DataTableColumn<Topic>[] = [
    { key: 'title', header: t('topics.title'), render: (topic) => topic.title },
    { key: 'direction', header: t('topics.direction'), render: (topic) => topic.directionName },
    { key: 'supervisor', header: t('topics.supervisor'), render: (topic) => topic.supervisorName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    { key: 'student', header: t('topics.student'), render: (topic) => (topic.studentName ? `${topic.studentName} · ${topic.groupCode ?? ''}` : '—') },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} disabled={!topic.canEdit}
            onClick={() => { setEditingTopic(topic); setFormDirectionId(undefined); setIsFormOpen(true) }} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} disabled={!topic.canDelete}
            onClick={() => setDeletingTopic(topic)} />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader title={t('directions.myTitle')} />

      <DirectionsSection
        mode="manager"
        onLoaded={setDirections}
        onAddTopic={(direction) => {
          setEditingTopic(undefined)
          setFormDirectionId(direction.id)
          setIsFormOpen(true)
        }}
      />

      <Card title={t('directions.topicsTitle')}>
        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        <DataTable
          columns={columns}
          rows={topics}
          getRowKey={(topic) => topic.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('directions.noTopics')} />}
        />
      </Card>

      <TopicFormModal
        open={isFormOpen}
        mode={editingTopic ? 'edit' : 'create'}
        initial={editingTopic}
        showSupervisor
        directions={directions}
        supervisors={supervisors}
        fixedDirectionId={formDirectionId}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false)
          toast.success(t('common.savedToast'))
          void loadTopics()
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingTopic)}
        title={t('topics.deleteTitle')}
        message={deletingTopic ? t('topics.deleteConfirm', { title: deletingTopic.title }) : ''}
        loading={isDeleting}
        onConfirm={() => void confirmDeleteTopic()}
        onCancel={() => setDeletingTopic(null)}
      />
    </>
  )
}
```

The *Directions* card's counts refresh when the page reloads. A topic added from the page does not re-run the section's own load; that is acceptable for a count.

- [ ] **Step 4: Navigation and the route**

`components/layout/navigation.ts`:
- `NavItem` gains `/** Shown only to a teacher with this capability. */ requires?: 'directionManager'`.
- The teacher list gains `{ to: '/teacher/directions', labelKey: 'nav.directions', requires: 'directionManager' }` directly after `nav.myTopics`.

`components/layout/AppShell.tsx`: before `.map(...)`, filter the items:

```tsx
    ? navigationByRole[user.role]
        .filter((item) => item.requires !== 'directionManager' || user.isDirectionManager)
        .map((item) => ({
```

`App.tsx`: import `DirectionsPage`, and inside the `allowedRoles={['Teacher']}` block add `<Route path="teacher/directions" element={<DirectionsPage />} />`.

- [ ] **Step 5: Teacher topics**

`pages/TeacherTopicsPage.tsx`:
1. Imports:
   - drop `approveReservation`, `rejectReservation`, `getDepartments` and `Badge`;
   - add `getDirections` from `../api/directionsApi`, `useAuth`, and `TopicRequestsTable`;
   - `Department` becomes `Direction` in the type import.
2. State:
   - `departments` becomes `directions: Direction[]`;
   - delete `approving`, `isApproving`, `rejecting` and `isRejecting`, with `confirmApprove`, `confirmReject`, their `ConfirmDialog` and the reject `DecisionCommentModal`.
3. `loadAll` loads `getDirections()` in the place of `getDepartments()`. Its comment names the direction lookup instead.
4. The *Requests* card's `DataTable` becomes `<TopicRequestsTable rows={pendingRequests} loading={isLoading} onChanged={() => void loadAll()} />`. Delete `requestColumns`.
5. The approved list's action column shows *Release* only when `reservation.canRelease`, and nothing otherwise. The `hasSubmissions` tooltip branch stays inside that condition.
6. *My catalogue* lists `ownTopics.filter((topic) => topic.supervisorId === user?.id)`: a direction manager's direction topics live on their *Directions* page.
7. In `ownTopicsColumns`:
   - `department` becomes `{ key: 'direction', header: t('topics.direction'), render: (topic) => topic.directionName }`;
   - edit is disabled by `!topic.canEdit` and delete by `!topic.canDelete`;
   - the local `editable` goes.
8. `TopicFormModal` gets `directions={directions}` and `supervisors={[]}` (with `showSupervisor={false}` as before).

- [ ] **Step 6: Administrator topics**

`pages/AdminTopicsPage.tsx`:
1. Imports:
   - drop `approveReservation` and `rejectReservation`; keep `releaseReservation`;
   - add `getDirections`, `getReservationsForDecision`, `DirectionsSection` and `TopicRequestsTable`;
   - add `Direction` and `Reservation` to the type import.
2. State:
   - add `section` (`'topics' | 'directions'`, default `'topics'`), `directions: Direction[]`, `directionId` (filter, `''`), `requests: Reservation[]` and `isLoadingRequests`;
   - delete `approving`, `isApproving`, `rejecting` and `isRejecting`, with `confirmApprove`, `confirmReject` and their dialogs.
3. `loadFilters` also loads `getDirections()` into `directions`. A new `loadRequests` loads `getReservationsForDecision('Pending')` into `requests`. It runs on mount and after every topic change (`handleTopicSaved`, delete, release): each of those also calls `void loadRequests()`.
4. `loadTopics` passes `directionId: directionId || undefined`, and `directionId` joins the effect's dependencies.
5. Under `PageHeader`:

```tsx
      <div className="mb-6">
        <SegmentedControl
          ariaLabel={t('topics.adminTitle')}
          value={section}
          onChange={(value) => setSection(value as 'topics' | 'directions')}
          options={[
            { value: 'topics', label: t('topics.sections.topics') },
            { value: 'directions', label: t('topics.sections.directions') }
          ]}
        />
      </div>
```

   - When `section === 'directions'`, render `<DirectionsSection mode="admin" onLoaded={setDirections} />` and nothing else from the topics view.
   - Otherwise render, in order, a `Card title={t('topics.requestsTitle')} className="mb-6"` holding `<TopicRequestsTable rows={requests} loading={isLoadingRequests} onChanged={() => { void loadRequests(); void loadTopics() }} />`, then the existing filters-and-table card.
   - The `PageHeader`'s *Add topic* button shows only in the topics section.
6. The filter row gains `<Select label={t('topics.direction')} value={directionId} onChange={setDirectionId} options={directionOptions} />` after the department select, with `directionOptions = [{ value: '', label: t('topics.allDirections') }, ...directions.map((d) => ({ value: d.id, label: `${d.name} · ${d.departmentName}` }))]`.
7. In `columns`:
   - `department` becomes `{ key: 'direction', header: t('topics.direction'), render: (topic) => `${topic.directionName} · ${topic.departmentName}` }`;
   - the `activeReservationStatus === 'Pending'` approve/reject pair is deleted. Open requests are decided in the requests card now;
   - the release branch stays.
8. `TopicFormModal` gets `directions={directions}` and `supervisors={teachers.filter((teacher) => teacher.isActive).map((teacher) => ({ id: teacher.id, name: `${teacher.lastName} ${teacher.firstName}` }))}`.

- [ ] **Step 7: Student topics and *My topic***

`pages/StudentTopicsPage.tsx`:
1. Imports: add `getDirections` and `Direction`.
2. State:
   - add `directions: Direction[]` and `directionId` (filter, `''`);
   - `ProposeFormState` gains `directionId: string` (`emptyProposeForm` has `''`), with `proposeDirectionError`.
3. `loadContext` also loads `getDirections()` (the student's department only, by the API) into `directions`. `loadTopics` passes `directionId: directionId || undefined`, and `directionId` joins its effect's dependencies.
4. `pendingReservation` becomes `openReservation = reservations.find((r) => r.status === 'Pending' || r.status === 'Returned') ?? null`, and `hasPending` reads it.
5. The filter row gains a direction `Select` (`t('topics.direction')`, first option `t('topics.allDirections')`). The catalogue columns gain `{ key: 'direction', header: t('topics.direction'), render: (topic) => topic.directionName }` after the title.
6. The proposal modal gains a direction `Select` before the teacher select (`t('topics.direction')`, options `directions`, `placeholder={t('common.select')}`, `error={proposeDirectionError}`).
   - `submitPropose` checks it as it checks the teacher and sends `directionId: proposeForm.directionId`.
   - When `directions.length === 0` the modal shows `t('topics.noDirectionsForProposal')` in place of the select, and the submit button is disabled the way it already is when there are no teachers.

`components/topics/MyTopicCard.tsx`:
1. Imports: add `resubmitReservation`, `ApprovalSeats`, `RequestTimeline` and `WordingModal`.
2. `pending` becomes `open = reservations.find((r) => r.status === 'Pending' || r.status === 'Returned') ?? null`, and every use of `pending` reads `open`.
3. State: `resubmitting` (boolean) and `isResubmitting`.
4. In the "no approved, one open" block and in the change-request block, under the supervisor line:
   - add `<p className="text-xs text-text-muted">{open.directionName}</p>` and `<ApprovalSeats seats={open.seats} />`;
   - when `open.status === 'Returned'`, add:

```tsx
          <div className="mt-2 rounded-card bg-warning-soft p-3">
            <p className="text-sm font-semibold text-warning">{t('topics.returnedNotice')}</p>
            {open.returnComment && <p className="mt-1 text-sm text-text-strong">{open.returnComment}</p>}
            {open.canResubmit && (
              <Button size="sm" className="mt-2" onClick={() => setResubmitting(true)}>{t('topics.resubmit')}</Button>
            )}
          </div>
```

   - then `<RequestTimeline timeline={open.timeline} />`.
5. Below the card's `ConfirmDialog`:

```tsx
      <WordingModal
        open={resubmitting && open !== null}
        title={t('topics.resubmit')}
        hint={t('topics.resubmitHint')}
        confirmLabel={t('topics.resubmit')}
        initialTitle={open?.topicTitle ?? ''}
        initialDescription={open?.topicDescription ?? null}
        loading={isResubmitting}
        onConfirm={(request) => void confirmResubmit(request)}
        onClose={() => setResubmitting(false)}
      />
```

   `confirmResubmit` has the same shape as `confirmCancel`:
   - it calls `resubmitReservation(open.id, request)` and shows `toast.success(t('topics.resubmitted'))`;
   - it closes the modal, then calls `onChanged?.()` when controlled or `await load()` otherwise;
   - it shows `toast.error(errorMessage(err))` on failure.

   If `Button` does not accept `className`, wrap it in a `<div className="mt-2">`.
6. The approved block adds `<p className="text-xs text-text-muted">{approved.directionName}</p>` under the supervisor line.

- [ ] **Step 8: *Steps → Group steps***

`components/workflow/GroupStepsSection.tsx`:

```tsx
import { UserCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGroups } from '../../api/groupsApi'
import { getTasksForGroup } from '../../api/groupTasksApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { Select, type SelectOption } from '../ui/Select'
import { StandardsControllerDialog } from './StandardsControllerDialog'
import type { Group, GroupTask } from '../../api/types'

type GroupStepsSectionProps = {
  /** The faculty picked on the Steps page; its groups are offered. */
  facultyId: string
}

/** Design 2026-09-27 §8: Steps → Group steps → a group → its steps, each with its standards
 *  controller. The controller applies to every student of the group on that step. */
export function GroupStepsSection({ facultyId }: GroupStepsSectionProps) {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()

  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState('')
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<GroupTask | null>(null)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  useEffect(() => {
    let cancelled = false
    getGroups()
      .then((data) => {
        if (cancelled) return
        const inFaculty = data.filter((group) => group.facultyId === facultyId)
        setGroups(inFaculty)
        setGroupId((current) => (inFaculty.some((group) => group.id === current) ? current : ''))
      })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId])

  const loadTasks = useCallback(async () => {
    if (!groupId) {
      setTasks([])
      return
    }
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await getTasksForGroup(groupId)
      setTasks([...data].sort((a, b) => a.taskOrder - b.taskOrder))
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const groupOptions: SelectOption[] = groups.map((group) => ({ value: group.id, label: `${group.code} · ${group.academicYear}` }))

  const columns: DataTableColumn<GroupTask>[] = [
    { key: 'order', header: t('taskTemplates.order'), render: (task) => task.taskOrder },
    { key: 'title', header: t('taskTemplates.titleField'), render: (task) => task.taskTitle },
    { key: 'deadline', header: t('taskTemplates.deadline'), render: (task) => dateFormat.format(new Date(task.deadline)) },
    { key: 'controller', header: t('taskTemplates.standardsController'), render: (task) => task.standardsControllerName ?? t('common.notAssigned') },
    {
      key: 'passed',
      header: t('taskTemplates.standardsPassed'),
      render: (task) => (task.standardsControllerId
        ? t('taskTemplates.passedCount', { passed: task.standardsControlApproved, total: task.studentTaskCount })
        : '—')
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (task) => (
        <Button variant="secondary" size="sm" icon={UserCheck} onClick={() => setEditing(task)}>
          {task.standardsControllerId ? t('taskTemplates.changeController') : t('taskTemplates.setController')}
        </Button>
      )
    }
  ]

  return (
    <Card>
      <div className="mb-4 max-w-xs">
        <Select label={t('taskTemplates.group')} value={groupId} onChange={setGroupId} options={groupOptions} placeholder={t('common.select')} />
      </div>
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
      {!groupId ? (
        <EmptyState message={t('taskTemplates.selectGroup')} />
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          getRowKey={(task) => task.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('taskTemplates.noGroupSteps')} />}
        />
      )}

      {editing && (
        <StandardsControllerDialog
          groupTask={editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null)
            void loadTasks()
          }}
        />
      )}
    </Card>
  )
}
```

`pages/TaskTemplatesPage.tsx`:
- Add state `const [section, setSection] = useState<'templates' | 'groupSteps'>('templates')` and import `GroupStepsSection`. `SegmentedControl` is already imported by other pages; import it here.
- The `PageHeader`'s *Add step* action shows only when `section === 'templates'`.
- Directly after the faculty `Card`, for administrators only:

```tsx
      {isAdmin && (
        <div className="mb-6">
          <SegmentedControl
            ariaLabel={t('taskTemplates.title')}
            value={section}
            onChange={(value) => setSection(value as 'templates' | 'groupSteps')}
            options={[
              { value: 'templates', label: t('taskTemplates.sections.templates') },
              { value: 'groupSteps', label: t('taskTemplates.sections.groupSteps') }
            ]}
          />
        </div>
      )}
```

- The existing templates `Card` renders when `section === 'templates'`. Otherwise, with a faculty selected, render `<GroupStepsSection facultyId={selectedFacultyId} />`. Teachers never see the switch and keep the read-only templates.

- [ ] **Step 9: Teachers**

`pages/TeachersPage.tsx`:
1. `TeacherFormState` and `emptyForm` gain `isDirectionManager: false` and `isStandardsController: false`. `openEditTeacher` copies both from the teacher. `submitTeacher` sends both on create and update.
2. The form ends with a small group:

```tsx
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-heading">{t('teachers.responsibilities')}</legend>
            <Checkbox label={t('teachers.isDirectionManager')} checked={teacherForm.isDirectionManager}
              onChange={(checked) => setTeacherForm((prev) => ({ ...prev, isDirectionManager: checked }))} />
            <Checkbox label={t('teachers.isStandardsController')} checked={teacherForm.isStandardsController}
              onChange={(checked) => setTeacherForm((prev) => ({ ...prev, isStandardsController: checked }))} />
          </fieldset>
```

   Import `Checkbox` from `../components/ui/Checkbox`.
3. A column after the name shows the capabilities as badges: `teachers.isDirectionManager` with tone `info`, and `teachers.isStandardsController` with tone `info`. It shows `—` when neither is set.

- [ ] **Step 10: Frontend gates**

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: no type errors; lint 0 errors 0 warnings; i18n matching; a successful build.

```bash
cd frontend/diploma-tracker-web/src && grep -n "departmentId" components/topics/TopicFormModal.tsx components/topics/MyTopicCard.tsx pages/TeacherTopicsPage.tsx pages/StudentTopicsPage.tsx pages/DirectionsPage.tsx
```

Expected: no output. A topic is never addressed by department any more. `AdminTopicsPage` keeps its department filter, and the direction components use `departmentId` for directions; those are expected, and the grep leaves them out.

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
grep -n "\"Directions\"\|\"ReservationDecisions\"\|IX_Directions_DepartmentId_Name\|IX_Topics_DirectionId_Status\|StandardsControllerId\|IsDirectionManager\|IsStandardsController\|ContentChangedAt" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected:
- the `Directions` and `ReservationDecisions` tables are created;
- `IX_Directions_DepartmentId_Name` is created with `unique: true`;
- `Topics` has `DirectionId` and `CreatedById` and no `DepartmentId`;
- `GroupTasks` has `StandardsControllerId` and `StandardsControllerAssignedAt`;
- `Users` has both capability columns;
- `TopicReservations` has `ContentChangedAt` and `TopicDescription`.

```bash
grep -n "IX_TopicReservations_ActivePerTopic\|IX_TopicReservations_OpenPerStudent\|IX_TopicReservations_ApprovedPerStudent\|IX_StudentProfiles_TopicId" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected, each with its own filter:
- `ActivePerTopic` on `('Pending', 'Returned', 'Approved')`;
- `OpenPerStudent` on `('Pending', 'Returned')`;
- `ApprovedPerStudent` on `'Approved'`;
- the topic index on `[TopicId] IS NOT NULL`.

No `PendingPerStudent` may remain.

```bash
grep -n "onDelete: ReferentialAction.Cascade" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs | grep -i "direction\|decider\|StandardsController\|CreatedBy"
```

Expected: no output. Those foreign keys are `Restrict`, which the migration writes as `NoAction`.

- [ ] **Step 5: Start and settle the model**

Ask the controller to start the API. It applies the migration and re-seeds, including the `Software Engineering` direction and the seeded teacher's two capabilities. Then:

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
node .superpowers/checks/directions-approval-check.mjs
```

```bash
for script in topics-check review-panels-check workflow-check hardening-check document-routing-check templates-check refinements-check onboarding-check design-system-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: every script fully passing and ending with `Cleanup: nothing left behind.`

```bash
node .superpowers/demo/seed-demo.mjs
```

Expected: the run completes and lists four teachers, including the direction managers and the standards controller.

- [ ] **Step 7: Whole-phase review**

Dispatch one `code-reviewer` over the whole phase (`git diff 1e76dc8`, excluding `Migrations/`), with the spec and this plan as references. Ask it to check in particular:
- the two-phase saves in `ReservationService` (`CompleteAsync`, `SetStudentTopicAsync`);
- that every write path on a request touches the topic's `RowVersion`;
- that the queue predicate in `WaitingForCallerQuery` mirrors `ReviewPanel.Evaluate`'s absorption order;
- that visibility grants nothing beyond §6.2.

Fix the Critical and Important findings in one wave, re-run Step 6's scripts, and have the reviewer re-check the fixes once. List the test gaps it names under the phase's `test-backlog.md` section, and record deferred Minors in the log line of Step 8.

- [ ] **Step 8: Project records**

`docs/superpowers/PROJECT_MEMORY.md`:
- **Status table:** phase 11's row becomes `Done — commit <hash>`, with the plan path in its last column.
- **Gotchas**, add:
  - "**A topic request is open while `Pending` or `Returned`,** and it becomes the student's topic only when `TopicApprovalPanel` finds all three seats satisfied: any administrator, the current direction manager and the current supervisor, each by an `Approved` or `Edited` `ReservationDecision` no older than `ContentChangedAt`. The creator's seats start approved. Completion happens in the save of the approval that fills the last seat, or through `CompleteSatisfiedRequestsAsync` after a change of supervisor, direction or manager."
  - "**A catalogue topic gets its wording back when its request ends without approval** (rejected or cancelled): `TopicReservation.TopicTitle`/`TopicDescription` are the snapshot. A release keeps the current wording."
  - "**Step panel seats are Supervisor, DirectionManager, Extra and StandardsControl, one per person, first match wins.** The direction manager comes from the student's topic's direction and the standards controller from `GroupTask`. Neither is ever copied to the student step, so late joiners and manager changes need nothing. The standards control seat never carries a mark."
  - "**Direction manager and standards controller are flags on teacher accounts** until phase 12, read from the database on every request. A flag in use cannot be cleared, and its teacher cannot be deactivated (`staff.managesDirections`, `staff.controlsSteps`)."
  - "**`giveTopic` in the check scripts needs a direction-manager teacher**: it opens a direction managed by that teacher. The seeded teacher is one."
- **Log:** add one dated line summarising phase 11: the checks per script and in total, and the review outcome.

`docs/superpowers/test-backlog.md`: add

```markdown
## Phase 11 — Directions, topic approval and standards control

- `TopicApprovalPanel.Evaluate`:
  - the administration seat is filled by any administrator's approval, the direction seat only by the current manager's, the supervision seat only by the current supervisor's;
  - approvals older than `ContentChangedAt` do not count;
  - an `Edited` decision counts as an approval;
  - one person's approval fills both of their seats.
- `TopicApprovalPanel.SeatsOf`: an administrator holds only the administration seat; a teacher who manages the direction and supervises the topic holds two.
- `ReservationService`:
  - the creator's approval is written only for an active creator who holds a seat;
  - approve / return / edit need `Pending`, reject works on `Returned`, resubmit needs `Returned` and the owning student;
  - a rejection or cancellation restores a catalogue topic's wording, a release does not;
  - the administrator's assignment completes at once when the creator's seats cover the rest, and otherwise leaves a held topic in place until completion;
  - two concurrent approvals of the last seat yield one completion and one `reservation.changed`.
- `ReviewPanel.Evaluate`:
  - seat order;
  - absorption of the manager into the supervisor seat and of a controller into any earlier seat;
  - a standards control approval before `StandardsControllerAssignedAt` does not count;
  - `AverageMark` ignores the standards control seat.
- `StudentWorkflowService.SetStandardsControllerAsync`:
  - approved steps untouched;
  - a removal completes a submitted step waiting only for the controller;
  - the same controller again is a no-op.
- `AccessScope`: a direction manager sees their direction's students like a supervisor; a standards controller sees only the steps they control.
- `TeacherService`: clearing a capability in use and deactivating its holder are refused.
- `DirectionService`: department change refused with topics; only an administrator changes the manager; a manager change completes requests the new manager already approved.
```

- [ ] **Step 9: Commit**

```bash
git add -A
```

```bash
git status --short
```

Check the list:
- `.superpowers/checks/directions-approval-check.mjs` must appear;
- `.superpowers/sdd/`, `App_Data/`, `bin/`, `obj/`, `PROJECT_PAPER.md` and `frontend/diploma-tracker-web/README.md` must not.

```bash
git commit -m "Implement directions, topic approval and standards control"
```

```bash
git log --oneline -3
```

Expected: `Implement directions, topic approval and standards control` on top, followed by the planning commits.

- [ ] **Step 10: Report and stop**

Report to the owner:
- the verification numbers from Step 6, the review outcome and the commit hash;
- that **the other machine must drop its own database** when it next pulls;
- a plain-language list for manual testing, per role:
  - **Administrator:**
    - *Teachers*: tick *Direction manager* / *Standards controller*.
    - *Topics → Directions*: create, edit, reassign a manager, delete an empty one.
    - *Topics*: the requests card with three approvals; approve, return, reject, edit wording.
    - Assigning a topic from the student form now waits for the other approvals.
    - *Steps → Group steps*: pick a faculty and group, set, change or remove a step's standards controller.
  - **Direction manager** (a teacher with the tick):
    - the *Directions* tab: own directions, add a topic for any teacher, edit/delete available ones;
    - *My topics → Requests* includes requests in their directions;
    - their review queue includes the steps of their direction's students, where they approve with a mark.
  - **Teacher:** the topic form picks a direction; requests show three approvals; approving alone no longer completes a topic unless they hold the other seats.
  - **Standards controller:** the review queue lists the steps they control; the decision form has no mark field.
  - **Student:**
    - the catalogue has a direction filter; a proposal needs a direction;
    - *My topic* shows the three approvals and the history;
    - a returned request shows the comment and *Edit and resubmit*;
    - steps unlock only after all three approvals.
- The demo accounts to use: `.superpowers/demo/README.md`, *Walkthrough (phase 11)*.

Then stop. The owner tests by hand and reports defects as follow-up commits. Phase 12 (scoped staff roles) gets its own plan after that.

---

## Plan self-review

- **Spec coverage:**
  - §3 staff capabilities: flags, guards and picker in Task 1 Steps 1, 10; the client in Task 5 Step 1 and Task 6 Step 9.
  - §4.1 model and §4.2 rules: Task 1 Steps 1–2, 5–6, 11; the manager-change hook in Task 2 Step 9.
  - §4.3 topics under directions: Task 1 Steps 7–9.
  - §5.1 model: Task 1 Step 1 (`Returned`); Task 2 Steps 1–2.
  - §5.2 seats, the creator's approval and completion: Task 2 Steps 4, 7 and 9.
  - §5.3 lifecycle and who may act: Task 2 Steps 7–8; the administrator's form edit in Task 2 Step 9.
  - §5.4 who sees requests: Task 2 Step 7 (`GetForDecisionAsync`, `GetAsync`); Task 1 Step 8 (manager's topic list).
  - §6 panel seats and marks: Task 3 Steps 1–2, 5.
  - §6.1 assigning the controller: Task 3 Steps 5 (15)–6.
  - §6.2 visibility: Task 3 Steps 3, 5 (12–14) and 7; seat labels in Task 5 Steps 6, 8.
  - §7 API and error codes: Tasks 1–3; every code is in a catalogue (Task 1 Step 3, Task 2 Step 3) and in both translation files (Task 5 Step 8).
  - §8 interface: Tasks 5–6.
  - §9 data, seeds and checks: Task 1 Step 11, Task 4 and Task 7.
- **Placeholders:** none. Existing-page edits name the state and props they touch. The new script copies an exact line range of an existing one.
- **Type consistency:**
  - `ReservationResponse.Seats/Timeline/CanDecide/CanEditWording/CanReject/CanRelease/CanResubmit/ReturnComment` (C#) ↔ `seats/timeline/canDecide/canEditWording/canReject/canRelease/canResubmit/returnComment` (TS).
  - `ApprovalSeatResponse` ↔ `ApprovalSeat`; `ReservationDecisionResponse` ↔ `ReservationDecision`; `DirectionResponse` ↔ `Direction`.
  - `StepDetailsResponse.MySeat` ↔ `mySeat`.
  - `GroupTaskResponse.StandardsControllerId/StandardsControllerName/StandardsControlApproved` ↔ `standardsControllerId/standardsControllerName/standardsControlApproved`.
  - `StandardsControllerChangeResponse` ↔ `StandardsControllerChange`.
  - `StaffCapability.DirectionManager` is bound from `capability=directionManager`, which the client sends through `searchStaff(search, 'directionManager')`.
  - `ReviewPanel.Facts`, `SeatFor(user, panel, ...)` and `IsMarked` are defined in Task 3 Step 2 and used in Step 5.
  - `IReservationService.CompleteSatisfiedRequestsAsync` is defined in Task 2 Steps 6–7 and used in Step 9.
