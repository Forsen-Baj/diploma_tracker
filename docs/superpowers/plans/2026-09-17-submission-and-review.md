# Submission and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students submit a main document with optional supporting files and a message against each step in strict order; reviewers (group reviewers, the student's supervisor, administrators) approve with a required mark or return with a comment; every step shows a timeline, and dashboards show per-student and per-group progress.

**Architecture:** `StudentTask` gains a row version and an integer mark; `Submission` and `SubmissionFile` record every attempt. Files go through `IFileStorage` (local disk implementation, root validated at startup) and are streamed only by an authorised endpoint. One `IAccessScope` service answers "which groups can this user see" and "may this user review this student", and every group, step, queue and progress query uses it. `StudentWorkflowService` owns submissions, decisions, the queue and progress; it creates missing student steps on demand so students added to a group later still receive the group's steps.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-17-submission-and-review-design.md`

**Prerequisites:** onboarding, design system and topics plans implemented and committed.

## Global Constraints

- Reviewers of a step: teachers assigned to the student's group, the student's supervisor, administrators.
- Strict order: a step accepts a submission only when the previous step (by template `Order`, then title, among the group's assigned steps) is `Approved`; the first step has no predecessor.
- One undecided submission per step: submitting is refused while the step is `Submitted`; approved steps are final.
- Main file: `.docx`, `.pdf` or `.pptx`, content matching (`PK\x03\x04` for `.docx`/`.pptx`, `%PDF` for `.pdf`), at most **20 MB**. Supporting files: at most **3**, at most **20 MB** each, any extension except `.exe .dll .msi .bat .cmd .ps1 .sh .js .vbs .jar .com .scr`. Whole request at most **90 MB**.
- Message and reviewer comment at most **2000** characters; comment required when returning; mark required when approving, whole number **0–100**.
- `IsLate` is fixed at submission time: `SubmittedAt > GroupTask.Deadline`.
- Files are stored under `Storage:RootPath` in `yyyy/MM` subfolders with random names; startup fails if the path is missing or not writable. Downloads send `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; supporting files use `application/octet-stream`.
- Teacher visibility: a teacher sees a group they review or in which they supervise a student; any other group is `group.notFound` (404).
- Error bodies follow the phase 3 contract; new codes in `WorkflowErrors.All` and both translation files.
- **No unit tests.** Existing test projects must still compile.
- **Commits: exactly one**, in the final task: `Implement submission and review`.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, or anything under `App_Data/`.
- The local database is recreated (regenerated `InitialCreate`).

## Rulings recorded while planning

- **Missing student steps are created on demand.** Step rows were created only when a step was assigned to a group, so students imported or moved later had none. `EnsureStudentTasksAsync` fills the gap when a student's steps, a step page or a group's progress are loaded. Only steps of the student's *current* group are shown. Cost if wrong: a later refactor may prefer creating rows on import and group change.
- **Student progress for the student** uses `GET /api/students/me/progress`, because the client does not know its own profile id; `GET /api/students/{id}/progress` serves teachers and administrators.
- **Step pages:** students use `/student/tasks/:id`; reviewers use `/review/steps/:id`. Both render one shared `StepDetails` component.
- **Group task writes stay reviewer-only** for teachers (unchanged); only reads use the new visibility rule.
- **Old student-task endpoints** (`/api/student/my-tasks*`) and their DTOs are removed; the new routes replace them.
- **Page markup is specified, not transcribed**, as in the design system plan.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/StudentTask.cs`, `Submission.cs`, `SubmissionFile.cs`, `SubmissionDecision.cs`, `SubmissionFileKind.cs` | Domain |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Models/StorageSettings.cs`, `Configuration/StartupValidation.cs`, `appsettings*.json` | Storage configuration |
| `backend/DiplomaTracker.Api/Interfaces/IFileStorage.cs`, `Services/LocalFileStorage.cs` | File storage |
| `backend/DiplomaTracker.Api/Interfaces/IAccessScope.cs`, `Services/AccessScope.cs` | Visibility and review rights |
| `backend/DiplomaTracker.Api/Services/GroupService.cs`, `GroupTaskService.cs`, `Interfaces/IGroupService.cs`, `IGroupTaskService.cs`, `Controllers/GroupsController.cs`, `GroupTasksController.cs` | Visibility applied |
| `backend/DiplomaTracker.Api/Services/WorkflowErrors.cs`, `SubmissionFileRules.cs` | Codes and upload rules |
| `backend/DiplomaTracker.Api/DTOs/Workflow/*` | Contracts |
| `backend/DiplomaTracker.Api/Interfaces/IStudentWorkflowService.cs`, `Services/StudentWorkflowService.cs` | Workflow |
| `backend/DiplomaTracker.Api/Controllers/StudentTasksController.cs`, `SubmissionsController.cs`, `ReviewController.cs`, `ProgressController.cs` | HTTP |
| `frontend/diploma-tracker-web/src/api/workflowApi.ts`, `types.ts`, `groupTasksApi.ts` | Client |
| `frontend/diploma-tracker-web/src/components/workflow/*` | Step details, timeline, submit form, decision dialogs, progress matrix |
| `frontend/diploma-tracker-web/src/pages/*` | Student steps, reviewer queue and step, teacher groups, dashboards |
| `.superpowers/checks/workflow-check.mjs` (git-ignored) | Endpoint verification |

---

### Task 1: Workflow domain model and schema

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/SubmissionDecision.cs`, `SubmissionFileKind.cs`, `Submission.cs`, `SubmissionFile.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/StudentTask.cs`, `AppUser.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupTaskService.cs` (mark rename and removed student endpoints)
- Modify: `backend/DiplomaTracker.Api/Interfaces/IGroupTaskService.cs`
- Delete: `backend/DiplomaTracker.Api/DTOs/Students/MyStudentTaskResponse.cs`, `MyStudentTaskDetailsResponse.cs`, `backend/DiplomaTracker.Api/Controllers/StudentTasksController.cs`
- Replace: `backend/DiplomaTracker.Api/Migrations/*`

**Interfaces:**
- Produces: `StudentTask.Mark : int?`, `StudentTask.RowVersion : byte[]`, `StudentTask.Submissions`; `Submission`, `SubmissionFile` entities; `AppDbContext.Submissions`, `AppDbContext.SubmissionFiles`. `IGroupTaskService` loses `GetMyTasksAsync` and `GetMyTaskByIdAsync`.

- [ ] **Step 1: Create the enums and entities**

`Entities/SubmissionDecision.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum SubmissionDecision
{
    Approved,
    Returned
}
```

`Entities/SubmissionFileKind.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum SubmissionFileKind
{
    Main,
    Supporting
}
```

`Entities/Submission.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class Submission
{
    public Guid Id { get; set; }
    public Guid StudentTaskId { get; set; }
    public StudentTask StudentTask { get; set; } = null!;
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public SubmissionDecision? Decision { get; set; }
    public Guid? ReviewerId { get; set; }
    public AppUser? Reviewer { get; set; }
    public string? ReviewerComment { get; set; }
    public int? Mark { get; set; }
    public DateTime? DecidedAt { get; set; }
    public ICollection<SubmissionFile> Files { get; set; } = new List<SubmissionFile>();
}
```

`Entities/SubmissionFile.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class SubmissionFile
{
    public Guid Id { get; set; }
    public Guid SubmissionId { get; set; }
    public Submission Submission { get; set; } = null!;
    public SubmissionFileKind Kind { get; set; }
    public string OriginalName { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}
```

- [ ] **Step 2: Update `Entities/StudentTask.cs` and `Entities/AppUser.cs`**

Replace `StudentTask.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class StudentTask
{
    public Guid Id { get; set; }
    public Guid StudentProfileId { get; set; }
    public Guid GroupTaskId { get; set; }
    public StudentTaskStatus Status { get; set; } = StudentTaskStatus.Pending;
    public int? Mark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public StudentProfile StudentProfile { get; set; } = null!;
    public GroupTask GroupTask { get; set; } = null!;
    public ICollection<Submission> Submissions { get; set; } = new List<Submission>();
}
```

Add to `AppUser.cs`:

```csharp
    public ICollection<Submission> ReviewedSubmissions { get; set; } = new List<Submission>();
```

- [ ] **Step 3: Map in `Data/AppDbContext.cs`**

Add sets:

```csharp
    public DbSet<Submission> Submissions => Set<Submission>();
    public DbSet<SubmissionFile> SubmissionFiles => Set<SubmissionFile>();
```

In the student task block, replace `studentTask.Property(x => x.CurrentMark).HasColumnType("decimal(5,2)");` with:

```csharp
        studentTask.Property(x => x.Mark);
        studentTask.Property(x => x.RowVersion).IsRowVersion();
```

Append:

```csharp
        var submission = modelBuilder.Entity<Submission>();
        submission.ToTable("Submissions");
        submission.HasKey(x => x.Id);
        submission.Property(x => x.Message).HasMaxLength(2000);
        submission.Property(x => x.Decision).HasConversion<string>().HasMaxLength(50);
        submission.Property(x => x.ReviewerComment).HasMaxLength(2000);
        submission.Property(x => x.SubmittedAt).IsRequired();
        submission.HasIndex(x => new { x.StudentTaskId, x.Version }).IsUnique();
        submission.HasIndex(x => new { x.Decision, x.SubmittedAt });
        submission.HasOne(x => x.StudentTask)
            .WithMany(x => x.Submissions)
            .HasForeignKey(x => x.StudentTaskId)
            .OnDelete(DeleteBehavior.Cascade);
        submission.HasOne(x => x.Reviewer)
            .WithMany(x => x.ReviewedSubmissions)
            .HasForeignKey(x => x.ReviewerId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        var submissionFile = modelBuilder.Entity<SubmissionFile>();
        submissionFile.ToTable("SubmissionFiles");
        submissionFile.HasKey(x => x.Id);
        submissionFile.Property(x => x.Kind).HasConversion<string>().HasMaxLength(50).IsRequired();
        submissionFile.Property(x => x.OriginalName).HasMaxLength(255).IsRequired();
        submissionFile.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        submissionFile.Property(x => x.ContentType).HasMaxLength(200).IsRequired();
        submissionFile.HasOne(x => x.Submission)
            .WithMany(x => x.Files)
            .HasForeignKey(x => x.SubmissionId)
            .OnDelete(DeleteBehavior.Cascade);
```

- [ ] **Step 4: Remove the superseded student endpoints**

- Delete `Controllers/StudentTasksController.cs`, `DTOs/Students/MyStudentTaskResponse.cs`, `DTOs/Students/MyStudentTaskDetailsResponse.cs`.
- In `Interfaces/IGroupTaskService.cs`, delete the `GetMyTasksAsync` and `GetMyTaskByIdAsync` members and the `using DiplomaTracker.Api.DTOs.Students;` line if unused.
- In `Services/GroupTaskService.cs`, delete `GetMyTasksAsync`, `GetMyTaskByIdAsync`, `MapMyTask` and `MapMyTaskDetails`; replace every `CurrentMark = null,` with `Mark = null,`.

- [ ] **Step 5: Build and regenerate**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
rm -rf DiplomaTracker.Api/Migrations
dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations
M=$(ls DiplomaTracker.Api/Migrations/*_InitialCreate.cs)
grep -c 'name: "Submissions"\|name: "SubmissionFiles"' "$M"
grep -c 'CurrentMark' "$M"
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
taskkill //F //IM DiplomaTracker.Api.exe 2>/dev/null
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

Expected: builds `0 Error(s)` (a test referencing `CurrentMark` changes only that name to `Mark`); counts `2` or more and `0`; no pending changes; database dropped.

---

### Task 2: File storage

**Files:**
- Create: `backend/DiplomaTracker.Api/Models/StorageSettings.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IFileStorage.cs`
- Create: `backend/DiplomaTracker.Api/Services/LocalFileStorage.cs`
- Modify: `backend/DiplomaTracker.Api/Configuration/StartupValidation.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`
- Modify: `backend/DiplomaTracker.Api/appsettings.json`, `appsettings.Development.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces:
  - `StorageSettings { string RootPath }` bound from `Storage`.
  - `IFileStorage.SaveAsync(Stream content, CancellationToken ct) : Task<string>` (returns key), `OpenReadAsync(string key, CancellationToken ct) : Task<Stream?>`, `DeleteAsync(string key, CancellationToken ct) : Task`.
  - `StartupValidation.ValidateStorageSettings(StorageSettings settings, string contentRootPath) : string` — returns the absolute root and throws when unusable.

- [ ] **Step 1: Create `Models/StorageSettings.cs`**

```csharp
namespace DiplomaTracker.Api.Models;

public class StorageSettings
{
    public string RootPath { get; set; } = string.Empty;
}
```

- [ ] **Step 2: Create `Interfaces/IFileStorage.cs`**

```csharp
namespace DiplomaTracker.Api.Interfaces;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default);
    Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
}
```

- [ ] **Step 3: Create `Services/LocalFileStorage.cs`**

```csharp
using DiplomaTracker.Api.Interfaces;

namespace DiplomaTracker.Api.Services;

public class LocalFileStorage : IFileStorage
{
    private readonly string _rootPath;

    public LocalFileStorage(string rootPath)
    {
        _rootPath = Path.GetFullPath(rootPath);
    }

    public async Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var key = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}";
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await content.CopyToAsync(file, cancellationToken);
        return key;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(key);
        Stream? stream = File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string ResolvePath(string key)
    {
        var path = Path.GetFullPath(Path.Combine(_rootPath, key));
        if (!path.StartsWith(_rootPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Storage key resolves outside the storage root.");
        }

        return path;
    }
}
```

- [ ] **Step 4: Validate the storage root at startup**

Append to `Configuration/StartupValidation.cs` (inside the class):

```csharp
    public static string ValidateStorageSettings(StorageSettings settings, string contentRootPath)
    {
        if (string.IsNullOrWhiteSpace(settings.RootPath))
        {
            throw new InvalidOperationException(
                "Storage:RootPath must be configured. Set Storage__RootPath when hosted.");
        }

        var root = Path.GetFullPath(Path.IsPathRooted(settings.RootPath)
            ? settings.RootPath
            : Path.Combine(contentRootPath, settings.RootPath));

        try
        {
            Directory.CreateDirectory(root);
            var probe = Path.Combine(root, $".write-probe-{Guid.NewGuid():N}");
            File.WriteAllText(probe, string.Empty);
            File.Delete(probe);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException($"Storage:RootPath '{root}' is not writable.", exception);
        }

        return root;
    }
```

- [ ] **Step 5: Configure and register in `Program.cs`**

After the other `Configure<...>` calls add:

```csharp
builder.Services.Configure<StorageSettings>(builder.Configuration.GetSection("Storage"));
```

After `builder.Services.AddScoped<IReservationService, ReservationService>();` add:

```csharp
builder.Services.AddSingleton<IFileStorage>(serviceProvider =>
{
    var settings = serviceProvider.GetRequiredService<IOptions<StorageSettings>>().Value;
    var environment = serviceProvider.GetRequiredService<IWebHostEnvironment>();
    return new LocalFileStorage(StartupValidation.ValidateStorageSettings(settings, environment.ContentRootPath));
});
```

After the existing `StartupValidation.ValidateCorsSettings(...)` line add:

```csharp
_ = app.Services.GetRequiredService<IFileStorage>();
```

- [ ] **Step 6: Settings files and ignore rule**

In `appsettings.json` add a top-level section:

```json
  "Storage": {
    "RootPath": ""
  },
```

In `appsettings.Development.json` add:

```json
  "Storage": {
    "RootPath": "App_Data/uploads"
  },
```

Append to the repository `.gitignore`:

```
App_Data/
```

- [ ] **Step 7: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 3: Access scope and teacher visibility

**Files:**
- Create: `backend/DiplomaTracker.Api/Interfaces/IAccessScope.cs`, `Services/AccessScope.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IGroupService.cs`, `Services/GroupService.cs`, `Controllers/GroupsController.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupTaskService.cs`, `Controllers/GroupTasksController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `UserContext` (phase 4).
- Produces:
  - `IAccessScope.VisibleGroups(UserContext user) : IQueryable<Group>`; `CanSeeGroupAsync(UserContext, Guid groupId) : Task<bool>`; `ReviewableStudents(UserContext) : IQueryable<StudentProfile>`; `CanReviewStudentAsync(UserContext, Guid studentProfileId) : Task<bool>`.
  - `IGroupService.GetGroupsAsync(UserContext)`, `GetGroupByIdAsync(UserContext, Guid)`, `GetGroupStudentsAsync(UserContext, Guid) : Task<(IReadOnlyList<GroupStudentResponse>?, string?)>`, `GetGroupReviewersAsync(UserContext, Guid) : Task<IReadOnlyList<GroupReviewerResponse>?>` (other members unchanged).

- [ ] **Step 1: Create `Interfaces/IAccessScope.cs`**

```csharp
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IAccessScope
{
    IQueryable<Group> VisibleGroups(UserContext user);
    Task<bool> CanSeeGroupAsync(UserContext user, Guid groupId);
    IQueryable<StudentProfile> ReviewableStudents(UserContext user);
    Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId);
}
```

- [ ] **Step 2: Create `Services/AccessScope.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

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
            return _dbContext.Groups.Where(g =>
                g.Reviewers.Any(r => r.ReviewerId == user.UserId)
                || g.Students.Any(s => s.SupervisorId == user.UserId));
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
            return _dbContext.StudentProfiles.Where(s =>
                s.SupervisorId == user.UserId
                || s.Group.Reviewers.Any(r => r.ReviewerId == user.UserId));
        }

        return _dbContext.StudentProfiles.Where(_ => false);
    }

    public Task<bool> CanReviewStudentAsync(UserContext user, Guid studentProfileId)
    {
        return ReviewableStudents(user).AnyAsync(s => s.Id == studentProfileId);
    }
}
```

Register in `Program.cs`: `builder.Services.AddScoped<IAccessScope, AccessScope>();`.

- [ ] **Step 3: Apply visibility in `GroupService`**

Inject `IAccessScope` (constructor parameter `IAccessScope accessScope`, field `_accessScope`). Replace the four read methods:

```csharp
    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync(UserContext user)
    {
        var groups = await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .OrderBy(g => g.Name)
            .ThenBy(g => g.AcademicYear)
            .ToListAsync();

        return groups.Select(MapGroup).ToList();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(UserContext user, Guid id)
    {
        var group = await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .FirstOrDefaultAsync(g => g.Id == id);

        return group is null ? null : MapGroup(group);
    }

    public async Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(UserContext user, Guid groupId)
    {
        if (!await _accessScope.CanSeeGroupAsync(user, groupId))
        {
            return (null, GroupErrors.NotFound);
        }

        var students = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(s => s.User)
            .Include(s => s.Supervisor)
            .Include(s => s.Topic)
            .Where(s => s.GroupId == groupId && s.User.Role == "Student")
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return (students.Select(MapGroupStudent).ToList(), null);
    }

    public async Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(UserContext user, Guid groupId)
    {
        if (!await _accessScope.CanSeeGroupAsync(user, groupId))
        {
            return null;
        }

        var reviewers = await _dbContext.GroupReviewers
            .AsNoTracking()
            .Include(gr => gr.Reviewer)
            .Where(gr => gr.GroupId == groupId)
            .OrderBy(gr => gr.Reviewer.LastName)
            .ThenBy(gr => gr.Reviewer.FirstName)
            .ToListAsync();

        return reviewers.Select(MapReviewer).ToList();
    }
```

Update the four signatures in `IGroupService` accordingly (add `using DiplomaTracker.Api.Services;`).

- [ ] **Step 4: Pass the caller in `GroupsController`**

In `GetAll`, `GetById`, `GetStudents` and `GetReviewers`, obtain `if (!TryGetCurrentUser(out var user)) return ErrorResult(CommonErrors.Forbidden);` and pass `user` as the first argument. `GetById` and `GetReviewers` return `ErrorResult(GroupErrors.NotFound)` when the service returns `null`.

- [ ] **Step 5: Apply visibility to group task reads**

In `GroupTaskService`, inject `IAccessScope` and change:
- `GetGroupTasksAsync(string role, Guid userId)`: replace the teacher block that builds `groupIds` from `GroupReviewers` with
  ```csharp
  var visibleGroupIds = _accessScope.VisibleGroups(new UserContext(userId, role)).Select(g => g.Id);
  query = query.Where(x => visibleGroupIds.Contains(x.GroupId));
  ```
  applied for every non-admin role.
- `GetGroupTaskByIdAsync` and `GetTasksForGroupAsync`: replace the teacher reviewer check with `if (!await _accessScope.CanSeeGroupAsync(new UserContext(userId, role), groupId)) return (null, GroupErrors.NotFound);` (for `GetGroupTaskByIdAsync` return `TaskErrors.GroupTaskNotFound`).
- Create, assign-all and update keep the existing reviewer check.

- [ ] **Step 6: Allow teachers to read groups and progress routes**

`GroupsController` keeps `[Authorize(Roles = "Admin,Teacher")]`; no change is needed for reads. Confirm `GroupTasksController` still compiles against the unchanged service signatures.

- [ ] **Step 7: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `0 Error(s)` (test construction of `GroupService` gains `new AccessScope(context)` if the tests construct it directly; change only that).

---

### Task 4: Workflow errors, upload rules and contracts

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/WorkflowErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`
- Create: `backend/DiplomaTracker.Api/Services/SubmissionFileRules.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Workflow/StudentStepResponse.cs`, `StepDetailsResponse.cs`, `SubmissionResponse.cs`, `ReviewQueueItem.cs`, `GroupProgressResponse.cs`, `StudentProgressResponse.cs`, `ApproveSubmissionRequest.cs`, `ReturnSubmissionRequest.cs`, `StoredFileDownload.cs`

**Interfaces:**
- Produces: codes (Step 1); `SubmissionFileRules.ValidateMainAsync(IFormFile?) : Task<string?>`, `ValidateSupporting(IReadOnlyList<IFormFile>) : string?`, `ContentTypeFor(IFormFile, SubmissionFileKind) : string`, constants `MaxFileBytes = 20 MB`, `MaxRequestBytes = 90 MB`, `MaxSupportingFiles = 3`; DTOs (Step 3).

- [ ] **Step 1: Create `Services/WorkflowErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class WorkflowErrors
{
    public const string StudentTaskNotYours = "studentTask.notYours";
    public const string PreviousNotApproved = "step.previousNotApproved";
    public const string AwaitingReview = "step.awaitingReview";
    public const string AlreadyApproved = "step.alreadyApproved";
    public const string SubmissionNotFound = "submission.notFound";
    public const string SubmissionAlreadyDecided = "submission.alreadyDecided";
    public const string NotReviewer = "submission.notReviewer";
    public const string MainFileMissing = "file.mainMissing";
    public const string FileTypeNotAllowed = "file.typeNotAllowed";
    public const string FileTooLarge = "file.tooLarge";
    public const string TooManyFiles = "file.tooMany";
    public const string FileContentMismatch = "file.contentMismatch";
    public const string FileNotFound = "file.notFound";
    public const string MarkRequired = "review.markRequired";
    public const string MarkOutOfRange = "review.markOutOfRange";
    public const string CommentRequired = "review.commentRequired";

    public static readonly ErrorDefinition[] All =
    [
        new(StudentTaskNotYours, StatusCodes.Status403Forbidden, "This step belongs to another student."),
        new(PreviousNotApproved, StatusCodes.Status409Conflict, "The previous step must be approved first."),
        new(AwaitingReview, StatusCodes.Status409Conflict, "The latest submission is awaiting review."),
        new(AlreadyApproved, StatusCodes.Status409Conflict, "This step is already approved."),
        new(SubmissionNotFound, StatusCodes.Status404NotFound, "Submission not found."),
        new(SubmissionAlreadyDecided, StatusCodes.Status409Conflict, "This submission has already been decided."),
        new(NotReviewer, StatusCodes.Status403Forbidden, "You are not a reviewer of this student."),
        new(MainFileMissing, StatusCodes.Status400BadRequest, "Attach the main document."),
        new(FileTypeNotAllowed, StatusCodes.Status400BadRequest, "This file type is not allowed."),
        new(FileTooLarge, StatusCodes.Status400BadRequest, "A file is larger than 20 MB."),
        new(TooManyFiles, StatusCodes.Status400BadRequest, "Attach at most three supporting files."),
        new(FileContentMismatch, StatusCodes.Status400BadRequest, "The main document's content does not match its extension."),
        new(FileNotFound, StatusCodes.Status404NotFound, "File not found."),
        new(MarkRequired, StatusCodes.Status400BadRequest, "Enter a mark to approve."),
        new(MarkOutOfRange, StatusCodes.Status400BadRequest, "The mark must be a whole number from 0 to 100."),
        new(CommentRequired, StatusCodes.Status400BadRequest, "Enter a comment to return the work.")
    ];
}
```

Add `WorkflowErrors.All,` to `ErrorCatalog`'s `areas` array.

- [ ] **Step 2: Create `Services/SubmissionFileRules.cs`**

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class SubmissionFileRules
{
    public const long MaxFileBytes = 20L * 1024 * 1024;
    public const long MaxRequestBytes = 90L * 1024 * 1024;
    public const int MaxSupportingFiles = 3;

    private static readonly Dictionary<string, string> MainContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf"
    };

    private static readonly HashSet<string> BlockedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".dll", ".msi", ".bat", ".cmd", ".ps1", ".sh", ".js", ".vbs", ".jar", ".com", ".scr"
    };

    private static readonly byte[] ZipSignature = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] PdfSignature = [0x25, 0x50, 0x44, 0x46];

    public static async Task<string?> ValidateMainAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return WorkflowErrors.MainFileMissing;
        }

        var extension = Path.GetExtension(file.FileName);
        if (!MainContentTypes.ContainsKey(extension))
        {
            return WorkflowErrors.FileTypeNotAllowed;
        }

        if (file.Length > MaxFileBytes)
        {
            return WorkflowErrors.FileTooLarge;
        }

        var header = new byte[4];
        await using var stream = file.OpenReadStream();
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false);
        var expected = extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase) ? PdfSignature : ZipSignature;
        return read == header.Length && header.AsSpan().SequenceEqual(expected) ? null : WorkflowErrors.FileContentMismatch;
    }

    public static string? ValidateSupporting(IReadOnlyList<IFormFile> files)
    {
        if (files.Count > MaxSupportingFiles)
        {
            return WorkflowErrors.TooManyFiles;
        }

        foreach (var file in files)
        {
            if (BlockedExtensions.Contains(Path.GetExtension(file.FileName)))
            {
                return WorkflowErrors.FileTypeNotAllowed;
            }

            if (file.Length > MaxFileBytes)
            {
                return WorkflowErrors.FileTooLarge;
            }
        }

        return null;
    }

    public static string ContentTypeFor(IFormFile file, SubmissionFileKind kind)
    {
        return kind == SubmissionFileKind.Main && MainContentTypes.TryGetValue(Path.GetExtension(file.FileName), out var contentType)
            ? contentType
            : "application/octet-stream";
    }

    public static string SafeOriginalName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return name.Length <= 255 ? name : name[^255..];
    }
}
```

- [ ] **Step 3: Create the contracts in `DTOs/Workflow/`**

`StudentStepResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class StudentStepResponse
{
    public Guid Id { get; set; }
    public Guid GroupTaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Order { get; set; }
    public DateTime Deadline { get; set; }
    public string Status { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsLate { get; set; }
    public DateTime? LatestSubmittedAt { get; set; }
    public bool CanSubmit { get; set; }
    public string? BlockReason { get; set; }
}
```

`SubmissionResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class SubmissionFileResponse
{
    public Guid Id { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}

public class SubmissionResponse
{
    public Guid Id { get; set; }
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public string? Decision { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public int? Mark { get; set; }
    public DateTime? DecidedAt { get; set; }
    public IReadOnlyList<SubmissionFileResponse> Files { get; set; } = [];
}
```

`StepDetailsResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class StepDetailsResponse : StudentStepResponse
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public bool CanReview { get; set; }
    public Guid? PendingSubmissionId { get; set; }
    public IReadOnlyList<SubmissionResponse> Timeline { get; set; } = [];
}
```

`ReviewQueueItem.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class ReviewQueueItem
{
    public Guid SubmissionId { get; set; }
    public Guid StudentTaskId { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
}
```

`GroupProgressResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class GroupProgressStep
{
    public Guid GroupTaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public int Order { get; set; }
    public DateTime Deadline { get; set; }
    public int ApprovedCount { get; set; }
}

public class GroupProgressCell
{
    public Guid GroupTaskId { get; set; }
    public Guid StudentTaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public bool IsLate { get; set; }
}

public class GroupProgressStudent
{
    public Guid StudentProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public IReadOnlyList<GroupProgressCell> Cells { get; set; } = [];
}

public class GroupProgressResponse
{
    public Guid GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public IReadOnlyList<GroupProgressStep> Steps { get; set; } = [];
    public IReadOnlyList<GroupProgressStudent> Students { get; set; } = [];
}
```

`StudentProgressResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class StudentProgressResponse
{
    public Guid StudentProfileId { get; set; }
    public int Approved { get; set; }
    public int Total { get; set; }
    public int LateSubmissions { get; set; }
    public double? AverageMark { get; set; }
    public DateTime? NextDeadline { get; set; }
}
```

`ApproveSubmissionRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class ApproveSubmissionRequest
{
    public int? Mark { get; set; }

    [MaxLength(2000)]
    public string? Comment { get; set; }
}
```

`ReturnSubmissionRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class ReturnSubmissionRequest
{
    [MaxLength(2000)]
    public string? Comment { get; set; }
}
```

`StoredFileDownload.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public sealed record StoredFileDownload(Stream Content, string ContentType, string FileName);
```

- [ ] **Step 4: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 5: Student workflow service

**Files:**
- Create: `backend/DiplomaTracker.Api/Interfaces/IStudentWorkflowService.cs`
- Create: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `IAccessScope`, `IFileStorage`, `SubmissionFileRules`, `WorkflowErrors`, `TaskErrors.StudentTaskNotFound`, `TaskErrors.StudentProfileNotFound`, `GroupErrors.NotFound`, `PersonName`.
- Produces:
  - `GetMyStepsAsync(UserContext) : Task<(IReadOnlyList<StudentStepResponse>?, string?)>`
  - `GetStepAsync(UserContext, Guid studentTaskId) : Task<(StepDetailsResponse?, string?)>`
  - `SubmitAsync(UserContext, Guid studentTaskId, IFormFile? mainFile, IReadOnlyList<IFormFile> supportingFiles, string? message, CancellationToken) : Task<(StepDetailsResponse?, string?)>`
  - `ApproveAsync(UserContext, Guid submissionId, ApproveSubmissionRequest) : Task<(StepDetailsResponse?, string?)>`
  - `ReturnAsync(UserContext, Guid submissionId, ReturnSubmissionRequest) : Task<(StepDetailsResponse?, string?)>`
  - `OpenFileAsync(UserContext, Guid fileId, CancellationToken) : Task<(StoredFileDownload?, string?)>`
  - `GetReviewQueueAsync(UserContext, Guid? groupId, bool? late) : Task<IReadOnlyList<ReviewQueueItem>>`
  - `GetGroupProgressAsync(UserContext, Guid groupId) : Task<(GroupProgressResponse?, string?)>`
  - `GetStudentProgressAsync(UserContext, Guid? studentProfileId) : Task<(StudentProgressResponse?, string?)>` — `null` id means the calling student.

- [ ] **Step 1: Create `Interfaces/IStudentWorkflowService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentWorkflowService
{
    Task<(IReadOnlyList<StudentStepResponse>? steps, string? error)> GetMyStepsAsync(UserContext user);
    Task<(StepDetailsResponse? step, string? error)> GetStepAsync(UserContext user, Guid studentTaskId);
    Task<(StepDetailsResponse? step, string? error)> SubmitAsync(UserContext user, Guid studentTaskId, IFormFile? mainFile, IReadOnlyList<IFormFile> supportingFiles, string? message, CancellationToken cancellationToken);
    Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request);
    Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request);
    Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ReviewQueueItem>> GetReviewQueueAsync(UserContext user, Guid? groupId, bool? late);
    Task<(GroupProgressResponse? progress, string? error)> GetGroupProgressAsync(UserContext user, Guid groupId);
    Task<(StudentProgressResponse? progress, string? error)> GetStudentProgressAsync(UserContext user, Guid? studentProfileId);
}
```

- [ ] **Step 2: Create `Services/StudentWorkflowService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class StudentWorkflowService : IStudentWorkflowService
{
    private const int MaxTextLength = 2000;

    private readonly AppDbContext _dbContext;
    private readonly IAccessScope _accessScope;
    private readonly IFileStorage _fileStorage;

    public StudentWorkflowService(AppDbContext dbContext, IAccessScope accessScope, IFileStorage fileStorage)
    {
        _dbContext = dbContext;
        _accessScope = accessScope;
        _fileStorage = fileStorage;
    }

    public async Task<(IReadOnlyList<StudentStepResponse>? steps, string? error)> GetMyStepsAsync(UserContext user)
    {
        var profile = await _dbContext.StudentProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == user.UserId && p.User.IsActive);

        if (profile is null)
        {
            return (null, TaskErrors.StudentProfileNotFound);
        }

        await EnsureStudentTasksAsync(profile.Id, profile.GroupId);
        var tasks = await LoadStudentTasksAsync(profile.Id, profile.GroupId);
        return (BuildSteps(tasks).Select(step => step.Response).ToList(), null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> GetStepAsync(UserContext user, Guid studentTaskId)
    {
        var access = await ResolveStepAccessAsync(user, studentTaskId);
        return access.error is not null ? (null, access.error) : (await BuildDetailsAsync(user, access.task!), null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> SubmitAsync(
        UserContext user,
        Guid studentTaskId,
        IFormFile? mainFile,
        IReadOnlyList<IFormFile> supportingFiles,
        string? message,
        CancellationToken cancellationToken)
    {
        var task = await _dbContext.StudentTasks
            .Include(t => t.StudentProfile)
            .Include(t => t.GroupTask)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId, cancellationToken);

        if (task is null || task.GroupTask.GroupId != task.StudentProfile.GroupId)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (task.StudentProfile.UserId != user.UserId)
        {
            return (null, WorkflowErrors.StudentTaskNotYours);
        }

        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId));
        var step = steps.First(s => s.Task.Id == task.Id);
        if (!step.Response.CanSubmit)
        {
            return (null, step.BlockError);
        }

        if (message is { Length: > MaxTextLength })
        {
            return (null, CommonErrors.ValidationFailed);
        }

        var fileError = await SubmissionFileRules.ValidateMainAsync(mainFile) ?? SubmissionFileRules.ValidateSupporting(supportingFiles);
        if (fileError is not null)
        {
            return (null, fileError);
        }

        var now = DateTime.UtcNow;
        var version = await _dbContext.Submissions.CountAsync(s => s.StudentTaskId == task.Id, cancellationToken) + 1;
        var submission = new Submission
        {
            Id = Guid.NewGuid(),
            StudentTaskId = task.Id,
            Version = version,
            Message = IdentityNormalizer.Optional(message),
            SubmittedAt = now,
            IsLate = now > task.GroupTask.Deadline
        };

        var storedKeys = new List<string>();
        try
        {
            submission.Files.Add(await StoreAsync(mainFile!, SubmissionFileKind.Main, storedKeys, cancellationToken));
            foreach (var file in supportingFiles)
            {
                submission.Files.Add(await StoreAsync(file, SubmissionFileKind.Supporting, storedKeys, cancellationToken));
            }

            task.Status = StudentTaskStatus.Submitted;
            task.UpdatedAt = now;
            _dbContext.Submissions.Add(submission);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            foreach (var key in storedKeys)
            {
                await _fileStorage.DeleteAsync(key, CancellationToken.None);
            }

            if (exception is DbUpdateConcurrencyException
                || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
            {
                _dbContext.ChangeTracker.Clear();
                return (null, WorkflowErrors.AwaitingReview);
            }

            throw;
        }

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    public async Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request)
    {
        if (request.Mark is null)
        {
            return (null, WorkflowErrors.MarkRequired);
        }

        if (request.Mark is < 0 or > 100)
        {
            return (null, WorkflowErrors.MarkOutOfRange);
        }

        return await DecideAsync(user, submissionId, (submission, task, now) =>
        {
            submission.Decision = SubmissionDecision.Approved;
            submission.Mark = request.Mark;
            submission.ReviewerComment = IdentityNormalizer.Optional(request.Comment);
            task.Status = StudentTaskStatus.Approved;
            task.Mark = request.Mark;
            task.CompletedAt = now;
        });
    }

    public async Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request)
    {
        var comment = IdentityNormalizer.Optional(request.Comment);
        if (comment is null)
        {
            return (null, WorkflowErrors.CommentRequired);
        }

        return await DecideAsync(user, submissionId, (submission, task, _) =>
        {
            submission.Decision = SubmissionDecision.Returned;
            submission.ReviewerComment = comment;
            task.Status = StudentTaskStatus.Returned;
        });
    }

    public async Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await _dbContext.SubmissionFiles.AsNoTracking()
            .Where(f => f.Id == fileId)
            .Select(f => new
            {
                f.StorageKey,
                f.ContentType,
                f.OriginalName,
                f.Kind,
                StudentProfileId = f.Submission.StudentTask.StudentProfileId,
                StudentUserId = f.Submission.StudentTask.StudentProfile.UserId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (file is null)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var allowed = file.StudentUserId == user.UserId || await _accessScope.CanReviewStudentAsync(user, file.StudentProfileId);
        if (!allowed)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var stream = await _fileStorage.OpenReadAsync(file.StorageKey, cancellationToken);
        if (stream is null)
        {
            return (null, WorkflowErrors.FileNotFound);
        }

        var contentType = file.Kind == SubmissionFileKind.Main ? file.ContentType : "application/octet-stream";
        return (new StoredFileDownload(stream, contentType, file.OriginalName), null);
    }

    public async Task<IReadOnlyList<ReviewQueueItem>> GetReviewQueueAsync(UserContext user, Guid? groupId, bool? late)
    {
        var reviewable = _accessScope.ReviewableStudents(user).Select(s => s.Id);

        var query = _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null
                && s.StudentTask.Status == StudentTaskStatus.Submitted
                && reviewable.Contains(s.StudentTask.StudentProfileId));

        if (groupId is not null)
        {
            query = query.Where(s => s.StudentTask.StudentProfile.GroupId == groupId);
        }

        if (late is not null)
        {
            query = query.Where(s => s.IsLate == late);
        }

        var rows = await query
            .OrderBy(s => s.SubmittedAt)
            .Select(s => new
            {
                s.Id,
                s.StudentTaskId,
                s.StudentTask.StudentProfileId,
                s.StudentTask.StudentProfile.User.LastName,
                s.StudentTask.StudentProfile.User.FirstName,
                s.StudentTask.StudentProfile.User.Patronymic,
                s.StudentTask.StudentProfile.GroupId,
                GroupName = s.StudentTask.StudentProfile.Group.Name,
                StepTitle = s.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = s.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                s.Version,
                s.SubmittedAt,
                s.IsLate
            })
            .ToListAsync();

        return rows.Select(row => new ReviewQueueItem
        {
            SubmissionId = row.Id,
            StudentTaskId = row.StudentTaskId,
            StudentProfileId = row.StudentProfileId,
            StudentName = JoinName(row.LastName, row.FirstName, row.Patronymic),
            GroupId = row.GroupId,
            GroupName = row.GroupName,
            StepTitle = row.StepTitle,
            StepOrder = row.StepOrder,
            Version = row.Version,
            SubmittedAt = row.SubmittedAt,
            IsLate = row.IsLate
        }).ToList();
    }

    public async Task<(GroupProgressResponse? progress, string? error)> GetGroupProgressAsync(UserContext user, Guid groupId)
    {
        var group = await _accessScope.VisibleGroups(user).AsNoTracking().FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, GroupErrors.NotFound);
        }

        var students = await _dbContext.StudentProfiles.AsNoTracking()
            .Include(p => p.User)
            .Where(p => p.GroupId == groupId && p.User.IsActive && p.User.Role == "Student")
            .OrderBy(p => p.User.LastName)
            .ThenBy(p => p.User.FirstName)
            .ToListAsync();

        foreach (var student in students)
        {
            await EnsureStudentTasksAsync(student.Id, groupId);
        }

        var groupTasks = await _dbContext.GroupTasks.AsNoTracking()
            .Include(gt => gt.DiplomaTaskTemplate)
            .Where(gt => gt.GroupId == groupId)
            .OrderBy(gt => gt.DiplomaTaskTemplate.Order)
            .ThenBy(gt => gt.DiplomaTaskTemplate.Title)
            .ToListAsync();

        var studentIds = students.Select(s => s.Id).ToList();
        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => studentIds.Contains(t.StudentProfileId) && t.GroupTask.GroupId == groupId)
            .Select(t => new
            {
                t.Id,
                t.StudentProfileId,
                t.GroupTaskId,
                t.Status,
                t.Mark,
                LatestLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();

        var byStudent = tasks.ToLookup(t => t.StudentProfileId);

        return (new GroupProgressResponse
        {
            GroupId = group.Id,
            GroupName = group.Name,
            Steps = groupTasks.Select(gt => new GroupProgressStep
            {
                GroupTaskId = gt.Id,
                Title = gt.DiplomaTaskTemplate.Title,
                Order = gt.DiplomaTaskTemplate.Order,
                Deadline = gt.Deadline,
                ApprovedCount = tasks.Count(t => t.GroupTaskId == gt.Id && t.Status == StudentTaskStatus.Approved)
            }).ToList(),
            Students = students.Select(student => new GroupProgressStudent
            {
                StudentProfileId = student.Id,
                Name = PersonName.Full(student.User),
                Cells = groupTasks
                    .Select(gt => byStudent[student.Id].FirstOrDefault(t => t.GroupTaskId == gt.Id))
                    .Where(t => t is not null)
                    .Select(t => new GroupProgressCell
                    {
                        GroupTaskId = t!.GroupTaskId,
                        StudentTaskId = t.Id,
                        Status = t.Status.ToString(),
                        Mark = t.Mark,
                        IsLate = t.LatestLate ?? false
                    }).ToList()
            }).ToList()
        }, null);
    }

    public async Task<(StudentProgressResponse? progress, string? error)> GetStudentProgressAsync(UserContext user, Guid? studentProfileId)
    {
        StudentProfile? profile;
        if (studentProfileId is null)
        {
            profile = await _dbContext.StudentProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == user.UserId);
            if (profile is null)
            {
                return (null, TaskErrors.StudentProfileNotFound);
            }
        }
        else
        {
            profile = await _accessScope.ReviewableStudents(user).AsNoTracking().FirstOrDefaultAsync(p => p.Id == studentProfileId);
            if (profile is null)
            {
                return (null, OnboardingErrors.StudentNotFound);
            }
        }

        await EnsureStudentTasksAsync(profile.Id, profile.GroupId);

        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.StudentProfileId == profile.Id && t.GroupTask.GroupId == profile.GroupId)
            .Select(t => new { t.Status, t.Mark, t.GroupTask.Deadline })
            .ToListAsync();

        var lateSubmissions = await _dbContext.Submissions.AsNoTracking()
            .CountAsync(s => s.StudentTask.StudentProfileId == profile.Id && s.StudentTask.GroupTask.GroupId == profile.GroupId && s.IsLate);

        var marks = tasks.Where(t => t.Mark is not null).Select(t => (double)t.Mark!.Value).ToList();
        var now = DateTime.UtcNow;

        return (new StudentProgressResponse
        {
            StudentProfileId = profile.Id,
            Approved = tasks.Count(t => t.Status == StudentTaskStatus.Approved),
            Total = tasks.Count,
            LateSubmissions = lateSubmissions,
            AverageMark = marks.Count == 0 ? null : Math.Round(marks.Average(), 1),
            NextDeadline = tasks
                .Where(t => t.Status != StudentTaskStatus.Approved && t.Deadline >= now)
                .Select(t => (DateTime?)t.Deadline)
                .OrderBy(d => d)
                .FirstOrDefault()
        }, null);
    }

    private async Task<(StepDetailsResponse? step, string? error)> DecideAsync(
        UserContext user,
        Guid submissionId,
        Action<Submission, StudentTask, DateTime> apply)
    {
        var submission = await _dbContext.Submissions
            .Include(s => s.StudentTask)
            .FirstOrDefaultAsync(s => s.Id == submissionId);

        if (submission is null)
        {
            return (null, WorkflowErrors.SubmissionNotFound);
        }

        if (!await _accessScope.CanReviewStudentAsync(user, submission.StudentTask.StudentProfileId))
        {
            return (null, WorkflowErrors.NotReviewer);
        }

        var latestVersion = await _dbContext.Submissions
            .Where(s => s.StudentTaskId == submission.StudentTaskId)
            .MaxAsync(s => s.Version);

        if (submission.Decision is not null
            || submission.Version != latestVersion
            || submission.StudentTask.Status != StudentTaskStatus.Submitted)
        {
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        var now = DateTime.UtcNow;
        apply(submission, submission.StudentTask, now);
        submission.ReviewerId = user.UserId;
        submission.DecidedAt = now;
        submission.StudentTask.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, submission.StudentTaskId);
    }

    private async Task<(StudentTask? task, string? error)> ResolveStepAccessAsync(UserContext user, Guid studentTaskId)
    {
        var task = await _dbContext.StudentTasks.AsNoTracking()
            .Include(t => t.StudentProfile).ThenInclude(p => p.User)
            .Include(t => t.StudentProfile).ThenInclude(p => p.Group)
            .Include(t => t.GroupTask).ThenInclude(gt => gt.DiplomaTaskTemplate)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId);

        if (task is null || task.GroupTask.GroupId != task.StudentProfile.GroupId)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (user.IsStudent)
        {
            return task.StudentProfile.UserId == user.UserId ? (task, null) : (null, WorkflowErrors.StudentTaskNotYours);
        }

        return await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId)
            ? (task, null)
            : (null, TaskErrors.StudentTaskNotFound);
    }

    private async Task<StepDetailsResponse> BuildDetailsAsync(UserContext user, StudentTask task)
    {
        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId));
        var step = steps.First(s => s.Task.Id == task.Id).Response;

        var timeline = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.StudentTaskId == task.Id)
            .OrderBy(s => s.Version)
            .Select(s => new
            {
                s.Id,
                s.Version,
                s.Message,
                s.SubmittedAt,
                s.IsLate,
                s.Decision,
                ReviewerLastName = s.Reviewer != null ? s.Reviewer.LastName : null,
                ReviewerFirstName = s.Reviewer != null ? s.Reviewer.FirstName : null,
                ReviewerPatronymic = s.Reviewer != null ? s.Reviewer.Patronymic : null,
                s.ReviewerComment,
                s.Mark,
                s.DecidedAt,
                Files = s.Files.OrderBy(f => f.Kind).ThenBy(f => f.OriginalName)
                    .Select(f => new { f.Id, f.Kind, f.OriginalName, f.SizeBytes })
                    .ToList()
            })
            .ToListAsync();

        var pending = timeline.LastOrDefault(s => s.Decision is null);
        var canReview = !user.IsStudent && task.Status == StudentTaskStatus.Submitted && pending is not null;

        return new StepDetailsResponse
        {
            Id = step.Id,
            GroupTaskId = step.GroupTaskId,
            Title = step.Title,
            Description = step.Description,
            Order = step.Order,
            Deadline = step.Deadline,
            Status = step.Status,
            Mark = step.Mark,
            CompletedAt = step.CompletedAt,
            IsLate = step.IsLate,
            LatestSubmittedAt = step.LatestSubmittedAt,
            CanSubmit = user.IsStudent && step.CanSubmit,
            BlockReason = step.BlockReason,
            StudentProfileId = task.StudentProfileId,
            StudentName = PersonName.Full(task.StudentProfile.User),
            GroupName = task.StudentProfile.Group.Name,
            CanReview = canReview,
            PendingSubmissionId = canReview ? pending!.Id : null,
            Timeline = timeline.Select(s => new SubmissionResponse
            {
                Id = s.Id,
                Version = s.Version,
                Message = s.Message,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate,
                Decision = s.Decision?.ToString(),
                ReviewerName = s.ReviewerLastName is null ? null : JoinName(s.ReviewerLastName, s.ReviewerFirstName, s.ReviewerPatronymic),
                ReviewerComment = s.ReviewerComment,
                Mark = s.Mark,
                DecidedAt = s.DecidedAt,
                Files = s.Files.Select(f => new SubmissionFileResponse
                {
                    Id = f.Id,
                    Kind = f.Kind.ToString(),
                    OriginalName = f.OriginalName,
                    SizeBytes = f.SizeBytes
                }).ToList()
            }).ToList()
        };
    }

    private async Task EnsureStudentTasksAsync(Guid studentProfileId, Guid groupId)
    {
        var missing = await _dbContext.GroupTasks.AsNoTracking()
            .Where(gt => gt.GroupId == groupId
                && !_dbContext.StudentTasks.Any(st => st.GroupTaskId == gt.Id && st.StudentProfileId == studentProfileId))
            .Select(gt => gt.Id)
            .ToListAsync();

        if (missing.Count == 0)
        {
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var groupTaskId in missing)
        {
            _dbContext.StudentTasks.Add(new StudentTask
            {
                Id = Guid.NewGuid(),
                StudentProfileId = studentProfileId,
                GroupTaskId = groupTaskId,
                Status = StudentTaskStatus.Pending,
                CreatedAt = now
            });
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            // Another request created the same rows first; the rows now exist either way.
        }
        finally
        {
            _dbContext.ChangeTracker.Clear();
        }
    }

    private async Task<List<StepRow>> LoadStudentTasksAsync(Guid studentProfileId, Guid groupId)
    {
        return await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.StudentProfileId == studentProfileId && t.GroupTask.GroupId == groupId)
            .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
            .ThenBy(t => t.GroupTask.DiplomaTaskTemplate.Title)
            .Select(t => new StepRow
            {
                Id = t.Id,
                GroupTaskId = t.GroupTaskId,
                Title = t.GroupTask.DiplomaTaskTemplate.Title,
                Description = t.GroupTask.DiplomaTaskTemplate.Description,
                Order = t.GroupTask.DiplomaTaskTemplate.Order,
                Deadline = t.GroupTask.Deadline,
                Status = t.Status,
                Mark = t.Mark,
                CompletedAt = t.CompletedAt,
                LatestSubmittedAt = t.Submissions.OrderByDescending(s => s.Version).Select(s => (DateTime?)s.SubmittedAt).FirstOrDefault(),
                LatestIsLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();
    }

    private static List<BuiltStep> BuildSteps(IReadOnlyList<StepRow> rows)
    {
        var result = new List<BuiltStep>(rows.Count);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var previousApproved = index == 0 || rows[index - 1].Status == StudentTaskStatus.Approved;

            string? blockError = row.Status switch
            {
                StudentTaskStatus.Approved => WorkflowErrors.AlreadyApproved,
                StudentTaskStatus.Submitted => WorkflowErrors.AwaitingReview,
                _ when !previousApproved => WorkflowErrors.PreviousNotApproved,
                _ => null
            };

            result.Add(new BuiltStep(row, blockError, new StudentStepResponse
            {
                Id = row.Id,
                GroupTaskId = row.GroupTaskId,
                Title = row.Title,
                Description = row.Description,
                Order = row.Order,
                Deadline = row.Deadline,
                Status = row.Status.ToString(),
                Mark = row.Mark,
                CompletedAt = row.CompletedAt,
                IsLate = row.LatestIsLate ?? false,
                LatestSubmittedAt = row.LatestSubmittedAt,
                CanSubmit = blockError is null,
                BlockReason = blockError
            }));
        }

        return result;
    }

    private async Task<SubmissionFile> StoreAsync(IFormFile file, SubmissionFileKind kind, List<string> storedKeys, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var key = await _fileStorage.SaveAsync(stream, cancellationToken);
        storedKeys.Add(key);

        return new SubmissionFile
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            OriginalName = SubmissionFileRules.SafeOriginalName(file.FileName),
            StorageKey = key,
            ContentType = SubmissionFileRules.ContentTypeFor(file, kind),
            SizeBytes = file.Length
        };
    }

    private static string JoinName(params string?[] parts) =>
        string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));

    private sealed record BuiltStep(StepRow Task, string? BlockError, StudentStepResponse Response);

    private sealed class StepRow
    {
        public Guid Id { get; init; }
        public Guid GroupTaskId { get; init; }
        public string Title { get; init; } = string.Empty;
        public string? Description { get; init; }
        public int Order { get; init; }
        public DateTime Deadline { get; init; }
        public StudentTaskStatus Status { get; init; }
        public int? Mark { get; init; }
        public DateTime? CompletedAt { get; init; }
        public DateTime? LatestSubmittedAt { get; init; }
        public bool? LatestIsLate { get; init; }
    }
}
```

`SubmitAsync` loads `task` with tracking (for the status change and its row version) and computes `CanSubmit` from untracked rows; the row version turns a concurrent second submission into `step.awaitingReview`.

- [ ] **Step 3: Register and build**

`Program.cs`: `builder.Services.AddScoped<IStudentWorkflowService, StudentWorkflowService>();`

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 6: Workflow endpoints

**Files:**
- Create: `backend/DiplomaTracker.Api/Controllers/StudentTasksController.cs`, `SubmissionsController.cs`, `ReviewController.cs`, `ProgressController.cs`

**Interfaces:**
- Produces the HTTP surface of spec §7 plus `GET /api/students/me/progress`.

- [ ] **Step 1: Create `Controllers/StudentTasksController.cs`**

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/student-tasks")]
[Authorize]
public class StudentTasksController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public StudentTasksController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (steps, error) = await _workflow.GetMyStepsAsync(user);
        return steps is null ? ErrorResult(error) : Ok(steps);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.GetStepAsync(user, id);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/submissions")]
    [RequestSizeLimit(SubmissionFileRules.MaxRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = SubmissionFileRules.MaxRequestBytes)]
    public async Task<IActionResult> Submit(
        Guid id,
        [FromForm] IFormFile? mainFile,
        [FromForm] List<IFormFile>? supportingFiles,
        [FromForm] string? message,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.SubmitAsync(user, id, mainFile, supportingFiles ?? [], message, cancellationToken);
        return step is null ? ErrorResult(error) : Ok(step);
    }
}
```

- [ ] **Step 2: Create `Controllers/SubmissionsController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Workflow;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api")]
[Authorize]
public class SubmissionsController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public SubmissionsController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("submissions/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveSubmissionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.ApproveAsync(user, id, request);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("submissions/{id:guid}/return")]
    public async Task<IActionResult> Return(Guid id, [FromBody] ReturnSubmissionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.ReturnAsync(user, id, request);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [HttpGet("submission-files/{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _workflow.OpenFileAsync(user, id, cancellationToken);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }
}
```

- [ ] **Step 3: Create `Controllers/ReviewController.cs`**

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/review")]
[Authorize(Roles = "Admin,Teacher")]
public class ReviewController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public ReviewController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] Guid? groupId, [FromQuery] bool? late)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _workflow.GetReviewQueueAsync(user, groupId, late));
    }
}
```

- [ ] **Step 4: Create `Controllers/ProgressController.cs`**

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api")]
[Authorize]
public class ProgressController : ApiControllerBase
{
    private readonly IStudentWorkflowService _workflow;

    public ProgressController(IStudentWorkflowService workflow)
    {
        _workflow = workflow;
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("groups/{groupId:guid}/progress")]
    public async Task<IActionResult> Group(Guid groupId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetGroupProgressAsync(user, groupId);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }

    [Authorize(Roles = "Student")]
    [HttpGet("students/me/progress")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetStudentProgressAsync(user, null);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("students/{studentProfileId:guid}/progress")]
    public async Task<IActionResult> Student(Guid studentProfileId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (progress, error) = await _workflow.GetStudentProgressAsync(user, studentProfileId);
        return progress is null ? ErrorResult(error) : Ok(progress);
    }
}
```

`StudentsController` is `[Authorize(Roles = "Admin")]` at class level on route `api/students`; `ProgressController` defines its own attributes on `api/students/me/progress` and `api/students/{id}/progress`, which do not collide with `StudentsController` routes.

- [ ] **Step 5: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `0 Error(s)` twice; no pending changes.

---

### Task 7: Backend endpoint verification

**Files:**
- Create: `.superpowers/checks/workflow-check.mjs` (git-ignored)

- [ ] **Step 1: Start the API** (background): `dotnet run --project backend/DiplomaTracker.Api --launch-profile http`; wait for `/api/registration`.

- [ ] **Step 2: Create `.superpowers/checks/workflow-check.mjs`**

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

const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token

const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00])
const pdf = new TextEncoder().encode('%PDF-1.4\n%fake\n')
const fakeDocx = new TextEncoder().encode('not a zip file')
const big = new Uint8Array(21 * 1024 * 1024)
big.set(docx)

function form({ main, mainName = 'work.docx', supporting = [], message } = {}) {
  const data = new FormData()
  if (main) data.append('mainFile', new Blob([main]), mainName)
  supporting.forEach(([bytes, name]) => data.append('supportingFiles', new Blob([bytes]), name))
  if (message) data.append('message', message)
  return data
}

const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')

// Arrange: group with two steps, a student, the seed teacher as reviewer, a second teacher unrelated
const department = (await call('GET', '/api/departments', { token: admin })).body[0]
const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, name: `Workflow ${stamp}`, academicYear: '2026/2027', description: '' } })).body
const teachers = (await call('GET', '/api/teachers', { token: admin })).body
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id
await call('POST', `/api/groups/${group.id}/reviewers`, { token: admin, json: { reviewerId: teacherId } })
const otherTeacherEmail = `other.${stamp}@diploma.local`
await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Other', lastName: 'Teacher', email: otherTeacherEmail, password: 'Teacher456!' } })
const otherTeacher = await login(otherTeacherEmail, 'Teacher456!')

const templates = (await call('GET', '/api/task-templates', { token: admin })).body.filter((t) => t.isActive).sort((a, b) => a.order - b.order)
const past = '2000-01-01T00:00:00Z'
const future = '2099-01-01T00:00:00Z'
await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: past }, { taskTemplateId: templates[1].id, deadline: future }] } })

const studentEmail = `flow.${stamp}@student.local`
const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Flow', lastName: 'Student', email: studentEmail, studentNumber: `F${stamp}`, password: 'Password1!', groupId: group.id } })).body
const studentToken = await login(studentEmail, 'Password1!')

// Steps created on demand for a student added after assignment
const steps = (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body
check('01 steps created on demand', steps.length, 2)
check('02 first step can submit', steps[0].canSubmit, true)
check('03 second step blocked', steps[1].blockReason, 'step.previousNotApproved')
check('04 submit second step refused', (await call('POST', `/api/student-tasks/${steps[1].id}/submissions`, { token: studentToken, form: form({ main: docx }) })).body.code, 'step.previousNotApproved')

// File rules
check('05 main missing', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({}) })).body.code, 'file.mainMissing')
check('06 wrong main type', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, mainName: 'work.txt' }) })).body.code, 'file.typeNotAllowed')
check('07 content mismatch', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: fakeDocx }) })).body.code, 'file.contentMismatch')
check('08 blocked supporting type', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'tool.exe']] }) })).body.code, 'file.typeNotAllowed')
check('09 too many supporting', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[docx, 'a.zip'], [docx, 'b.zip'], [docx, 'c.zip'], [docx, 'd.zip']] }) })).body.code, 'file.tooMany')
check('10 file too large', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: big }) })).body.code, 'file.tooLarge')

// Submit → return → resubmit → approve
const first = await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx, supporting: [[pdf, 'slides.pdf']], message: 'First version' }) })
check('11 submit', first.status, 200)
check('12 late flag', first.body.timeline[0].isLate, true)
check('13 awaiting review blocks resubmit', (await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: docx }) })).body.code, 'step.awaitingReview')

const queue = (await call('GET', '/api/review/queue', { token: teacher })).body
const queued = queue.find((item) => item.studentTaskId === steps[0].id)
check('14 queue contains submission', Boolean(queued), true)
check('15 unrelated teacher queue empty for it', (await call('GET', '/api/review/queue', { token: otherTeacher })).body.some((item) => item.studentTaskId === steps[0].id), false)
check('16 unrelated teacher cannot decide', (await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: otherTeacher, json: { comment: 'x' } })).body.code, 'submission.notReviewer')
check('17 return requires comment', (await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: teacher, json: {} })).body.code, 'review.commentRequired')
const returned = await call('POST', `/api/submissions/${queued.submissionId}/return`, { token: teacher, json: { comment: 'Add references' } })
check('18 returned', returned.body.status, 'Returned')
check('19 decided twice refused', (await call('POST', `/api/submissions/${queued.submissionId}/approve`, { token: teacher, json: { mark: 90 } })).body.code, 'submission.alreadyDecided')

const second = await call('POST', `/api/student-tasks/${steps[0].id}/submissions`, { token: studentToken, form: form({ main: pdf, mainName: 'work.pdf', message: 'Fixed' }) })
check('20 resubmit version 2', second.body.timeline.at(-1).version, 2)
const secondId = second.body.timeline.at(-1).id
check('21 approve requires mark', (await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: {} })).body.code, 'review.markRequired')
check('22 mark out of range', (await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: { mark: 101 } })).body.code, 'review.markOutOfRange')
const approved = await call('POST', `/api/submissions/${secondId}/approve`, { token: teacher, json: { mark: 88, comment: 'Good' } })
check('23 approved with mark', approved.body.mark, 88)
check('24 next step unlocked', (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body[1].canSubmit, true)

// Downloads
const fileId = first.body.timeline[0].files.find((f) => f.kind === 'Supporting').id
const download = await call('GET', `/api/submission-files/${fileId}`, { token: teacher })
check('25 reviewer downloads', download.status, 200)
check('26 attachment disposition', (download.headers.get('content-disposition') ?? '').startsWith('attachment'), true)
check('27 supporting served as octet-stream', download.headers.get('content-type'), 'application/octet-stream')
check('28 nosniff header', download.headers.get('x-content-type-options'), 'nosniff')
check('29 unrelated teacher cannot download', (await call('GET', `/api/submission-files/${fileId}`, { token: otherTeacher })).status, 404)
check('30 student downloads own file', (await call('GET', `/api/submission-files/${fileId}`, { token: studentToken })).status, 200)

// Visibility and progress
check('31 unrelated teacher cannot see group', (await call('GET', `/api/groups/${group.id}`, { token: otherTeacher })).body.code, 'group.notFound')
check('32 reviewer sees group', (await call('GET', `/api/groups/${group.id}`, { token: teacher })).status, 200)
const progress = (await call('GET', `/api/groups/${group.id}/progress`, { token: teacher })).body
check('33 progress approved count', progress.steps[0].approvedCount, 1)
check('34 progress cell status', progress.students[0].cells[0].status, 'Approved')
check('35 unrelated teacher progress', (await call('GET', `/api/groups/${group.id}/progress`, { token: otherTeacher })).body.code, 'group.notFound')
const mine = (await call('GET', '/api/students/me/progress', { token: studentToken })).body
check('36 student progress approved', `${mine.approved}/${mine.total}`, '1/2')
check('37 student progress late count', mine.lateSubmissions, 2)
check('38 student progress for reviewer', (await call('GET', `/api/students/${student.id}/progress`, { token: teacher })).body.averageMark, 88)
check('39 other student cannot open step', (await call('GET', `/api/student-tasks/${steps[0].id}`, { token: await login('student@diploma.local', 'Student123!') })).body.code, 'studentTask.notYours')

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 3: Run and stop the API**

```bash
node .superpowers/checks/workflow-check.mjs
taskkill //F //IM DiplomaTracker.Api.exe
netstat -ano | grep ":5000 .*LISTEN" || echo "port 5000 free"
```

Expected: `39/39 checks passed`; `port 5000 free`.

---

### Task 8: Client contracts and API modules

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`, `src/api/groupTasksApi.ts`
- Create: `frontend/diploma-tracker-web/src/api/workflowApi.ts`
- Modify: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`

**Interfaces:**
- Produces: types `StudentTaskStatus`, `StudentStep`, `SubmissionFileInfo`, `Submission`, `StepDetails`, `ReviewQueueItem`, `GroupProgress`, `StudentProgress`; functions `getMySteps`, `getStep`, `submitWork`, `approveSubmission`, `returnSubmission`, `downloadSubmissionFile`, `getReviewQueue`, `getGroupProgress`, `getMyProgress`, `getStudentProgress`.

- [ ] **Step 1: Update `types.ts` and `groupTasksApi.ts`**

Delete the `MyStudentTask`, `StudentTaskSubmissionHistoryItem`, `StudentTaskReviewHistoryItem` and `MyStudentTaskDetails` types. In `groupTasksApi.ts` delete `getMyStudentTasks` and `getMyStudentTaskDetails` and their type imports.

Append to `types.ts`:

```typescript
export type StudentTaskStatus = 'Pending' | 'Submitted' | 'Approved' | 'Returned'

export type StudentStep = {
  id: string
  groupTaskId: string
  title: string
  description: string | null
  order: number
  deadline: string
  status: StudentTaskStatus
  mark: number | null
  completedAt: string | null
  isLate: boolean
  latestSubmittedAt: string | null
  canSubmit: boolean
  blockReason: string | null
}

export type SubmissionFileInfo = {
  id: string
  kind: 'Main' | 'Supporting'
  originalName: string
  sizeBytes: number
}

export type Submission = {
  id: string
  version: number
  message: string | null
  submittedAt: string
  isLate: boolean
  decision: 'Approved' | 'Returned' | null
  reviewerName: string | null
  reviewerComment: string | null
  mark: number | null
  decidedAt: string | null
  files: SubmissionFileInfo[]
}

export type StepDetails = StudentStep & {
  studentProfileId: string
  studentName: string
  groupName: string
  canReview: boolean
  pendingSubmissionId: string | null
  timeline: Submission[]
}

export type ReviewQueueItem = {
  submissionId: string
  studentTaskId: string
  studentProfileId: string
  studentName: string
  groupId: string
  groupName: string
  stepTitle: string
  stepOrder: number
  version: number
  submittedAt: string
  isLate: boolean
}

export type GroupProgress = {
  groupId: string
  groupName: string
  steps: { groupTaskId: string; title: string; order: number; deadline: string; approvedCount: number }[]
  students: {
    studentProfileId: string
    name: string
    cells: { groupTaskId: string; studentTaskId: string; status: StudentTaskStatus; mark: number | null; isLate: boolean }[]
  }[]
}

export type StudentProgress = {
  studentProfileId: string
  approved: number
  total: number
  lateSubmissions: number
  averageMark: number | null
  nextDeadline: string | null
}
```

- [ ] **Step 2: Create `src/api/workflowApi.ts`**

```typescript
import { apiDownload, apiRequest } from './apiClient'
import type { GroupProgress, ReviewQueueItem, StepDetails, StudentProgress, StudentStep } from './types'

export function getMySteps(): Promise<StudentStep[]> {
  return apiRequest<StudentStep[]>('/api/student-tasks/mine')
}

export function getStep(id: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${id}`)
}

export function submitWork(id: string, mainFile: File, supportingFiles: File[], message: string): Promise<StepDetails> {
  const form = new FormData()
  form.append('mainFile', mainFile)
  supportingFiles.forEach((file) => form.append('supportingFiles', file))
  if (message.trim()) form.append('message', message.trim())
  return apiRequest<StepDetails>(`/api/student-tasks/${id}/submissions`, { method: 'POST', body: form })
}

export function approveSubmission(id: string, mark: number, comment?: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/approve`, { method: 'POST', body: JSON.stringify({ mark, comment }) })
}

export function returnSubmission(id: string, comment: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/return`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function downloadSubmissionFile(fileId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/submission-files/${fileId}`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName ?? fallbackName
  link.click()
  URL.revokeObjectURL(url)
}

export function getReviewQueue(groupId?: string, late?: boolean): Promise<ReviewQueueItem[]> {
  const params = new URLSearchParams()
  if (groupId) params.set('groupId', groupId)
  if (late !== undefined) params.set('late', String(late))
  const query = params.toString()
  return apiRequest<ReviewQueueItem[]>(`/api/review/queue${query ? `?${query}` : ''}`)
}

export function getGroupProgress(groupId: string): Promise<GroupProgress> {
  return apiRequest<GroupProgress>(`/api/groups/${groupId}/progress`)
}

export function getMyProgress(): Promise<StudentProgress> {
  return apiRequest<StudentProgress>('/api/students/me/progress')
}

export function getStudentProgress(studentProfileId: string): Promise<StudentProgress> {
  return apiRequest<StudentProgress>(`/api/students/${studentProfileId}/progress`)
}
```

- [ ] **Step 3: Extend navigation**

In `navigation.ts`: Admin — insert `{ to: '/review', labelKey: 'nav.review' }` after `nav.groups`. Teacher — becomes `[dashboard, { to: '/review', labelKey: 'nav.review' }, { to: '/teacher/groups', labelKey: 'nav.groups' }, myTopics, taskTemplates]`. Student labels stay; change `nav.myTasks` text to "Моя робота" / "My work".

Add `"review": "Рецензування"` / `"review": "Review"` to `nav` in both files.

---

### Task 9: Workflow pages

Shared page rules from the design system plan apply.

**Files:**
- Create: `src/components/workflow/stepTones.ts`, `StepStatusBadge.tsx`, `StepTimeline.tsx`, `SubmitWorkForm.tsx`, `DecisionPanel.tsx`, `StepDetails.tsx`, `GroupProgressMatrix.tsx`, `ProgressSummary.tsx`, `formatBytes.ts`
- Replace: `src/pages/StudentMyTasksPage.tsx`, `src/pages/StudentTaskDetailsPage.tsx`
- Create: `src/pages/ReviewQueuePage.tsx`, `src/pages/ReviewStepPage.tsx`, `src/pages/TeacherGroupsPage.tsx`, `src/pages/GroupProgressPage.tsx`
- Modify: `src/pages/StudentDashboardPage.tsx`, `TeacherDashboardPage.tsx`, `GroupDetailsPage.tsx`, `src/App.tsx`, `src/components/ui/statusTones.ts`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Specifics:**
- `stepTones.ts`: `stepStatusTone: Record<StudentTaskStatus, BadgeTone>` = `{ Pending: 'neutral', Submitted: 'info', Returned: 'warning', Approved: 'success' }`. Remove the `displayStatusTone` map from `statusTones.ts` (delete the file if nothing else uses it).
- `StepStatusBadge({ status, isLate })`: `Badge` with `steps.status.<status>`; when `isLate`, a second `Badge` tone `warning` `steps.late`.
- `formatBytes(bytes)`: `B`, `KB`, `MB` with one decimal.
- `StepTimeline({ timeline })`: vertical list; each submission is a `Card`-like block (`rounded-card bg-surface p-4`) with header `steps.version` (`{{version}}`), submitted date, late badge; message (`whitespace-pre-line`); file list — each file a ghost `Button` with `FileText` (main) or `Paperclip` (supporting) calling `downloadSubmissionFile` and showing `formatBytes`; then, when decided, an indented decision block (`border-l-2 pl-4`, border `border-success` for approved, `border-warning` for returned) with reviewer name, decided date, `steps.decision.<Approved|Returned>`, mark (`steps.markValue`) and comment. Empty timeline → `EmptyState` `steps.noSubmissions`.
- `SubmitWorkForm({ step, onSubmitted })`: shown only when `step.canSubmit`; `FileInput` main (`accept=".docx,.pdf,.pptx"`, hint `steps.mainHint`), `FileInput` supporting (`multiple`, hint `steps.supportingHint`), `Textarea` message (`maxLength` 2000); client checks (main present, extension, ≤ 20 MB, ≤ 3 supporting, ≤ 20 MB each, blocked extensions) show inline errors with the same `errors.file.*` keys; submit `Button` `steps.submit` with loading; on success `toast.success(t('steps.submitted'))` and `onSubmitted(details)`.
- `DecisionPanel({ step, onDecided })`: shown when `step.canReview`; `Card` `steps.reviewTitle` with `TextField type="number" min=0 max=100 step=1` mark, `Textarea` comment, buttons `steps.approve` (primary; requires mark 0–100 inline error `errors.review.markRequired`/`markOutOfRange`) and `steps.return` (secondary; requires comment inline error `errors.review.commentRequired`); both confirm with `ConfirmDialog`; call the API with `step.pendingSubmissionId`.
- `StepDetails({ stepId, mode: 'student' | 'reviewer' })`: loads `getStep`; header `PageHeader` with title (`{{order}}. {{title}}`) and description; summary grid `Card` (`grid grid-cols-4 gap-4`: deadline, status badge, mark, completed at; reviewer mode also student name · group); description block; block reason `EmptyState`-style notice using `steps.blocked.<code>` (keys `step.previousNotApproved`, `step.awaitingReview`, `step.alreadyApproved` with dots replaced by `_`) when student mode and `!canSubmit`; `SubmitWorkForm` (student) or `DecisionPanel` (reviewer); `StepTimeline`. Replaces its state with the returned `StepDetails` after submit/decision.
- `StudentMyTasksPage` (`/student/tasks`): `PageHeader` `steps.myTitle`; `ProgressSummary` card at top; `DataTable` columns order, title, deadline (red text `text-danger` when past and not approved), `StepStatusBadge`, mark, action ghost `ArrowRight`; `onRowClick` navigates to `/student/tasks/:id`.
- `StudentTaskDetailsPage` (`/student/tasks/:id`): back ghost button `steps.backToMine`; `<StepDetails stepId={id} mode="student" />`.
- `ReviewQueuePage` (`/review`, Admin and Teacher): `PageHeader` `review.title` with description `review.subtitle`; filters: group `Select` (from `getGroups()` — visible groups; first option `review.allGroups`) and `SegmentedControl` (`all`, `late`, `onTime`); `DataTable` columns student, group, step (`{{order}}. {{title}}`), version, submitted at, late badge; row click → `/review/steps/:studentTaskId`. Empty state `review.empty` with icon `CheckCheck`.
- `ReviewStepPage` (`/review/steps/:id`): back ghost `review.backToQueue`; `<StepDetails stepId={id} mode="reviewer" />`.
- `GroupProgressMatrix({ progress, onOpenStep? })`: table with sticky first column (student name), one column per step (header `{{order}}. {{title}}` and deadline muted, footer row `review.approvedOf` `{{approved}}/{{total}}`), each cell a compact `StepStatusBadge` with mark when approved and late marker; clicking a cell calls `onOpenStep(studentTaskId)`. Empty group → `EmptyState` `progress.noStudents`; group without steps → `progress.noSteps`.
- `GroupProgressPage` (`/teacher/groups/:groupId`, Teacher): back ghost `progress.backToGroups`; `PageHeader` with group name; `Card` `progress.title` containing `GroupProgressMatrix` with `onOpenStep` → `/review/steps/:id`; `Card` `groupDetails.students` with the students table (read-only).
- `TeacherGroupsPage` (`/teacher/groups`): `PageHeader` `progress.groupsTitle`; `DataTable` of `getGroups()` (name, academic year, department) with row click → `/teacher/groups/:id`; empty `progress.noGroups`.
- `GroupDetailsPage` (Admin): add a `Card` `progress.title` with `GroupProgressMatrix` (open step → `/review/steps/:id`) above the students card.
- `ProgressSummary({ progress })`: four stat tiles in a grid (`rounded-card bg-surface p-4`): `progress.approved` (`{{approved}}/{{total}}`), `progress.averageMark` (value or `—`), `progress.late`, `progress.nextDeadline` (date or `—`).
- `StudentDashboardPage`: `MyTopicCard` (phase 4), `ProgressSummary` from `getMyProgress()`, and the *My work* link card.
- `TeacherDashboardPage`: stat tiles `dashboard.waitingReviews` (count from `getReviewQueue()`) with a primary button to `/review`, and `dashboard.myGroups` (count from `getGroups()`) with a button to `/teacher/groups`.
- `App.tsx` routes: Admin+Teacher group (`ProtectedRoute allowedRoles={['Admin', 'Teacher']}`) gets `review` → `ReviewQueuePage` and `review/steps/:id` → `ReviewStepPage`; Teacher group gets `teacher/groups` → `TeacherGroupsPage` and `teacher/groups/:groupId` → `GroupProgressPage`.

**Translation blocks** — replace the `myTasks` block in both files with `steps` and add `review` and `progress`. `uk.json`:

```json
  "steps": {
    "myTitle": "Моя робота",
    "backToMine": "До моєї роботи",
    "order": "№",
    "step": "Етап",
    "deadline": "Термін",
    "mark": "Оцінка",
    "markValue": "Оцінка: {{mark}}",
    "completedAt": "Завершено",
    "student": "Студент",
    "late": "Із запізненням",
    "status": {
      "Pending": "Не розпочато",
      "Submitted": "На перевірці",
      "Returned": "Повернуто",
      "Approved": "Зараховано"
    },
    "blocked": {
      "step_previousNotApproved": "Спершу має бути зараховано попередній етап.",
      "step_awaitingReview": "Ваша робота на перевірці.",
      "step_alreadyApproved": "Етап зараховано."
    },
    "submitTitle": "Надіслати роботу",
    "mainFile": "Основний документ",
    "mainHint": ".docx, .pdf або .pptx, до 20 МБ",
    "supportingFiles": "Додаткові файли",
    "supportingHint": "До трьох файлів, до 20 МБ кожен",
    "message": "Повідомлення для рецензента",
    "submit": "Надіслати",
    "submitted": "Роботу надіслано",
    "timeline": "Історія",
    "version": "Версія {{version}}",
    "noSubmissions": "Робіт ще не надіслано.",
    "decision": {
      "Approved": "Зараховано",
      "Returned": "Повернуто на доопрацювання"
    },
    "reviewTitle": "Рішення",
    "comment": "Коментар",
    "approve": "Зарахувати",
    "approveConfirm": "Зарахувати етап з оцінкою {{mark}}?",
    "approved": "Етап зараховано",
    "return": "Повернути",
    "returnConfirm": "Повернути роботу на доопрацювання?",
    "returned": "Роботу повернуто"
  },
  "review": {
    "title": "Рецензування",
    "subtitle": "Роботи, що очікують рішення, від найстаріших",
    "allGroups": "Усі групи",
    "filterAll": "Усі",
    "filterLate": "Із запізненням",
    "filterOnTime": "Вчасно",
    "group": "Група",
    "version": "Версія",
    "submittedAt": "Надіслано",
    "empty": "Немає робіт, що очікують рішення.",
    "backToQueue": "До черги рецензування",
    "approvedOf": "{{approved}}/{{total}}"
  },
  "progress": {
    "title": "Прогрес групи",
    "groupsTitle": "Мої групи",
    "noGroups": "Ви не рецензуєте жодної групи.",
    "noStudents": "У групі немає студентів.",
    "noSteps": "Групі ще не призначено етапів.",
    "backToGroups": "До моїх груп",
    "approved": "Зараховано етапів",
    "averageMark": "Середня оцінка",
    "late": "Надіслано із запізненням",
    "nextDeadline": "Найближчий термін"
  }
```

`en.json`:

```json
  "steps": {
    "myTitle": "My work",
    "backToMine": "Back to my work",
    "order": "#",
    "step": "Step",
    "deadline": "Deadline",
    "mark": "Mark",
    "markValue": "Mark: {{mark}}",
    "completedAt": "Completed",
    "student": "Student",
    "late": "Late",
    "status": {
      "Pending": "Not started",
      "Submitted": "Under review",
      "Returned": "Returned",
      "Approved": "Approved"
    },
    "blocked": {
      "step_previousNotApproved": "The previous step must be approved first.",
      "step_awaitingReview": "Your work is under review.",
      "step_alreadyApproved": "This step is approved."
    },
    "submitTitle": "Submit work",
    "mainFile": "Main document",
    "mainHint": ".docx, .pdf or .pptx, up to 20 MB",
    "supportingFiles": "Supporting files",
    "supportingHint": "Up to three files, 20 MB each",
    "message": "Message for the reviewer",
    "submit": "Submit",
    "submitted": "Work submitted",
    "timeline": "History",
    "version": "Version {{version}}",
    "noSubmissions": "No submissions yet.",
    "decision": {
      "Approved": "Approved",
      "Returned": "Returned for revision"
    },
    "reviewTitle": "Decision",
    "comment": "Comment",
    "approve": "Approve",
    "approveConfirm": "Approve this step with mark {{mark}}?",
    "approved": "Step approved",
    "return": "Return",
    "returnConfirm": "Return the work for revision?",
    "returned": "Work returned"
  },
  "review": {
    "title": "Review",
    "subtitle": "Submissions awaiting a decision, oldest first",
    "allGroups": "All groups",
    "filterAll": "All",
    "filterLate": "Late",
    "filterOnTime": "On time",
    "group": "Group",
    "version": "Version",
    "submittedAt": "Submitted",
    "empty": "No submissions are waiting for a decision.",
    "backToQueue": "Back to review queue",
    "approvedOf": "{{approved}}/{{total}}"
  },
  "progress": {
    "title": "Group progress",
    "groupsTitle": "My groups",
    "noGroups": "You do not review any groups.",
    "noStudents": "No students in this group.",
    "noSteps": "No steps assigned to this group yet.",
    "backToGroups": "Back to my groups",
    "approved": "Steps approved",
    "averageMark": "Average mark",
    "late": "Late submissions",
    "nextDeadline": "Next deadline"
  }
```

Add to `dashboard` in `uk.json`: `"waitingReviews": "Роботи на перевірці"`, `"myGroups": "Мої групи"`, `"openReview": "Відкрити чергу"`, `"openGroups": "Переглянути групи"`; in `en.json`: `"waitingReviews": "Submissions to review"`, `"myGroups": "My groups"`, `"openReview": "Open queue"`, `"openGroups": "View groups"`.

Add to `errors` in `uk.json`:

```json
    "step": {
      "previousNotApproved": "Спершу має бути зараховано попередній етап.",
      "awaitingReview": "Остання робота ще на перевірці.",
      "alreadyApproved": "Етап уже зараховано."
    },
    "submission": {
      "notFound": "Роботу не знайдено.",
      "alreadyDecided": "Рішення щодо цієї роботи вже ухвалено.",
      "notReviewer": "Ви не є рецензентом цього студента."
    },
    "file": {
      "mainMissing": "Додайте основний документ.",
      "typeNotAllowed": "Такий тип файлу не дозволено.",
      "tooLarge": "Файл більший за 20 МБ.",
      "tooMany": "Додайте не більше трьох додаткових файлів.",
      "contentMismatch": "Вміст основного документа не відповідає його розширенню.",
      "notFound": "Файл не знайдено."
    },
    "review": {
      "markRequired": "Вкажіть оцінку, щоб зарахувати.",
      "markOutOfRange": "Оцінка має бути цілим числом від 0 до 100.",
      "commentRequired": "Напишіть коментар, щоб повернути роботу."
    }
```

and `"notYours": "Цей етап належить іншому студенту."` inside `errors.studentTask`. In `en.json`:

```json
    "step": {
      "previousNotApproved": "The previous step must be approved first.",
      "awaitingReview": "The latest submission is still under review.",
      "alreadyApproved": "This step is already approved."
    },
    "submission": {
      "notFound": "Submission not found.",
      "alreadyDecided": "This submission has already been decided.",
      "notReviewer": "You are not a reviewer of this student."
    },
    "file": {
      "mainMissing": "Attach the main document.",
      "typeNotAllowed": "This file type is not allowed.",
      "tooLarge": "A file is larger than 20 MB.",
      "tooMany": "Attach at most three supporting files.",
      "contentMismatch": "The main document's content does not match its extension.",
      "notFound": "File not found."
    },
    "review": {
      "markRequired": "Enter a mark to approve.",
      "markOutOfRange": "The mark must be a whole number from 0 to 100.",
      "commentRequired": "Write a comment to return the work."
    }
```

and `"notYours": "This step belongs to another student."` inside `errors.studentTask`.

- [ ] **Step 1: Translations and workflow components**
- [ ] **Step 2: Pages, dashboards and routes**
- [ ] **Step 3: Gates**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean.

---

### Task 10: Browser walkthrough, verification and commit

**Files:**
- Modify: `docs/superpowers/test-backlog.md`, `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: Walkthrough with the owner** (owner signs in; controller drives `api` and `web`)
1. Admin → Groups → group details: assign two steps; the progress matrix shows the seed student.
2. Student → My work: first step open, second blocked; submit a `.docx` with a supporting file and a message; the timeline shows version 1 and the step is *Under review*.
3. Teacher → Review: the submission is listed; open it; download both files; return with a comment.
4. Student: the step shows *Returned* with the comment; submit version 2.
5. Teacher: approve with mark 90; group progress shows the approved cell; dashboard counters update.
6. Student dashboard: progress tiles show 1/2 and the average mark; second step is now open.
7. UK/EN switch on each new page.

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

- [ ] **Step 3: Append the workflow section to `docs/superpowers/test-backlog.md`**

```markdown

## Submission and review

### Service level, InMemory
- `StudentWorkflowService.GetMyStepsAsync`: on-demand creation of missing steps; only the current group's steps; order by template order then title; `CanSubmit`/`BlockReason` for pending, returned after approved predecessor, submitted, approved, blocked by predecessor.
- `SubmitAsync`: other student's step; step of a former group; each block reason; message over 2000; file rule failures; version numbering; late flag at the deadline boundary; stored files deleted when saving fails.
- `ApproveAsync`/`ReturnAsync`: mark missing, below 0, above 100; comment missing/whitespace; non-reviewer teacher; supervisor who is not a group reviewer; admin; deciding an older version; deciding twice; status and mark propagation to the step.
- `OpenFileAsync`: student own, other student, reviewer, supervisor, unrelated teacher, missing stored file; content type for main vs supporting.
- `GetReviewQueueAsync`: scoping for reviewer, supervisor and admin; group and late filters; ordering.
- `GetGroupProgressAsync` / `GetStudentProgressAsync`: visibility, approved counts, late count, average mark rounding, next deadline.
- `AccessScope`: group visibility for reviewer, supervisor-only, unrelated teacher, student.
- `SubmissionFileRules`: signatures for docx/pptx/pdf, blocked extensions case-insensitive, size limits, safe original name.
- `LocalFileStorage` and `StartupValidation.ValidateStorageSettings`: missing path, relative path under content root, unwritable path, key traversal refused.

### SQL Server integration
- `StudentTasks.RowVersion`: concurrent submissions of one step and concurrent decisions on one submission produce one success.
- Unique `(StudentTaskId, Version)`.

### HTTP level
- Multipart binding of `mainFile`, `supportingFiles`, `message`; 90 MB request limit; download headers (`Content-Disposition`, `nosniff`); role restrictions on every route; `students/me/progress` vs `students/{id}/progress`.

### Frontend
- Submit form client-side file checks; decision panel validation; timeline rendering of decided and undecided versions; progress matrix cell navigation; queue filters.
```

- [ ] **Step 4: Update `docs/superpowers/PROJECT_MEMORY.md`**

- Status row: `| 5 Submission and review | Done — commit \`Implement submission and review\` | \`2026-09-17-submission-and-review-design.md\` |`.
- Remove the open question about teacher visibility (settled and implemented).
- `## Environment facts`: add `Uploaded files are stored under \`Storage:RootPath\` (Development: \`backend/DiplomaTracker.Api/App_Data/uploads\`, git-ignored); hosted deployments set \`Storage__RootPath\`.`
- `## Gotchas`: add `**Student steps are created on demand** for the student's current group; do not assume a \`StudentTask\` row exists before a student or group progress page has been loaded.` and `**Visibility** for teachers goes through \`IAccessScope\`; new group- or student-scoped queries must use it.`
- `## Log`: today's date — `Submission and review implemented.`

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add .gitignore backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src docs/superpowers/test-backlog.md docs/superpowers/PROJECT_MEMORY.md
git diff --cached --name-only | grep -E '/bin/|/obj/|node_modules|App_Data|PROJECT_PAPER|README'; echo "exit=$?"
git diff --cached backend/DiplomaTracker.Api/appsettings.json backend/DiplomaTracker.Api/appsettings.Development.json | grep '^+' | grep -i 'secret\|password=' ; echo "secrets exit=$?"
git commit -m "Implement submission and review"
git log --oneline -1
```

Expected: both greps print nothing with `exit=1`; the log's first line ends with `Implement submission and review`.
