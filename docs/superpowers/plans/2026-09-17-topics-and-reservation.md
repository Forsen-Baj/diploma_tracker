# Thesis Topics and Reservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers publish department-owned topics, students of that department reserve one or propose their own to a chosen teacher, supervisors approve, reject or release, and an approved reservation becomes the student's diploma topic and supervisor.

**Architecture:** Two new aggregates — `Topic` (with a SQL Server `rowversion` for reservation races) and `TopicReservation` (the request history, backed by filtered unique indexes that allow one active request per topic and per student). `TopicService` owns the catalogue; `ReservationService` owns every state transition and keeps `Topic.Status` and `StudentProfile.TopicId/SupervisorId` in step in the same save. A global selection deadline lives in `PlatformSettings`. Errors use the phase 3 code catalogue; pages use the phase 3 components and translations.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-17-topics-and-reservation-design.md`

**Prerequisites:** the user onboarding and design system plans are implemented and committed.

## Global Constraints

- One active (`Pending` or `Approved`) reservation per topic and per student — enforced in the service **and** by filtered unique indexes.
- Students see only topics of their group's department; `Available` catalogue topics whose supervisor is active, plus the topic of their own active reservation.
- Students may reserve, propose and cancel only while `TopicSelectionDeadline` is empty or in the future (UTC). Supervisors and administrators are never restricted by the deadline.
- A student cancels only their own `Pending` reservation. Approve and reject require `Pending`; release requires `Approved`.
- Teachers act only on topics they supervise; administrators act on all.
- Teachers edit/delete only their own `Catalogue` topics while `Available`; administrators any `Available` catalogue topic.
- Student proposals never enter the catalogue: declined, cancelled or released proposals delete the topic; the reservation history keeps `TopicTitle`.
- Approval sets `StudentProfile.TopicId` and `StudentProfile.SupervisorId`; release clears both.
- The free-text `StudentProfile.DiplomaTopic` is removed; a student's topic is always a `Topic` row.
- Lengths: title 300, description 4000, decision comment 1000.
- Status enums are persisted as strings (`nvarchar(50)`).
- Error bodies follow the phase 3 contract; every new code is in `TopicErrors.All` and in both translation files.
- **No unit tests.** Existing test projects must still compile.
- **Commits: exactly one**, in the final task: `Implement topics and reservation`.
- Never stage `PROJECT_PAPER.md` or `frontend/diploma-tracker-web/README.md`.
- The local database is recreated (single `InitialCreate` regenerated); hand-entered local data is lost.

## Rulings recorded while planning

- **Settings page.** The deadline and the registration switch move together to a new administrator *Settings* page (`/admin/settings`); the switch is removed from the Students page. Spec §6 asks for the deadline "next to the registration switch". Cost if wrong: one card moves back.
- **Direct assignment ignores department.** Administrators may assign any available catalogue topic to any active student without a topic; the spec does not restrict it and administrators correct exceptions. Cost if wrong: one added check.
- **Decision history endpoint.** `GET /api/reservations/pending` takes an optional `status` query (`Pending` default, or `Approved`) so the teacher's *Approved students* list with *Release* uses the same endpoint. Cost if wrong: none; the default matches the spec.
- **Unknown ids in bodies** get their own 400 codes (`topic.departmentInvalid`, `topic.supervisorInvalid`, `proposal.teacherInvalid`, `assignment.studentInvalid`), following the phase 3 rule.
- **Page markup is specified, not transcribed**, as in the design system plan.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/Topic.cs`, `TopicReservation.cs`, `TopicStatus.cs`, `TopicOrigin.cs`, `ReservationStatus.cs` | Domain |
| `backend/DiplomaTracker.Api/Entities/StudentProfile.cs`, `PlatformSettings.cs`, `Department.cs` | Topic link, deadline, topics navigation |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs` | Mapping, filtered indexes, row version |
| `backend/DiplomaTracker.Api/Migrations/*` | Regenerated `InitialCreate` |
| `backend/DiplomaTracker.Api/Services/TopicErrors.cs` | Codes |
| `backend/DiplomaTracker.Api/Services/UserContext.cs`, `PersonName.cs` | Caller identity, name formatting |
| `backend/DiplomaTracker.Api/Services/TopicSettingsService.cs`, `Interfaces/ITopicSettingsService.cs` | Deadline |
| `backend/DiplomaTracker.Api/Services/TopicService.cs`, `Interfaces/ITopicService.cs` | Catalogue |
| `backend/DiplomaTracker.Api/Services/ReservationService.cs`, `Interfaces/IReservationService.cs` | Transitions |
| `backend/DiplomaTracker.Api/DTOs/Topics/*` | Contracts |
| `backend/DiplomaTracker.Api/Controllers/TopicsController.cs`, `ReservationsController.cs`, `SettingsController.cs`, `ApiControllerBase.cs` | HTTP |
| `backend/DiplomaTracker.Api/Services/StudentService.cs`, `GroupService.cs`, `DbSeeder.cs`, `DTOs/Students/*`, `DTOs/Groups/GroupStudentResponse.cs` | Topic replaces free text |
| `frontend/diploma-tracker-web/src/api/topicsApi.ts`, `reservationsApi.ts`, `settingsApi.ts`, `types.ts` | Client |
| `frontend/diploma-tracker-web/src/pages/StudentTopicsPage.tsx`, `TeacherTopicsPage.tsx`, `AdminTopicsPage.tsx`, `AdminSettingsPage.tsx` | New pages |
| `frontend/diploma-tracker-web/src/components/topics/*` | Shared topic UI pieces |
| `frontend/diploma-tracker-web/src/pages/StudentDashboardPage.tsx`, `StudentsPage.tsx`, `GroupDetailsPage.tsx` | My topic card, removed free-text topic |
| `.superpowers/checks/topics-check.mjs` (git-ignored) | Endpoint verification |

---

### Task 1: Topic domain model and schema

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/TopicStatus.cs`, `TopicOrigin.cs`, `ReservationStatus.cs`, `Topic.cs`, `TopicReservation.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/StudentProfile.cs`, `PlatformSettings.cs`, `Department.cs`, `AppUser.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Replace: `backend/DiplomaTracker.Api/Migrations/*`

**Interfaces:**
- Produces: entities below; `AppDbContext.Topics`, `AppDbContext.TopicReservations`; `PlatformSettings.TopicSelectionDeadline : DateTime?`; `StudentProfile.TopicId : Guid?`, `StudentProfile.Topic : Topic?`; `StudentProfile.DiplomaTopic` removed.

- [ ] **Step 1: Create the enums**

`Entities/TopicStatus.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum TopicStatus
{
    Available,
    Reserved,
    Approved
}
```

`Entities/TopicOrigin.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum TopicOrigin
{
    Catalogue,
    StudentProposal
}
```

`Entities/ReservationStatus.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum ReservationStatus
{
    Pending,
    Approved,
    Rejected,
    Cancelled,
    Released
}
```

- [ ] **Step 2: Create `Entities/Topic.cs` and `Entities/TopicReservation.cs`**

```csharp
namespace DiplomaTracker.Api.Entities;

public class Topic
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SupervisorId { get; set; }
    public AppUser Supervisor { get; set; } = null!;
    public Guid DepartmentId { get; set; }
    public Department Department { get; set; } = null!;
    public TopicOrigin Origin { get; set; }
    public TopicStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public ICollection<TopicReservation> Reservations { get; set; } = new List<TopicReservation>();
}
```

```csharp
namespace DiplomaTracker.Api.Entities;

public class TopicReservation
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }
    public Topic? Topic { get; set; }
    public string TopicTitle { get; set; } = string.Empty;
    public Guid StudentProfileId { get; set; }
    public StudentProfile StudentProfile { get; set; } = null!;
    public ReservationStatus Status { get; set; }
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
}
```

- [ ] **Step 3: Update existing entities**

`Entities/StudentProfile.cs` — remove the `DiplomaTopic` property and add after `SupervisorId`:

```csharp
    public Guid? TopicId { get; set; }
```

and after the `Supervisor` navigation:

```csharp
    public Topic? Topic { get; set; }
    public ICollection<TopicReservation> TopicReservations { get; set; } = new List<TopicReservation>();
```

`Entities/PlatformSettings.cs` — add:

```csharp
    public DateTime? TopicSelectionDeadline { get; set; }
```

`Entities/Department.cs` — add:

```csharp
    public ICollection<Topic> Topics { get; set; } = new List<Topic>();
```

`Entities/AppUser.cs` — add:

```csharp
    public ICollection<Topic> SupervisedTopics { get; set; } = new List<Topic>();
```

- [ ] **Step 4: Map the model in `Data/AppDbContext.cs`**

Add the sets:

```csharp
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<TopicReservation> TopicReservations => Set<TopicReservation>();
```

In the student profile block, delete the `DiplomaTopic` property line and add:

```csharp
        studentProfile.HasIndex(x => x.TopicId).IsUnique().HasFilter("[TopicId] IS NOT NULL");
        studentProfile.HasOne(x => x.Topic)
            .WithMany()
            .HasForeignKey(x => x.TopicId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
```

In the platform settings block add:

```csharp
        platformSettings.Property(x => x.TopicSelectionDeadline);
```

Append to `OnModelCreating`:

```csharp
        var topic = modelBuilder.Entity<Topic>();
        topic.ToTable("Topics");
        topic.HasKey(x => x.Id);
        topic.Property(x => x.Title).HasMaxLength(300).IsRequired();
        topic.Property(x => x.Description).HasMaxLength(4000);
        topic.Property(x => x.Origin).HasConversion<string>().HasMaxLength(50).IsRequired();
        topic.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        topic.Property(x => x.CreatedAt).IsRequired();
        topic.Property(x => x.UpdatedAt).IsRequired();
        topic.Property(x => x.RowVersion).IsRowVersion();
        topic.HasIndex(x => new { x.DepartmentId, x.Status });
        topic.HasOne(x => x.Supervisor)
            .WithMany(x => x.SupervisedTopics)
            .HasForeignKey(x => x.SupervisorId)
            .OnDelete(DeleteBehavior.Restrict);
        topic.HasOne(x => x.Department)
            .WithMany(x => x.Topics)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        var reservation = modelBuilder.Entity<TopicReservation>();
        reservation.ToTable("TopicReservations");
        reservation.HasKey(x => x.Id);
        reservation.Property(x => x.TopicTitle).HasMaxLength(300).IsRequired();
        reservation.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        reservation.Property(x => x.DecisionComment).HasMaxLength(1000);
        reservation.Property(x => x.CreatedAt).IsRequired();
        reservation.HasIndex(x => x.TopicId)
            .IsUnique()
            .HasFilter("[TopicId] IS NOT NULL AND [Status] IN ('Pending', 'Approved')")
            .HasDatabaseName("IX_TopicReservations_ActivePerTopic");
        reservation.HasIndex(x => x.StudentProfileId)
            .IsUnique()
            .HasFilter("[Status] IN ('Pending', 'Approved')")
            .HasDatabaseName("IX_TopicReservations_ActivePerStudent");
        reservation.HasIndex(x => new { x.StudentProfileId, x.CreatedAt });
        reservation.HasOne(x => x.Topic)
            .WithMany(x => x.Reservations)
            .HasForeignKey(x => x.TopicId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);
        reservation.HasOne(x => x.StudentProfile)
            .WithMany(x => x.TopicReservations)
            .HasForeignKey(x => x.StudentProfileId)
            .OnDelete(DeleteBehavior.Cascade);
```

- [ ] **Step 5: Build (compile errors expected elsewhere)**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: errors only where `DiplomaTopic` is used (`StudentService`, `GroupService`, `DbSeeder`, student DTO mapping). Task 2 removes them; do not regenerate the migration until Task 2 Step 5.

---

### Task 2: Replace the free-text topic in students, groups and the seeder

**Files:**
- Modify: `backend/DiplomaTracker.Api/DTOs/Students/CreateStudentRequest.cs`, `UpdateStudentRequest.cs`, `StudentResponse.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Groups/GroupStudentResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs`, `GroupService.cs`, `DbSeeder.cs`
- Replace: `backend/DiplomaTracker.Api/Migrations/*`

**Interfaces:**
- Produces: `StudentResponse.TopicId : Guid?`, `StudentResponse.TopicTitle : string?` (replacing `DiplomaTopic`); `GroupStudentResponse.TopicTitle : string?` (replacing `DiplomaTopic`). Create/update student requests no longer have `DiplomaTopic`.

- [ ] **Step 1: Update the student contracts**

In `CreateStudentRequest.cs` and `UpdateStudentRequest.cs`, delete:

```csharp
    [MaxLength(500)]
    public string? DiplomaTopic { get; set; }
```

In `StudentResponse.cs`, replace `public string? DiplomaTopic { get; set; }` with:

```csharp
    public Guid? TopicId { get; set; }
    public string? TopicTitle { get; set; }
```

In `DTOs/Groups/GroupStudentResponse.cs`, replace `public string? DiplomaTopic { get; set; }` with:

```csharp
    public string? TopicTitle { get; set; }
```

- [ ] **Step 2: Update `Services/StudentService.cs`**

- Delete the lines `DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic),` (create) and `profile.DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic);` (update).
- In `GetStudentsAsync` and `LoadStudentProfileAsync`, add `.Include(s => s.Topic)` after `.Include(s => s.Supervisor)`.
- In `MapStudent`, replace `DiplomaTopic = profile.DiplomaTopic,` with:

```csharp
            TopicId = profile.TopicId,
            TopicTitle = profile.Topic?.Title,
```

- [ ] **Step 3: Update `Services/GroupService.cs`**

In `GetGroupStudentsAsync`, add `.Include(s => s.Topic)` after `.Include(s => s.Supervisor)`. In `MapGroupStudent`, replace `DiplomaTopic = profile.DiplomaTopic,` with `TopicTitle = profile.Topic?.Title,`.

- [ ] **Step 4: Update `Services/DbSeeder.cs`**

In `EnsureStudentProfileAsync`, delete `DiplomaTopic = "Seeded diploma topic",`. Also change the demo student so it starts without a supervisor — replace `SupervisorId = supervisorId,` with `SupervisorId = null,` and remove the now-unused `supervisorId` parameter from the method and its call site. (A student's supervisor now comes from an approved topic.)

- [ ] **Step 5: Build and regenerate the schema**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
rm -rf DiplomaTracker.Api/Migrations
dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations
M=$(ls DiplomaTracker.Api/Migrations/*_InitialCreate.cs)
grep -c 'IX_TopicReservations_ActivePerTopic\|IX_TopicReservations_ActivePerStudent' "$M"
grep -c 'rowversion' "$M"
grep -c 'DiplomaTopic' "$M"
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
taskkill //F //IM DiplomaTracker.Api.exe 2>/dev/null
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

Expected: builds `0 Error(s)` (if a test file references `DiplomaTopic`, delete only that assignment); counts `2` or more, `1` or more, `0`; no pending model changes; database dropped.

---

### Task 3: Errors, caller identity and settings

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/TopicErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`
- Create: `backend/DiplomaTracker.Api/Services/UserContext.cs`
- Create: `backend/DiplomaTracker.Api/Services/PersonName.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/ApiControllerBase.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/ITopicSettingsService.cs`, `Services/TopicSettingsService.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Topics/TopicSelectionSettingsDto.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/SettingsController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Produces:
  - `TopicErrors` constants (Step 1).
  - `record UserContext(Guid UserId, string Role)` with `IsAdmin`, `IsTeacher`, `IsStudent`.
  - `PersonName.Full(AppUser user) : string` → `"Last First Patronymic"` without trailing space.
  - `ApiControllerBase.TryGetCurrentUser(out UserContext user) : bool`.
  - `ITopicSettingsService.GetDeadlineAsync() : Task<DateTime?>`, `SetDeadlineAsync(DateTime? deadlineUtc) : Task`, `IsSelectionOpenAsync() : Task<bool>`.
  - HTTP `GET /api/settings/topic-selection` (authenticated) → `{ deadline: string | null }`; `PUT` (Admin) body `{ deadline }` → 204.

- [ ] **Step 1: Create `Services/TopicErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TopicErrors
{
    public const string TopicNotFound = "topic.notFound";
    public const string TopicNotAvailable = "topic.notAvailable";
    public const string TopicNotInYourDepartment = "topic.notInYourDepartment";
    public const string TopicNotEditable = "topic.notEditable";
    public const string TopicNotOwner = "topic.notOwner";
    public const string TopicDepartmentInvalid = "topic.departmentInvalid";
    public const string TopicSupervisorInvalid = "topic.supervisorInvalid";
    public const string ProposalTeacherInvalid = "proposal.teacherInvalid";
    public const string ReservationNotFound = "reservation.notFound";
    public const string ReservationAlreadyActive = "reservation.alreadyActive";
    public const string ReservationInvalidState = "reservation.invalidState";
    public const string ReservationNotYours = "reservation.notYours";
    public const string ReservationNotSupervisor = "reservation.notSupervisor";
    public const string SelectionClosed = "selection.closed";
    public const string StudentAlreadyHasTopic = "student.alreadyHasTopic";
    public const string AssignmentStudentInvalid = "assignment.studentInvalid";
    public const string StudentProfileRequired = "topic.studentProfileRequired";

    public static readonly ErrorDefinition[] All =
    [
        new(TopicNotFound, StatusCodes.Status404NotFound, "Topic not found."),
        new(TopicNotAvailable, StatusCodes.Status409Conflict, "The topic is no longer available."),
        new(TopicNotInYourDepartment, StatusCodes.Status403Forbidden, "The topic belongs to another department."),
        new(TopicNotEditable, StatusCodes.Status409Conflict, "Only available catalogue topics can be changed or deleted."),
        new(TopicNotOwner, StatusCodes.Status403Forbidden, "You can change only topics you supervise."),
        new(TopicDepartmentInvalid, StatusCodes.Status400BadRequest, "The selected department does not exist."),
        new(TopicSupervisorInvalid, StatusCodes.Status400BadRequest, "The supervisor must be an active teacher."),
        new(ProposalTeacherInvalid, StatusCodes.Status400BadRequest, "The chosen teacher must be an active teacher."),
        new(ReservationNotFound, StatusCodes.Status404NotFound, "Reservation not found."),
        new(ReservationAlreadyActive, StatusCodes.Status409Conflict, "You already have an active reservation or approved topic."),
        new(ReservationInvalidState, StatusCodes.Status409Conflict, "The reservation is not in a state that allows this action."),
        new(ReservationNotYours, StatusCodes.Status403Forbidden, "This reservation belongs to another student."),
        new(ReservationNotSupervisor, StatusCodes.Status403Forbidden, "Only the topic's supervisor can decide on this reservation."),
        new(SelectionClosed, StatusCodes.Status403Forbidden, "The topic selection deadline has passed."),
        new(StudentAlreadyHasTopic, StatusCodes.Status409Conflict, "The student already has a topic."),
        new(AssignmentStudentInvalid, StatusCodes.Status400BadRequest, "The selected student does not exist or is inactive."),
        new(StudentProfileRequired, StatusCodes.Status403Forbidden, "Only students with a profile can do this.")
    ];
}
```

In `Errors/ErrorCatalog.cs`, add `TopicErrors.All,` to the `areas` array.

- [ ] **Step 2: Create `Services/UserContext.cs` and `Services/PersonName.cs`**

```csharp
namespace DiplomaTracker.Api.Services;

public sealed record UserContext(Guid UserId, string Role)
{
    public bool IsAdmin => Role == "Admin";
    public bool IsTeacher => Role == "Teacher";
    public bool IsStudent => Role == "Student";
}
```

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class PersonName
{
    public static string Full(AppUser user) =>
        string.Join(' ', new[] { user.LastName, user.FirstName, user.Patronymic }.Where(part => !string.IsNullOrWhiteSpace(part)));
}
```

- [ ] **Step 3: Add `TryGetCurrentUser` to `Controllers/ApiControllerBase.cs`**

Add `using DiplomaTracker.Api.Services;` and the method:

```csharp
    protected bool TryGetCurrentUser(out UserContext user)
    {
        if (TryGetUserContext(out var role, out var userId))
        {
            user = new UserContext(userId, role);
            return true;
        }

        user = new UserContext(Guid.Empty, string.Empty);
        return false;
    }
```

- [ ] **Step 4: Create the settings service**

`Interfaces/ITopicSettingsService.cs`:

```csharp
namespace DiplomaTracker.Api.Interfaces;

public interface ITopicSettingsService
{
    Task<DateTime?> GetDeadlineAsync();
    Task SetDeadlineAsync(DateTime? deadlineUtc);
    Task<bool> IsSelectionOpenAsync();
}
```

`Services/TopicSettingsService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TopicSettingsService : ITopicSettingsService
{
    private readonly AppDbContext _dbContext;

    public TopicSettingsService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<DateTime?> GetDeadlineAsync()
    {
        var deadline = await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.TopicSelectionDeadline)
            .FirstOrDefaultAsync();

        return deadline is null ? null : DateTime.SpecifyKind(deadline.Value, DateTimeKind.Utc);
    }

    public async Task SetDeadlineAsync(DateTime? deadlineUtc)
    {
        var settings = await _dbContext.PlatformSettings.FirstOrDefaultAsync(s => s.Id == PlatformSettings.SingletonId);
        if (settings is null)
        {
            settings = new PlatformSettings { Id = PlatformSettings.SingletonId };
            _dbContext.PlatformSettings.Add(settings);
        }

        settings.TopicSelectionDeadline = deadlineUtc?.Kind switch
        {
            null => null,
            DateTimeKind.Local => deadlineUtc.Value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(deadlineUtc.Value, DateTimeKind.Utc)
        };

        await _dbContext.SaveChangesAsync();
    }

    public async Task<bool> IsSelectionOpenAsync()
    {
        var deadline = await GetDeadlineAsync();
        return deadline is null || DateTime.UtcNow < deadline.Value;
    }
}
```

- [ ] **Step 5: Create the settings contract and controller**

`DTOs/Topics/TopicSelectionSettingsDto.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class TopicSelectionSettingsDto
{
    public DateTime? Deadline { get; set; }
}
```

`Controllers/SettingsController.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/settings")]
[Authorize]
public class SettingsController : ApiControllerBase
{
    private readonly ITopicSettingsService _topicSettingsService;

    public SettingsController(ITopicSettingsService topicSettingsService)
    {
        _topicSettingsService = topicSettingsService;
    }

    [HttpGet("topic-selection")]
    public async Task<IActionResult> GetTopicSelection()
    {
        return Ok(new TopicSelectionSettingsDto { Deadline = await _topicSettingsService.GetDeadlineAsync() });
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("topic-selection")]
    public async Task<IActionResult> UpdateTopicSelection([FromBody] TopicSelectionSettingsDto request)
    {
        await _topicSettingsService.SetDeadlineAsync(request.Deadline);
        return NoContent();
    }
}
```

- [ ] **Step 6: Register in `Program.cs`**

After the import service registration add:

```csharp
builder.Services.AddScoped<ITopicSettingsService, TopicSettingsService>();
```

- [ ] **Step 7: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 4: Topic catalogue service and endpoints

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Topics/TopicResponse.cs`, `CreateTopicRequest.cs`, `UpdateTopicRequest.cs`, `TopicQuery.cs`, `SupervisorOption.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/ITopicService.cs`
- Create: `backend/DiplomaTracker.Api/Services/TopicService.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/TopicsController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `UserContext`, `PersonName`, `TopicErrors`, `CommonErrors`.
- Produces:
  - `TopicResponse { Id, Title, Description, SupervisorId, SupervisorName, DepartmentId, DepartmentName, FacultyName, Origin, Status, ActiveReservationId?, ActiveReservationStatus?, StudentProfileId?, StudentName?, GroupName?, CreatedAt, UpdatedAt }` — `Origin`, `Status`, `ActiveReservationStatus` serialised as strings.
  - `ITopicService.GetTopicsAsync(UserContext, TopicQuery) : Task<(IReadOnlyList<TopicResponse>? topics, string? error)>`, `GetTopicAsync(UserContext, Guid) : Task<(TopicResponse?, string?)>`, `CreateTopicAsync(UserContext, CreateTopicRequest)`, `UpdateTopicAsync(UserContext, Guid, UpdateTopicRequest)`, `DeleteTopicAsync(UserContext, Guid) : Task<(bool, string?)>`.
  - `ITopicService.GetSupervisorsAsync() : Task<IReadOnlyList<SupervisorOption>>` — active teachers `{ id, name }` ordered by name.
  - HTTP per spec §5: `GET /api/topics`, `GET /api/topics/{id}`, `POST /api/topics`, `PUT /api/topics/{id}`, `DELETE /api/topics/{id}`; plus `GET /api/topics/supervisors` (any authenticated role) so students can choose a teacher for a proposal.

- [ ] **Step 1: Create the contracts**

`DTOs/Topics/TopicResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class TopicResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid SupervisorId { get; set; }
    public string SupervisorName { get; set; } = string.Empty;
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;
    public string Origin { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public Guid? ActiveReservationId { get; set; }
    public string? ActiveReservationStatus { get; set; }
    public Guid? StudentProfileId { get; set; }
    public string? StudentName { get; set; }
    public string? GroupName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

`DTOs/Topics/CreateTopicRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class CreateTopicRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public Guid DepartmentId { get; set; }

    public Guid? SupervisorId { get; set; }
}
```

`DTOs/Topics/UpdateTopicRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class UpdateTopicRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public Guid DepartmentId { get; set; }

    public Guid? SupervisorId { get; set; }
}
```

`DTOs/Topics/SupervisorOption.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public sealed record SupervisorOption(Guid Id, string Name);
```

`DTOs/Topics/TopicQuery.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class TopicQuery
{
    public string? Search { get; set; }
    public Guid? SupervisorId { get; set; }
    public Guid? DepartmentId { get; set; }
    public string? Status { get; set; }
}
```

- [ ] **Step 2: Create `Interfaces/ITopicService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface ITopicService
{
    Task<(IReadOnlyList<TopicResponse>? topics, string? error)> GetTopicsAsync(UserContext user, TopicQuery query);
    Task<(TopicResponse? topic, string? error)> GetTopicAsync(UserContext user, Guid id);
    Task<(TopicResponse? topic, string? error)> CreateTopicAsync(UserContext user, CreateTopicRequest request);
    Task<(TopicResponse? topic, string? error)> UpdateTopicAsync(UserContext user, Guid id, UpdateTopicRequest request);
    Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id);
    Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync();
}
```

- [ ] **Step 3: Create `Services/TopicService.cs`**

```csharp
using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TopicService : ITopicService
{
    private readonly AppDbContext _dbContext;

    public TopicService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
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

            var ownTopicId = await _dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.StudentProfileId == student.Id
                    && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved))
                .Select(r => r.TopicId)
                .FirstOrDefaultAsync();

            topics = topics.Where(t =>
                t.Id == ownTopicId
                || (t.DepartmentId == student.DepartmentId
                    && t.Origin == TopicOrigin.Catalogue
                    && t.Status == TopicStatus.Available
                    && t.Supervisor.IsActive));
        }
        else if (user.IsTeacher)
        {
            topics = topics.Where(t => t.SupervisorId == user.UserId);
        }
        else if (!user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            topics = topics.Where(t => t.Title.Contains(search) || (t.Description != null && t.Description.Contains(search)));
        }

        if (query.SupervisorId is not null)
        {
            topics = topics.Where(t => t.SupervisorId == query.SupervisorId);
        }

        if (user.IsAdmin && query.DepartmentId is not null)
        {
            topics = topics.Where(t => t.DepartmentId == query.DepartmentId);
        }

        if (!user.IsStudent && Enum.TryParse<TopicStatus>(query.Status, ignoreCase: true, out var status))
        {
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

        if (user.IsTeacher && row.SupervisorId != user.UserId)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (user.IsStudent)
        {
            var student = await LoadStudentAsync(user.UserId);
            if (student is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            var isOwn = row.StudentProfileId == student.Id;
            var isVisibleCatalogue = row.DepartmentId == student.DepartmentId
                && row.Origin == TopicOrigin.Catalogue
                && row.Status == TopicStatus.Available
                && row.SupervisorIsActive;

            if (!isOwn && !isVisibleCatalogue)
            {
                return (null, TopicErrors.TopicNotFound);
            }
        }

        return (ToResponse(row, user), null);
    }

    public async Task<(TopicResponse? topic, string? error)> CreateTopicAsync(UserContext user, CreateTopicRequest request)
    {
        var supervisorId = user.IsTeacher ? user.UserId : request.SupervisorId;
        var validation = await ValidateReferencesAsync(request.DepartmentId, supervisorId);
        if (validation is not null)
        {
            return (null, validation);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = supervisorId!.Value,
            DepartmentId = request.DepartmentId,
            Origin = TopicOrigin.Catalogue,
            Status = TopicStatus.Available,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Topics.Add(topic);
        await _dbContext.SaveChangesAsync();

        return await GetTopicAsync(user, topic.Id);
    }

    public async Task<(TopicResponse? topic, string? error)> UpdateTopicAsync(UserContext user, Guid id, UpdateTopicRequest request)
    {
        var topic = await _dbContext.Topics.FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckEditable(user, topic);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var editable = topic!;
        var supervisorId = user.IsAdmin ? request.SupervisorId ?? editable.SupervisorId : editable.SupervisorId;
        var validation = await ValidateReferencesAsync(request.DepartmentId, supervisorId);
        if (validation is not null)
        {
            return (null, validation);
        }

        editable.Title = request.Title.Trim();
        editable.Description = IdentityNormalizer.Optional(request.Description);
        editable.DepartmentId = request.DepartmentId;
        editable.SupervisorId = supervisorId;
        editable.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return (null, TopicErrors.TopicNotEditable);
        }

        return await GetTopicAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id)
    {
        var topic = await _dbContext.Topics.FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckEditable(user, topic);
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
            return (false, TopicErrors.TopicNotEditable);
        }

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

    private static string? CheckEditable(UserContext user, Topic? topic)
    {
        if (topic is null || (user.IsTeacher && topic.SupervisorId != user.UserId))
        {
            return user.IsTeacher && topic is not null ? TopicErrors.TopicNotOwner : TopicErrors.TopicNotFound;
        }

        if (!user.IsAdmin && !user.IsTeacher)
        {
            return CommonErrors.Forbidden;
        }

        return topic.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available
            ? TopicErrors.TopicNotEditable
            : null;
    }

    private async Task<string?> ValidateReferencesAsync(Guid departmentId, Guid? supervisorId)
    {
        if (!await _dbContext.Departments.AnyAsync(d => d.Id == departmentId))
        {
            return TopicErrors.TopicDepartmentInvalid;
        }

        if (supervisorId is null
            || !await _dbContext.Users.AnyAsync(u => u.Id == supervisorId && u.Role == "Teacher" && u.IsActive))
        {
            return TopicErrors.TopicSupervisorInvalid;
        }

        return null;
    }

    private async Task<StudentScope?> LoadStudentAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => new StudentScope(p.Id, p.Group.DepartmentId))
            .FirstOrDefaultAsync();
    }

    private static TopicResponse ToResponse(TopicRow row, UserContext user)
    {
        var showStudent = !user.IsStudent;
        return new TopicResponse
        {
            Id = row.Id,
            Title = row.Title,
            Description = row.Description,
            SupervisorId = row.SupervisorId,
            SupervisorName = string.Join(' ', new[] { row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic }.Where(p => !string.IsNullOrWhiteSpace(p))),
            DepartmentId = row.DepartmentId,
            DepartmentName = row.DepartmentName,
            FacultyName = row.FacultyName,
            Origin = row.Origin.ToString(),
            Status = row.Status.ToString(),
            ActiveReservationId = row.ActiveReservationId,
            ActiveReservationStatus = row.ActiveReservationStatus?.ToString(),
            StudentProfileId = showStudent ? row.StudentProfileId : null,
            StudentName = showStudent ? row.StudentName : null,
            GroupName = showStudent ? row.GroupName : null,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }

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
        DepartmentId = t.DepartmentId,
        DepartmentName = t.Department.Name,
        FacultyName = t.Department.Faculty.Name,
        Origin = t.Origin,
        Status = t.Status,
        ActiveReservationId = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved)
            .Select(r => (Guid?)r.Id)
            .FirstOrDefault(),
        ActiveReservationStatus = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved)
            .Select(r => (ReservationStatus?)r.Status)
            .FirstOrDefault(),
        StudentProfileId = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved)
            .Select(r => (Guid?)r.StudentProfileId)
            .FirstOrDefault(),
        StudentName = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved)
            .Select(r => r.StudentProfile.User.LastName + " " + r.StudentProfile.User.FirstName)
            .FirstOrDefault(),
        GroupName = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved)
            .Select(r => r.StudentProfile.Group.Name)
            .FirstOrDefault(),
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt
    };

    private sealed record StudentScope(Guid Id, Guid DepartmentId);

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
        public TopicOrigin Origin { get; init; }
        public TopicStatus Status { get; init; }
        public Guid? ActiveReservationId { get; init; }
        public ReservationStatus? ActiveReservationStatus { get; init; }
        public Guid? StudentProfileId { get; init; }
        public string? StudentName { get; init; }
        public string? GroupName { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }
}
```

- [ ] **Step 4: Create `Controllers/TopicsController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/topics")]
[Authorize]
public class TopicsController : ApiControllerBase
{
    private readonly ITopicService _topicService;

    public TopicsController(ITopicService topicService)
    {
        _topicService = topicService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] TopicQuery query)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topics, error) = await _topicService.GetTopicsAsync(user, query);
        return topics is null ? ErrorResult(error) : Ok(topics);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.GetTopicAsync(user, id);
        return topic is null ? ErrorResult(error) : Ok(topic);
    }

    [HttpGet("supervisors")]
    public async Task<IActionResult> GetSupervisors()
    {
        return Ok(await _topicService.GetSupervisorsAsync());
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTopicRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.CreateTopicAsync(user, request);
        return topic is null ? ErrorResult(error) : CreatedAtAction(nameof(GetById), new { id = topic.Id }, topic);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTopicRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (topic, error) = await _topicService.UpdateTopicAsync(user, id, request);
        return topic is null ? ErrorResult(error) : Ok(topic);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _topicService.DeleteTopicAsync(user, id);
        return success ? NoContent() : ErrorResult(error);
    }
}
```

- [ ] **Step 5: Register and build**

In `Program.cs` add `builder.Services.AddScoped<ITopicService, TopicService>();`.

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 5: Reservation service and endpoints

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Topics/ReservationResponse.cs`, `ProposeTopicRequest.cs`, `DecisionRequest.cs`, `AssignTopicRequest.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IReservationService.cs`
- Create: `backend/DiplomaTracker.Api/Services/ReservationService.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/ReservationsController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `ITopicSettingsService.IsSelectionOpenAsync`, `UserContext`, `PersonName`, `TopicErrors`, `SqlUpdateExceptionHelper`.
- Produces:
  - `ReservationResponse { Id, TopicId?, TopicTitle, TopicDescription?, Origin?, SupervisorId?, SupervisorName?, StudentProfileId, StudentName, StudentEmail, GroupName, Status, DecisionComment?, CreatedAt, DecidedAt?, CanCancel }`.
  - `IReservationService`: `ReserveAsync(UserContext, Guid topicId)`, `ProposeAsync(UserContext, ProposeTopicRequest)`, `ApproveAsync(UserContext, Guid id)`, `RejectAsync(UserContext, Guid id, DecisionRequest)`, `CancelAsync(UserContext, Guid id)`, `ReleaseAsync(UserContext, Guid id, DecisionRequest)`, `AssignAsync(Guid topicId, AssignTopicRequest)` — each `Task<(ReservationResponse? reservation, string? error)>`; `GetMineAsync(UserContext) : Task<(IReadOnlyList<ReservationResponse>?, string?)>`; `GetForDecisionAsync(UserContext, ReservationStatus status) : Task<IReadOnlyList<ReservationResponse>>`.
  - HTTP: `POST /api/topics/{id}/reserve` (Student), `POST /api/topics/proposals` (Student), `POST /api/reservations/{id}/approve|reject|release` (Admin, Teacher), `POST /api/reservations/{id}/cancel` (Student), `POST /api/topics/{id}/assign` (Admin), `GET /api/reservations/mine` (Student), `GET /api/reservations/pending?status=` (Admin, Teacher).

- [ ] **Step 1: Create the contracts**

`DTOs/Topics/ReservationResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class ReservationResponse
{
    public Guid Id { get; set; }
    public Guid? TopicId { get; set; }
    public string TopicTitle { get; set; } = string.Empty;
    public string? TopicDescription { get; set; }
    public string? Origin { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorName { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentEmail { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? DecisionComment { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DecidedAt { get; set; }
    public bool CanCancel { get; set; }
}
```

`DTOs/Topics/ProposeTopicRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class ProposeTopicRequest
{
    [Required, MaxLength(300)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public Guid SupervisorId { get; set; }
}
```

`DTOs/Topics/DecisionRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Topics;

public class DecisionRequest
{
    [MaxLength(1000)]
    public string? Comment { get; set; }
}
```

`DTOs/Topics/AssignTopicRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Topics;

public class AssignTopicRequest
{
    public Guid StudentId { get; set; }
}
```

- [ ] **Step 2: Create `Interfaces/IReservationService.cs`**

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
    Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId);
    Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> AssignAsync(Guid topicId, AssignTopicRequest request);
    Task<(IReadOnlyList<ReservationResponse>? reservations, string? error)> GetMineAsync(UserContext user);
    Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status);
}
```

- [ ] **Step 3: Create `Services/ReservationService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class ReservationService : IReservationService
{
    private readonly AppDbContext _dbContext;
    private readonly ITopicSettingsService _settings;

    public ReservationService(AppDbContext dbContext, ITopicSettingsService settings)
    {
        _dbContext = dbContext;
        _settings = settings;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student.Id);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .FirstOrDefaultAsync(t => t.Id == topicId && t.Origin == TopicOrigin.Catalogue);

        if (topic is null)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (topic.DepartmentId != student.Group.DepartmentId)
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

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Pending,
            CreatedAt = now
        };
        _dbContext.TopicReservations.Add(reservation);

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

        var precondition = await CheckStudentMayRequestAsync(student.Id);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var teacherIsValid = await _dbContext.Users.AnyAsync(u => u.Id == request.SupervisorId && u.Role == "Teacher" && u.IsActive);
        if (!teacherIsValid)
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = request.SupervisorId,
            DepartmentId = student.Group.DepartmentId,
            Origin = TopicOrigin.StudentProposal,
            Status = TopicStatus.Reserved,
            CreatedAt = now,
            UpdatedAt = now
        };

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Pending,
            CreatedAt = now
        };

        _dbContext.Topics.Add(topic);
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.ReservationAlreadyActive);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Pending);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.StudentProfile.TopicId is not null)
        {
            return (null, TopicErrors.StudentAlreadyHasTopic);
        }

        var now = DateTime.UtcNow;
        reservation.Status = ReservationStatus.Approved;
        reservation.DecidedAt = now;
        reservation.Topic!.Status = TopicStatus.Approved;
        reservation.Topic.UpdatedAt = now;
        reservation.StudentProfile.TopicId = reservation.Topic.Id;
        reservation.StudentProfile.SupervisorId = reservation.Topic.SupervisorId;
        reservation.StudentProfile.UpdatedAt = now;

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Pending);
        if (error is not null)
        {
            return (null, error);
        }

        var now = DateTime.UtcNow;
        reservation!.Status = ReservationStatus.Rejected;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (!await _settings.IsSelectionOpenAsync())
        {
            return (null, TopicErrors.SelectionClosed);
        }

        if (reservation.Status != ReservationStatus.Pending || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        var now = DateTime.UtcNow;
        reservation.Status = ReservationStatus.Cancelled;
        reservation.DecidedAt = now;
        ReturnOrRemoveTopic(reservation.Topic, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Approved);
        if (error is not null)
        {
            return (null, error);
        }

        var now = DateTime.UtcNow;
        reservation!.Status = ReservationStatus.Released;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        reservation.StudentProfile.TopicId = null;
        reservation.StudentProfile.SupervisorId = null;
        reservation.StudentProfile.UpdatedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> AssignAsync(Guid topicId, AssignTopicRequest request)
    {
        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .FirstOrDefaultAsync(t => t.Id == topicId);

        if (topic is null)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (topic.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var student = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.Id == request.StudentId && p.User.Role == "Student" && p.User.IsActive);

        if (student is null)
        {
            return (null, TopicErrors.AssignmentStudentInvalid);
        }

        if (student.TopicId is not null)
        {
            return (null, TopicErrors.StudentAlreadyHasTopic);
        }

        if (await HasActiveReservationAsync(student.Id))
        {
            return (null, TopicErrors.ReservationAlreadyActive);
        }

        var now = DateTime.UtcNow;
        topic.Status = TopicStatus.Approved;
        topic.UpdatedAt = now;
        student.TopicId = topic.Id;
        student.SupervisorId = topic.SupervisorId;
        student.UpdatedAt = now;

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Approved,
            CreatedAt = now,
            DecidedAt = now
        };
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        return conflict is not null
            ? (null, conflict)
            : (await LoadResponseAsync(reservation.Id, new UserContext(Guid.Empty, "Admin")), null);
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

        var selectionOpen = await _settings.IsSelectionOpenAsync();
        var rows = await QueryRows(r => r.StudentProfileId == studentId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, selectionOpen && row.Status == ReservationStatus.Pending)).ToList(), null);
    }

    public async Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status)
    {
        var rows = await QueryRows(r => r.Status == status
                && r.Topic != null
                && (user.IsAdmin || r.Topic.SupervisorId == user.UserId))
            .OrderBy(r => r.CreatedAt)
            .ToListAsync();

        return rows.Select(row => ToResponse(row, canCancel: false)).ToList();
    }

    private async Task<StudentProfile?> LoadStudentForActionAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles
            .Include(p => p.Group)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.UserId == userId && p.User.Role == "Student" && p.User.IsActive);
    }

    private async Task<string?> CheckStudentMayRequestAsync(Guid studentProfileId)
    {
        if (!await _settings.IsSelectionOpenAsync())
        {
            return TopicErrors.SelectionClosed;
        }

        return await HasActiveReservationAsync(studentProfileId) ? TopicErrors.ReservationAlreadyActive : null;
    }

    private Task<bool> HasActiveReservationAsync(Guid studentProfileId)
    {
        return _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved));
    }

    private async Task<TopicReservation?> LoadForDecisionAsync(Guid reservationId)
    {
        return await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .Include(r => r.StudentProfile)
            .FirstOrDefaultAsync(r => r.Id == reservationId);
    }

    private static string? CheckDecider(UserContext user, TopicReservation? reservation, ReservationStatus requiredStatus)
    {
        if (reservation is null)
        {
            return TopicErrors.ReservationNotFound;
        }

        if (reservation.Topic is null)
        {
            return TopicErrors.ReservationInvalidState;
        }

        if (!user.IsAdmin && reservation.Topic.SupervisorId != user.UserId)
        {
            return TopicErrors.ReservationNotSupervisor;
        }

        return reservation.Status != requiredStatus ? TopicErrors.ReservationInvalidState : null;
    }

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
            return await HasActiveReservationAsync(studentProfileId)
                ? TopicErrors.ReservationAlreadyActive
                : topicConflictError;
        }
    }

    private async Task<(ReservationResponse? reservation, string? error)> SaveDecisionAsync(Guid reservationId, UserContext user)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return (null, TopicErrors.ReservationInvalidState);
        }

        return (await LoadResponseAsync(reservationId, user), null);
    }

    private async Task<ReservationResponse?> LoadResponseAsync(Guid reservationId, UserContext user)
    {
        var row = await QueryRows(r => r.Id == reservationId).FirstOrDefaultAsync();
        if (row is null)
        {
            return null;
        }

        var canCancel = user.IsStudent
            && row.Status == ReservationStatus.Pending
            && await _settings.IsSelectionOpenAsync();
        return ToResponse(row, canCancel);
    }

    private IQueryable<ReservationRow> QueryRows(System.Linq.Expressions.Expression<Func<TopicReservation, bool>> predicate)
    {
        return _dbContext.TopicReservations.AsNoTracking()
            .Where(predicate)
            .Select(r => new ReservationRow
            {
                Id = r.Id,
                TopicId = r.TopicId,
                TopicTitle = r.TopicTitle,
                TopicDescription = r.Topic != null ? r.Topic.Description : null,
                Origin = r.Topic != null ? (TopicOrigin?)r.Topic.Origin : null,
                SupervisorId = r.Topic != null ? (Guid?)r.Topic.SupervisorId : null,
                SupervisorLastName = r.Topic != null ? r.Topic.Supervisor.LastName : null,
                SupervisorFirstName = r.Topic != null ? r.Topic.Supervisor.FirstName : null,
                SupervisorPatronymic = r.Topic != null ? r.Topic.Supervisor.Patronymic : null,
                StudentProfileId = r.StudentProfileId,
                StudentLastName = r.StudentProfile.User.LastName,
                StudentFirstName = r.StudentProfile.User.FirstName,
                StudentPatronymic = r.StudentProfile.User.Patronymic,
                StudentEmail = r.StudentProfile.User.Email,
                GroupName = r.StudentProfile.Group.Name,
                Status = r.Status,
                DecisionComment = r.DecisionComment,
                CreatedAt = r.CreatedAt,
                DecidedAt = r.DecidedAt
            });
    }

    private static ReservationResponse ToResponse(ReservationRow row, bool canCancel)
    {
        static string JoinName(params string?[] parts) =>
            string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));

        return new ReservationResponse
        {
            Id = row.Id,
            TopicId = row.TopicId,
            TopicTitle = row.TopicTitle,
            TopicDescription = row.TopicDescription,
            Origin = row.Origin?.ToString(),
            SupervisorId = row.SupervisorId,
            SupervisorName = row.SupervisorId is null ? null : JoinName(row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic),
            StudentProfileId = row.StudentProfileId,
            StudentName = JoinName(row.StudentLastName, row.StudentFirstName, row.StudentPatronymic),
            StudentEmail = row.StudentEmail,
            GroupName = row.GroupName,
            Status = row.Status.ToString(),
            DecisionComment = row.DecisionComment,
            CreatedAt = row.CreatedAt,
            DecidedAt = row.DecidedAt,
            CanCancel = canCancel
        };
    }

    private sealed class ReservationRow
    {
        public Guid Id { get; init; }
        public Guid? TopicId { get; init; }
        public string TopicTitle { get; init; } = string.Empty;
        public string? TopicDescription { get; init; }
        public TopicOrigin? Origin { get; init; }
        public Guid? SupervisorId { get; init; }
        public string? SupervisorLastName { get; init; }
        public string? SupervisorFirstName { get; init; }
        public string? SupervisorPatronymic { get; init; }
        public Guid StudentProfileId { get; init; }
        public string StudentLastName { get; init; } = string.Empty;
        public string StudentFirstName { get; init; } = string.Empty;
        public string? StudentPatronymic { get; init; }
        public string StudentEmail { get; init; } = string.Empty;
        public string GroupName { get; init; } = string.Empty;
        public ReservationStatus Status { get; init; }
        public string? DecisionComment { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? DecidedAt { get; init; }
    }
}
```

- [ ] **Step 4: Create `Controllers/ReservationsController.cs`**

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

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/approve")]
    public Task<IActionResult> Approve(Guid id) =>
        Run(user => _reservationService.ApproveAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id, [FromBody] DecisionRequest request) =>
        Run(user => _reservationService.RejectAsync(user, id, request));

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid id) =>
        Run(user => _reservationService.CancelAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/release")]
    public Task<IActionResult> Release(Guid id, [FromBody] DecisionRequest request) =>
        Run(user => _reservationService.ReleaseAsync(user, id, request));

    [Authorize(Roles = "Admin")]
    [HttpPost("/api/topics/{topicId:guid}/assign")]
    public Task<IActionResult> Assign(Guid topicId, [FromBody] AssignTopicRequest request) =>
        Run(_ => _reservationService.AssignAsync(topicId, request));

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
    public async Task<IActionResult> ForDecision([FromQuery] ReservationStatus status = ReservationStatus.Pending)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _reservationService.GetForDecisionAsync(user, status));
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

- [ ] **Step 5: Register and build**

In `Program.cs` add `builder.Services.AddScoped<IReservationService, ReservationService>();`.

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `0 Error(s)` twice; no pending model changes.

---

### Task 6: Backend endpoint verification

**Files:**
- Create: `.superpowers/checks/topics-check.mjs` (git-ignored)

- [ ] **Step 1: Start the API** (background, from the repository root)

```bash
dotnet run --project backend/DiplomaTracker.Api --launch-profile http
```

The first start creates the database and seeds it. Wait until `http://localhost:5000/api/registration` responds.

- [ ] **Step 2: Create `.superpowers/checks/topics-check.mjs`**

```javascript
const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []

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

const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')

const groups = (await call('GET', '/api/groups', { token: admin })).body
const seedGroup = groups.find((g) => g.name === 'Seed Group A')
const departmentId = seedGroup.departmentId
const teachers = (await call('GET', '/api/teachers', { token: admin })).body
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id

async function createStudent(suffix) {
  const email = `topic.${suffix}.${stamp}@student.local`
  const created = await call('POST', '/api/students', { token: admin, json: { firstName: 'Topic', lastName: `Student${suffix}`, email, studentNumber: `T${suffix}${stamp}`, password: 'Password1!', groupId: seedGroup.id } })
  return { id: created.body.id, token: await login(email, 'Password1!') }
}

const s1 = await createStudent('A')
const s2 = await createStudent('B')
const s3 = await createStudent('C')

const teacher2Email = `teacher2.${stamp}@diploma.local`
const teacher2Id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Second', lastName: 'Teacher', email: teacher2Email, password: 'Teacher456!' } })).body.id
const teacher2 = await login(teacher2Email, 'Teacher456!')

await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })

// Catalogue
const t1 = await call('POST', '/api/topics', { token: teacher, json: { title: `Topic One ${stamp}`, description: 'First', departmentId } })
check('01 teacher creates topic', t1.status, 201)
const t2 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Two ${stamp}`, departmentId } })).body
const t4 = (await call('POST', '/api/topics', { token: admin, json: { title: `Topic Four ${stamp}`, departmentId, supervisorId: teacherId } })).body
const t5 = (await call('POST', '/api/topics', { token: teacher2, json: { title: `Topic Five ${stamp}`, departmentId } })).body
check('02 admin topic without supervisor refused', (await call('POST', '/api/topics', { token: admin, json: { title: 'X', departmentId } })).body.code, 'topic.supervisorInvalid')
check('03a supervisors list for student', (await call('GET', '/api/topics/supervisors', { token: s1.token })).body.some((t) => t.id === teacherId), true)
check('03 unknown department refused', (await call('POST', '/api/topics', { token: teacher, json: { title: 'X', departmentId: '00000000-0000-0000-0000-000000000001' } })).body.code, 'topic.departmentInvalid')

const otherFaculty = (await call('POST', '/api/faculties', { token: admin, json: { name: `Other Faculty ${stamp}`, shortName: `OF${stamp}` } })).body
const otherDepartment = (await call('POST', '/api/departments', { token: admin, json: { facultyId: otherFaculty.id, name: `Other Department ${stamp}`, shortName: `OD${stamp}` } })).body
const t3 = (await call('POST', '/api/topics', { token: teacher, json: { title: `Topic Other ${stamp}`, departmentId: otherDepartment.id } })).body

const catalogue = (await call('GET', '/api/topics', { token: s1.token })).body
check('04 student sees own-department topic', catalogue.some((t) => t.id === t1.body.id), true)
check('05 student does not see other department', catalogue.some((t) => t.id === t3.id), false)
check('06 other department reserve refused', (await call('POST', `/api/topics/${t3.id}/reserve`, { token: s1.token })).body.code, 'topic.notInYourDepartment')

// Reserve, reject, reserve, approve, release
const r1 = await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })
check('07 reserve', r1.status, 200)
check('08 reservation pending', r1.body.status, 'Pending')
check('09 second reservation refused', (await call('POST', `/api/topics/${t2.id}/reserve`, { token: s1.token })).body.code, 'reservation.alreadyActive')
check('10 teacher2 cannot decide', (await call('POST', `/api/reservations/${r1.body.id}/approve`, { token: teacher2 })).body.code, 'reservation.notSupervisor')
const rejected = await call('POST', `/api/reservations/${r1.body.id}/reject`, { token: teacher, json: { comment: 'Please narrow the scope' } })
check('11 reject', rejected.body.status, 'Rejected')
check('12 topic available again', (await call('GET', `/api/topics/${t1.body.id}`, { token: admin })).body.status, 'Available')
const mine = (await call('GET', '/api/reservations/mine', { token: s1.token })).body
check('13 history keeps comment', mine[0].decisionComment, 'Please narrow the scope')

const r1b = (await call('POST', `/api/topics/${t1.body.id}/reserve`, { token: s1.token })).body
check('14 approve', (await call('POST', `/api/reservations/${r1b.id}/approve`, { token: teacher })).body.status, 'Approved')
const s1Profile = (await call('GET', `/api/students/${s1.id}`, { token: admin })).body
check('15 student topic set', s1Profile.topicTitle, `Topic One ${stamp}`)
check('16 student supervisor set', s1Profile.supervisorId, teacherId)
check('17 approved topic not editable', (await call('PUT', `/api/topics/${t1.body.id}`, { token: teacher, json: { title: 'Changed', departmentId } })).body.code, 'topic.notEditable')
check('18 cancel approved refused', (await call('POST', `/api/reservations/${r1b.id}/cancel`, { token: s1.token })).body.code, 'reservation.invalidState')
check('19 release', (await call('POST', `/api/reservations/${r1b.id}/release`, { token: teacher, json: { comment: 'Changed plans' } })).body.status, 'Released')
check('20 student topic cleared', (await call('GET', `/api/students/${s1.id}`, { token: admin })).body.topicId, null)

// Proposals
const p1 = await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal ${stamp}`, description: 'Own idea', supervisorId: teacherId } })
check('21 propose', p1.status, 200)
check('22 teacher sees proposal', (await call('GET', '/api/topics', { token: teacher })).body.some((t) => t.id === p1.body.topicId && t.origin === 'StudentProposal'), true)
check('23 student cancels proposal', (await call('POST', `/api/reservations/${p1.body.id}/cancel`, { token: s1.token })).body.status, 'Cancelled')
check('24 proposal topic deleted', (await call('GET', `/api/topics/${p1.body.topicId}`, { token: admin })).status, 404)
check('25 history keeps title', (await call('GET', '/api/reservations/mine', { token: s1.token })).body[0].topicTitle, `Proposal ${stamp}`)
check('26 proposal to non-teacher refused', (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: 'X', supervisorId: s2.id } })).body.code, 'proposal.teacherInvalid')
const p2 = (await call('POST', '/api/topics/proposals', { token: s1.token, json: { title: `Proposal Two ${stamp}`, supervisorId: teacherId } })).body
check('27 accept proposal', (await call('POST', `/api/reservations/${p2.id}/approve`, { token: teacher })).body.status, 'Approved')
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

// Assignment
const assigned = await call('POST', `/api/topics/${t4.id}/assign`, { token: admin, json: { studentId: loser.id } })
check('33 admin assigns topic', assigned.body.status, 'Approved')
check('34 assign to student with topic refused', (await call('POST', `/api/topics/${t5.id}/assign`, { token: admin, json: { studentId: loser.id } })).body.code, 'student.alreadyHasTopic')

// Teacher lists and deletion
check('35 pending list for teacher', (await call('GET', '/api/reservations/pending', { token: teacher })).body.every((r) => r.status === 'Pending'), true)
check('36 approved list for teacher', (await call('GET', '/api/reservations/pending?status=Approved', { token: teacher })).body.some((r) => r.topicId === t4.id), true)
check('37 teacher cannot delete other teacher topic', (await call('DELETE', `/api/topics/${t5.id}`, { token: teacher })).body.code, 'topic.notOwner')
check('38 teacher deletes own available topic', (await call('DELETE', `/api/topics/${t1.body.id}`, { token: teacher })).status, 204)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 3: Run and stop the API**

```bash
node .superpowers/checks/topics-check.mjs
taskkill //F //IM DiplomaTracker.Api.exe
netstat -ano | grep ":5000 .*LISTEN" || echo "port 5000 free"
```

Expected: `39/39 checks passed`; `port 5000 free`.

---

### Task 7: Client contracts and API modules

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`
- Create: `frontend/diploma-tracker-web/src/api/topicsApi.ts`, `reservationsApi.ts`, `settingsApi.ts`
- Modify: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`

**Interfaces:**
- Produces: types `TopicStatus`, `TopicOrigin`, `ReservationStatus`, `Topic`, `TopicRequest`, `TopicQuery`, `Reservation`, `ProposeTopicRequest`, `TopicSelectionSettings`; functions listed in Steps 2–4; navigation entries for the new pages.

- [ ] **Step 1: Update `src/api/types.ts`**

In `Student`, replace `diplomaTopic: string | null` with:

```typescript
  topicId: string | null
  topicTitle: string | null
```

In `CreateStudentRequest` and `UpdateStudentRequest`, delete `diplomaTopic?: string`. In `GroupStudent`, replace `diplomaTopic: string | null` with `topicTitle: string | null`.

Append:

```typescript
export type TopicStatus = 'Available' | 'Reserved' | 'Approved'
export type TopicOrigin = 'Catalogue' | 'StudentProposal'
export type ReservationStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'Released'

export type Topic = {
  id: string
  title: string
  description: string | null
  supervisorId: string
  supervisorName: string
  departmentId: string
  departmentName: string
  facultyName: string
  origin: TopicOrigin
  status: TopicStatus
  activeReservationId: string | null
  activeReservationStatus: ReservationStatus | null
  studentProfileId: string | null
  studentName: string | null
  groupName: string | null
  createdAt: string
  updatedAt: string
}

export type TopicRequest = {
  title: string
  description?: string
  departmentId: string
  supervisorId?: string
}

export type TopicQuery = {
  search?: string
  supervisorId?: string
  departmentId?: string
  status?: TopicStatus
}

export type Reservation = {
  id: string
  topicId: string | null
  topicTitle: string
  topicDescription: string | null
  origin: TopicOrigin | null
  supervisorId: string | null
  supervisorName: string | null
  studentProfileId: string
  studentName: string
  studentEmail: string
  groupName: string
  status: ReservationStatus
  decisionComment: string | null
  createdAt: string
  decidedAt: string | null
  canCancel: boolean
}

export type ProposeTopicRequest = {
  title: string
  description?: string
  supervisorId: string
}

export type TopicSelectionSettings = {
  deadline: string | null
}

export type SupervisorOption = {
  id: string
  name: string
}
```

- [ ] **Step 2: Create `src/api/topicsApi.ts`**

```typescript
import { apiRequest } from './apiClient'
import type { SupervisorOption, Topic, TopicQuery, TopicRequest } from './types'

function toQueryString(query: TopicQuery): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function getTopics(query: TopicQuery = {}): Promise<Topic[]> {
  return apiRequest<Topic[]>(`/api/topics${toQueryString(query)}`)
}

export function getTopic(id: string): Promise<Topic> {
  return apiRequest<Topic>(`/api/topics/${id}`)
}

export function createTopic(request: TopicRequest): Promise<Topic> {
  return apiRequest<Topic>('/api/topics', { method: 'POST', body: JSON.stringify(request) })
}

export function updateTopic(id: string, request: TopicRequest): Promise<Topic> {
  return apiRequest<Topic>(`/api/topics/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deleteTopic(id: string): Promise<void> {
  await apiRequest<void>(`/api/topics/${id}`, { method: 'DELETE' })
}

export function getTopicSupervisors(): Promise<SupervisorOption[]> {
  return apiRequest<SupervisorOption[]>('/api/topics/supervisors')
}
```

- [ ] **Step 3: Create `src/api/reservationsApi.ts`**

```typescript
import { apiRequest } from './apiClient'
import type { ProposeTopicRequest, Reservation, ReservationStatus } from './types'

export function reserveTopic(topicId: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/topics/${topicId}/reserve`, { method: 'POST' })
}

export function proposeTopic(request: ProposeTopicRequest): Promise<Reservation> {
  return apiRequest<Reservation>('/api/topics/proposals', { method: 'POST', body: JSON.stringify(request) })
}

export function approveReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/approve`, { method: 'POST' })
}

export function rejectReservation(id: string, comment?: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export function cancelReservation(id: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/cancel`, { method: 'POST' })
}

export function releaseReservation(id: string, comment?: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/reservations/${id}/release`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export function assignTopic(topicId: string, studentId: string): Promise<Reservation> {
  return apiRequest<Reservation>(`/api/topics/${topicId}/assign`, { method: 'POST', body: JSON.stringify({ studentId }) })
}

export function getMyReservations(): Promise<Reservation[]> {
  return apiRequest<Reservation[]>('/api/reservations/mine')
}

export function getReservationsForDecision(status: Extract<ReservationStatus, 'Pending' | 'Approved'> = 'Pending'): Promise<Reservation[]> {
  return apiRequest<Reservation[]>(`/api/reservations/pending?status=${status}`)
}
```

- [ ] **Step 4: Create `src/api/settingsApi.ts`**

```typescript
import { apiRequest } from './apiClient'
import type { TopicSelectionSettings } from './types'

export function getTopicSelectionSettings(): Promise<TopicSelectionSettings> {
  return apiRequest<TopicSelectionSettings>('/api/settings/topic-selection')
}

export async function setTopicSelectionDeadline(deadline: string | null): Promise<void> {
  await apiRequest<void>('/api/settings/topic-selection', { method: 'PUT', body: JSON.stringify({ deadline }) })
}
```

- [ ] **Step 5: Extend navigation**

In `src/components/layout/navigation.ts`, update `navigationByRole`:

```typescript
export const navigationByRole: Record<Role, NavItem[]> = {
  Admin: [
    { to: '/admin/dashboard', labelKey: 'nav.dashboard' },
    { to: '/admin/faculties', labelKey: 'nav.faculties' },
    { to: '/admin/groups', labelKey: 'nav.groups' },
    { to: '/admin/students', labelKey: 'nav.students' },
    { to: '/admin/teachers', labelKey: 'nav.teachers' },
    { to: '/admin/topics', labelKey: 'nav.topics' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' },
    { to: '/admin/settings', labelKey: 'nav.settings' }
  ],
  Teacher: [
    { to: '/teacher/dashboard', labelKey: 'nav.dashboard' },
    { to: '/teacher/topics', labelKey: 'nav.myTopics' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  Student: [
    { to: '/student/dashboard', labelKey: 'nav.dashboard' },
    { to: '/student/topics', labelKey: 'nav.topics' },
    { to: '/student/tasks', labelKey: 'nav.myTasks' }
  ]
}
```

Add to `nav` in `uk.json`: `"topics": "Теми"`, `"myTopics": "Мої теми"`, `"settings": "Налаштування"`; in `en.json`: `"topics": "Topics"`, `"myTopics": "My topics"`, `"settings": "Settings"`.

---

### Task 8: Topic pages

Shared page rules from the design system plan (Tasks 9–12 section) apply.

**Files:**
- Create: `src/components/topics/topicTones.ts`, `TopicStatusBadge.tsx`, `ReservationStatusBadge.tsx`, `TopicFormModal.tsx`, `DecisionCommentModal.tsx`, `TopicDetailsModal.tsx`, `MyTopicCard.tsx`
- Create: `src/pages/StudentTopicsPage.tsx`, `TeacherTopicsPage.tsx`, `AdminTopicsPage.tsx`, `AdminSettingsPage.tsx`
- Modify: `src/App.tsx`, `src/pages/StudentDashboardPage.tsx`, `src/pages/StudentsPage.tsx`, `src/pages/GroupDetailsPage.tsx`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Component and page specifics:**
- `topicTones.ts`: `topicStatusTone: Record<TopicStatus, BadgeTone>` = `{ Available: 'success', Reserved: 'warning', Approved: 'info' }`; `reservationStatusTone: Record<ReservationStatus, BadgeTone>` = `{ Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral', Released: 'neutral' }`.
- `TopicStatusBadge({ status })` and `ReservationStatusBadge({ status })` render `Badge` with the tone and label `topics.status.<status>` / `reservations.status.<status>`.
- `TopicFormModal({ open, mode: 'create'|'edit', initial?: Topic, showSupervisor: boolean, departments: Department[], teachers: Teacher[], onClose, onSaved })`: fields title (`maxLength` 300), description `Textarea` (`maxLength` 4000), department `Select` (label `{{name}} · {{facultyName}}`, required), supervisor `Select` of active teachers shown only when `showSupervisor`; submits `createTopic`/`updateTopic`; errors via `useErrorMessage` inline at the top of the modal.
- `DecisionCommentModal({ open, title, confirmLabel, tone, onConfirm(comment?: string), onClose, loading })`: optional `Textarea` `maxLength` 1000.
- `TopicDetailsModal({ topic, open, onClose, footer? })`: title, supervisor, department · faculty, status badge, full description (`whitespace-pre-line`).
- `MyTopicCard()`: loads `getMyReservations()`; shows the latest `Pending` or `Approved` reservation (title, `ReservationStatusBadge`, supervisor, `topics.cancel` button when `canCancel`, `ConfirmDialog` `topics.cancelConfirm`); if none is active, shows `topics.noTopicYet` with a primary button to `/student/topics`; when the latest reservation overall is `Rejected` and has a comment, shows `topics.lastRejected` with the comment in a `bg-warning-soft` block.
- `StudentTopicsPage` (`/student/topics`): `PageHeader` `topics.catalogueTitle`, description shows the deadline (`topics.deadlineInfo` with formatted date, or `topics.noDeadline`), action `topics.propose` (secondary, `Lightbulb`) disabled when selection is closed or an active reservation exists. `MyTopicCard` at the top. Filters row: `TextField` search (debounced 300 ms via `setTimeout` in an effect) and supervisor `Select` from `getTopicSupervisors()` plus `{ value: '', label: t('topics.allSupervisors') }`. `DataTable` columns: title (click opens `TopicDetailsModal`), supervisor, status badge, action `topics.reserve` (primary `sm`) disabled with `title={t('topics.reserveDisabled')}` when not allowed. Reserve asks `ConfirmDialog` `topics.reserveConfirm` (tone primary). Propose `Modal`: title (`maxLength` 300), description (`Textarea`, `maxLength` 4000), teacher `Select` from `getTopicSupervisors()` (label is the teacher's full name); if the list is empty the selector is replaced by `topics.noTeachersAvailable`. When selection is closed, an `EmptyState` with `CalendarX` and `topics.selectionClosed` replaces the actions.
- `TeacherTopicsPage` (`/teacher/topics`): `PageHeader` `topics.myTopicsTitle` with action `topics.addTopic`. Card `topics.requestsTitle`: `DataTable` of `getReservationsForDecision('Pending')` — columns student (name, group muted), topic (title; `Badge` neutral `topics.proposalBadge` when origin is `StudentProposal`), requested at, actions `topics.approve` (primary `sm`, `ConfirmDialog` tone primary) and `topics.reject` (secondary `sm`, `DecisionCommentModal`). Card `topics.approvedTitle`: `getReservationsForDecision('Approved')` with student, topic, decided at, action `topics.release` (`DecisionCommentModal`, tone danger). Card `topics.catalogueCard`: `DataTable` of own topics (title, department, status badge, student name when reserved/approved, actions edit/delete enabled only for `Available` catalogue topics). Departments for the form come from `getDepartments()` (all departments, any authenticated user).
- `AdminTopicsPage` (`/admin/topics`): `PageHeader` `topics.adminTitle` with action `topics.addTopic`. Filters: search, department `Select`, supervisor `Select` (from `getTeachers()`), status `SegmentedControl` (`all`, `Available`, `Reserved`, `Approved`). `DataTable` columns: title, supervisor, department, status, student (name · group), actions: edit/delete for available catalogue topics, `topics.assign` for available catalogue topics (opens `Modal` with a student `Select` of active students without `topicId` from `getStudents()`), `topics.release` when `activeReservationStatus` is `Approved`, approve/reject when `Pending`. Uses `TopicFormModal` with `showSupervisor`.
- `AdminSettingsPage` (`/admin/settings`): `PageHeader` `settings.title`. Card `settings.registrationTitle` holds the registration `Switch` (moved from the Students page, same behaviour and toasts). Card `settings.selectionTitle`: `TextField type="datetime-local"` label `settings.deadline` pre-filled from the stored UTC value converted to local time, hint `settings.deadlineHint`; buttons `common.save` (sends `new Date(value).toISOString()`) and `settings.clearDeadline` (sends `null`).
- `StudentDashboardPage`: render `MyTopicCard` above the existing *My steps* card.
- `StudentsPage`: remove the registration card; remove the topic field from create/edit; the table shows `topicTitle` (or `common.notSet`) in a `students.topic` column.
- `GroupDetailsPage`: students table shows `topicTitle`.
- `App.tsx` routes: inside the Student role group `student/topics` → `StudentTopicsPage`; Teacher group `teacher/topics` → `TeacherTopicsPage`; Admin group `admin/topics` → `AdminTopicsPage` and `admin/settings` → `AdminSettingsPage`.

**Translation blocks** — add to `uk.json`:

```json
  "topics": {
    "catalogueTitle": "Теми дипломних робіт",
    "myTopicsTitle": "Мої теми",
    "adminTitle": "Усі теми",
    "addTopic": "Додати тему",
    "editTopic": "Редагувати тему",
    "deleteConfirm": "Видалити тему «{{title}}»?",
    "title": "Назва",
    "description": "Опис",
    "department": "Кафедра",
    "supervisor": "Керівник",
    "allSupervisors": "Усі керівники",
    "allDepartments": "Усі кафедри",
    "student": "Студент",
    "requestedAt": "Запит від",
    "decidedAt": "Рішення від",
    "search": "Пошук",
    "searchPlaceholder": "Назва або опис",
    "filterAll": "Усі",
    "status": {
      "Available": "Вільна",
      "Reserved": "Заброньована",
      "Approved": "Затверджена"
    },
    "reserve": "Забронювати",
    "reserveConfirm": "Забронювати тему «{{title}}»? Поки керівник не прийме рішення, інші теми бронювати не можна.",
    "reserveDisabled": "Ви вже маєте активне бронювання або тему",
    "reserved": "Тему заброньовано",
    "propose": "Запропонувати свою тему",
    "proposeTitle": "Власна тема",
    "proposeHint": "Тему отримає обраний викладач; після його згоди вона стане вашою.",
    "teacher": "Викладач",
    "noTeachersAvailable": "Немає активних викладачів.",
    "proposed": "Пропозицію надіслано",
    "proposalBadge": "Пропозиція студента",
    "myTopic": "Моя тема",
    "noTopicYet": "Ви ще не обрали тему.",
    "browseTopics": "Переглянути теми",
    "cancel": "Скасувати бронювання",
    "cancelConfirm": "Скасувати бронювання теми «{{title}}»?",
    "cancelled": "Бронювання скасовано",
    "lastRejected": "Останній запит відхилено",
    "deadlineInfo": "Обрати тему можна до {{date}}.",
    "noDeadline": "Термін вибору теми не встановлено.",
    "selectionClosed": "Термін вибору теми минув. Зверніться до керівника або адміністратора.",
    "noTopics": "Вільних тем на вашій кафедрі немає.",
    "noOwnTopics": "Ви ще не додали тем.",
    "requestsTitle": "Запити на затвердження",
    "noRequests": "Нових запитів немає.",
    "approvedTitle": "Затверджені студенти",
    "noApproved": "Затверджених студентів немає.",
    "catalogueCard": "Мій каталог тем",
    "approve": "Затвердити",
    "approveConfirm": "Затвердити тему «{{title}}» для {{student}}?",
    "approved": "Тему затверджено",
    "reject": "Відхилити",
    "rejectTitle": "Відхилити запит",
    "rejected": "Запит відхилено",
    "release": "Звільнити тему",
    "releaseTitle": "Звільнити тему",
    "released": "Тему звільнено",
    "comment": "Коментар для студента",
    "assign": "Призначити студенту",
    "assignTitle": "Призначити тему «{{title}}»",
    "assigned": "Тему призначено",
    "noEligibleStudents": "Немає активних студентів без теми."
  },
  "reservations": {
    "status": {
      "Pending": "Очікує рішення",
      "Approved": "Затверджено",
      "Rejected": "Відхилено",
      "Cancelled": "Скасовано",
      "Released": "Звільнено"
    }
  },
  "settings": {
    "title": "Налаштування",
    "registrationTitle": "Реєстрація студентів",
    "selectionTitle": "Вибір тем",
    "deadline": "Термін вибору теми",
    "deadlineHint": "Після цього часу студенти не можуть бронювати, пропонувати чи скасовувати теми.",
    "clearDeadline": "Прибрати термін",
    "deadlineSaved": "Термін збережено",
    "deadlineCleared": "Термін прибрано"
  }
```

Add to the `errors` object in `uk.json`:

```json
    "topic": {
      "notFound": "Тему не знайдено.",
      "notAvailable": "Ця тема вже недоступна.",
      "notInYourDepartment": "Тема належить іншій кафедрі.",
      "notEditable": "Змінювати чи видаляти можна лише вільні теми каталогу.",
      "notOwner": "Можна змінювати лише власні теми.",
      "departmentInvalid": "Обраної кафедри не існує.",
      "supervisorInvalid": "Керівником може бути лише активний викладач.",
      "studentProfileRequired": "Ця дія доступна лише студентам із профілем."
    },
    "proposal": {
      "teacherInvalid": "Обраний викладач має бути активним."
    },
    "reservation": {
      "notFound": "Бронювання не знайдено.",
      "alreadyActive": "У вас уже є активне бронювання або затверджена тема.",
      "invalidState": "Цю дію не можна виконати для бронювання в поточному стані.",
      "notYours": "Це бронювання належить іншому студенту.",
      "notSupervisor": "Рішення може ухвалити лише керівник теми."
    },
    "selection": {
      "closed": "Термін вибору теми минув."
    },
    "assignment": {
      "studentInvalid": "Обраного студента не існує або його деактивовано."
    }
```

and add `"alreadyHasTopic": "Студент уже має тему."` inside the existing `errors.student` object.

Add to `en.json`:

```json
  "topics": {
    "catalogueTitle": "Diploma topics",
    "myTopicsTitle": "My topics",
    "adminTitle": "All topics",
    "addTopic": "Add topic",
    "editTopic": "Edit topic",
    "deleteConfirm": "Delete topic \"{{title}}\"?",
    "title": "Title",
    "description": "Description",
    "department": "Department",
    "supervisor": "Supervisor",
    "allSupervisors": "All supervisors",
    "allDepartments": "All departments",
    "student": "Student",
    "requestedAt": "Requested",
    "decidedAt": "Decided",
    "search": "Search",
    "searchPlaceholder": "Title or description",
    "filterAll": "All",
    "status": {
      "Available": "Available",
      "Reserved": "Reserved",
      "Approved": "Approved"
    },
    "reserve": "Reserve",
    "reserveConfirm": "Reserve \"{{title}}\"? You cannot reserve another topic until the supervisor decides.",
    "reserveDisabled": "You already have an active reservation or topic",
    "reserved": "Topic reserved",
    "propose": "Propose my own topic",
    "proposeTitle": "Your own topic",
    "proposeHint": "The chosen teacher receives the proposal; once they accept, it becomes your topic.",
    "teacher": "Teacher",
    "noTeachersAvailable": "No active teachers.",
    "proposed": "Proposal sent",
    "proposalBadge": "Student proposal",
    "myTopic": "My topic",
    "noTopicYet": "You have not chosen a topic yet.",
    "browseTopics": "Browse topics",
    "cancel": "Cancel reservation",
    "cancelConfirm": "Cancel your reservation of \"{{title}}\"?",
    "cancelled": "Reservation cancelled",
    "lastRejected": "Your last request was rejected",
    "deadlineInfo": "You can choose a topic until {{date}}.",
    "noDeadline": "No topic selection deadline is set.",
    "selectionClosed": "The topic selection deadline has passed. Contact your supervisor or administrator.",
    "noTopics": "No available topics in your department.",
    "noOwnTopics": "You have not added any topics yet.",
    "requestsTitle": "Requests awaiting decision",
    "noRequests": "No new requests.",
    "approvedTitle": "Approved students",
    "noApproved": "No approved students.",
    "catalogueCard": "My topic catalogue",
    "approve": "Approve",
    "approveConfirm": "Approve \"{{title}}\" for {{student}}?",
    "approved": "Topic approved",
    "reject": "Reject",
    "rejectTitle": "Reject request",
    "rejected": "Request rejected",
    "release": "Release topic",
    "releaseTitle": "Release topic",
    "released": "Topic released",
    "comment": "Comment for the student",
    "assign": "Assign to student",
    "assignTitle": "Assign \"{{title}}\"",
    "assigned": "Topic assigned",
    "noEligibleStudents": "No active students without a topic."
  },
  "reservations": {
    "status": {
      "Pending": "Awaiting decision",
      "Approved": "Approved",
      "Rejected": "Rejected",
      "Cancelled": "Cancelled",
      "Released": "Released"
    }
  },
  "settings": {
    "title": "Settings",
    "registrationTitle": "Student registration",
    "selectionTitle": "Topic selection",
    "deadline": "Topic selection deadline",
    "deadlineHint": "After this time students cannot reserve, propose or cancel topics.",
    "clearDeadline": "Clear deadline",
    "deadlineSaved": "Deadline saved",
    "deadlineCleared": "Deadline cleared"
  }
```

Add to the `errors` object in `en.json`:

```json
    "topic": {
      "notFound": "Topic not found.",
      "notAvailable": "This topic is no longer available.",
      "notInYourDepartment": "The topic belongs to another department.",
      "notEditable": "Only available catalogue topics can be changed or deleted.",
      "notOwner": "You can change only your own topics.",
      "departmentInvalid": "The selected department does not exist.",
      "supervisorInvalid": "The supervisor must be an active teacher.",
      "studentProfileRequired": "Only students with a profile can do this."
    },
    "proposal": {
      "teacherInvalid": "The chosen teacher must be active."
    },
    "reservation": {
      "notFound": "Reservation not found.",
      "alreadyActive": "You already have an active reservation or approved topic.",
      "invalidState": "This action is not possible for the reservation in its current state.",
      "notYours": "This reservation belongs to another student.",
      "notSupervisor": "Only the topic's supervisor can decide."
    },
    "selection": {
      "closed": "The topic selection deadline has passed."
    },
    "assignment": {
      "studentInvalid": "The selected student does not exist or is inactive."
    }
```

and add `"alreadyHasTopic": "The student already has a topic."` inside `errors.student`.

In both files remove the now-unused `students.registrationOpen`, `students.registrationHint`, `students.registrationOpened`, `students.registrationClosed` only if no code references them after moving the switch; otherwise keep them and reference them from `AdminSettingsPage`. (Keeping them is the default.)

- [ ] **Step 1: Add translations and the topic components**
- [ ] **Step 2: Build the four pages and wire the routes**
- [ ] **Step 3: Update the dashboard, students and group details pages**
- [ ] **Step 4: Gates**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean; `0 errors`; keys match; `✓ built in`.

---

### Task 9: Browser walkthrough, verification and commit

This phase is the first real workflow, so the owner walks through it (spec §7). Sign-in in the in-app browser is done by the owner.

**Files:**
- Modify: `docs/superpowers/test-backlog.md`, `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: Walkthrough (controller with the owner)**

Start `api` and `web` from `.claude/launch.json`. With the owner signed in:
1. Admin → Settings: clear the deadline; open registration off/on toggles work.
2. Teacher → My topics: add two topics for department SE.
3. Student (seed) → Topics: both visible; reserve one; *My topic* shows *Awaiting decision*; *Reserve* disabled on the other; cancel; reserve again.
4. Teacher → Requests: reject with a comment; student sees the comment; student proposes a topic to the teacher; teacher approves; student dashboard shows *Approved* with supervisor.
5. Admin → Topics: release the approved proposal; it disappears from the list; assign an available topic to the seed student.
6. Admin → Settings: set a past deadline; student sees the closed notice.
7. Switch UK/EN on each page; no untranslated keys appear.

- [ ] **Step 2: Gates**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
cd ../frontend/diploma-tracker-web
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean.

- [ ] **Step 3: Append the topics section to `docs/superpowers/test-backlog.md`**

```markdown

## Topics and reservation

### Service level, InMemory
- `TopicService.GetTopicsAsync`: student sees only own-department available catalogue topics with active supervisors plus own active topic; teacher sees only supervised topics; admin filters by department, supervisor, status and search; student responses hide student names.
- `TopicService.GetTopicAsync`: student access to other department, to reserved topics of others, to own topic; teacher access to others' topics (404).
- `TopicService.Create/Update/Delete`: teacher is always supervisor; admin supervisor required and must be an active teacher; unknown department; teacher editing another's topic (`topic.notOwner`); editing reserved/approved/proposal topics (`topic.notEditable`).
- `ReservationService.ReserveAsync`: no profile; deadline passed; already active (pending and approved); other department; not available; inactive supervisor; success sets topic Reserved and snapshot title.
- `ReservationService.ProposeAsync`: invalid teacher; department taken from the student's group; topic origin and status.
- `ApproveAsync`/`RejectAsync`/`ReleaseAsync`: non-supervisor teacher; admin override; wrong state; approval sets student topic and supervisor; rejection returns catalogue topic to Available and deletes proposals; release clears student topic and supervisor and deletes proposals; comments trimmed.
- `CancelAsync`: other student's reservation; deadline passed; approved reservation; proposal deletion.
- `AssignAsync`: unknown/inactive student; student with topic; student with pending reservation; non-available topic.
- `GetMineAsync`: order and `CanCancel` with and without deadline; `GetForDecisionAsync` status filter and teacher scoping.
- `TopicSettingsService`: UTC normalisation of local and unspecified kinds; open/closed around the deadline.

### SQL Server integration
- Filtered unique indexes: two pending reservations for one topic, and two active reservations for one student, are rejected by the database.
- `rowversion` concurrency: parallel reservations of one topic produce one success and `topic.notAvailable`.
- Deleting a topic sets `TopicReservations.TopicId` to null and keeps `TopicTitle`.

### HTTP level
- Role restrictions on every endpoint in spec §5; `status` query on `/api/reservations/pending`.

### Frontend
- Student topics page: reserve disabled states, deadline notice, propose modal validation, debounced search.
- Teacher requests: approve/reject/release flows refresh both lists.
- Admin settings: datetime-local ↔ UTC conversion round trip.
```

- [ ] **Step 4: Update `docs/superpowers/PROJECT_MEMORY.md`**

- Status row: `| 4 Topics and reservation | Done — commit \`Implement topics and reservation\` | \`2026-09-17-topics-and-reservation-design.md\` |`.
- `## Decisions`: add `A student's topic is always a \`Topic\` row (\`StudentProfile.TopicId\`); supervisor comes from the approved topic.` and `Settings (registration switch, topic selection deadline) live on the admin Settings page.`
- `## Gotchas`: add `**Filtered unique indexes** on \`TopicReservations\` enforce one active request per topic and per student; tests on InMemory cannot see them.`
- `## Log`: today's date — `Topics and reservation implemented.`

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src docs/superpowers/test-backlog.md docs/superpowers/PROJECT_MEMORY.md
git diff --cached --name-only | grep -E '/bin/|/obj/|node_modules|PROJECT_PAPER|README|appsettings'; echo "exit=$?"
git commit -m "Implement topics and reservation"
git log --oneline -1
```

Expected: grep prints nothing, `exit=1`; the log's first line ends with `Implement topics and reservation`.
