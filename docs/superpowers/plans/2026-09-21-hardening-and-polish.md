# Hardening and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Diploma Tracker behave correctly when it is trusted with a real cohort — sessions that reflect the account, uploads that are what they claim, an archive for a departed cohort's work, one identity per student, and dashboards that tell each role what is waiting for them.

**Architecture:** Backend-first. Tasks 1–12 build the API — a per-request session check, a shared Office-package inspector, the archive entity set and its service, projection-based reads, paging, and three dashboard endpoints — each verified by building and by a node check script against the live local database. Tasks 13–16 build the frontend on top of the finished API. Tasks 17–19 close the repository items and commit.

**Tech Stack:** ASP.NET Core 8 (net8.0), EF Core 8 + SQL Server, `DocumentFormat.OpenXml` 3.5.1, React 18 + TypeScript + Vite 5, Tailwind 4, Headless UI 2, i18next (uk/en), node 20 check scripts using global `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-21-hardening-and-polish-design.md` — read it in full before Task 1. Section references below (`§4.4`) point into it.

## Global Constraints

These come from `docs/superpowers/PROJECT_MEMORY.md` and the owner's standing instructions. They apply to every task without being repeated.

- **No tests are written in this plan.** Unit tests are written in one pass once the whole project is done. Anything a reviewer would want covered goes into `docs/superpowers/test-backlog.md` under a `## Phase 8` section, not into a test project.
- **No commits except where this plan says so.** Exactly two commits exist: Task 18 (line-ending renormalisation, on its own) and Task 19 (everything else, one bare title line, no body, no trailer).
- **Work on the checked-out branch** (`phase7`). Never merge, never push, never create a branch.
- **Backend build must end 0 errors / 0 warnings.** Frontend lint baseline is 0 errors / 0 warnings.
- **Every API error is `{ code, message }`.** Codes live in the per-area catalogue classes and are translated in `frontend/diploma-tracker-web/src/i18n/uk.json` and `en.json`. Never compare message text; never add a code without both translations.
- **Every `DateTime` on the wire is UTC.** `UtcDateTimeJsonConverter` is global. Never introduce `DateTime.Now` or `ToLocalTime` on the server.
- **Entities are never returned from a controller.** Every response is an explicit DTO mapped in the service layer. Read-only queries are `AsNoTracking()`.
- **Teacher visibility goes through `IAccessScope`.** Any new group- or student-scoped query uses it. A hidden resource answers exactly like a missing one.
- **Services return `(T? result, string? error)`**; the controller maps the error string through `ErrorResult`.
- **Paths contain spaces and Cyrillic** (`C:\Users\c4pgt\Desktop\diplom snaps\маг\diploma_tracker` on this machine, `C:\GIT\diploma_tracker` on the other). Always quote them; never hard-code either.
- **Bash tool is Git Bash; Python is not installed.** Use `node` for JSON and scripting.
- **`dotnet run` spawns a child `DiplomaTracker.Api.exe` that outlives its parent.** If you start the API, kill it with `taskkill //F //IM DiplomaTracker.Api.exe` and confirm with `netstat -ano | grep ":5000 .*LISTEN"`. A running API locks the build output. **Do not start the API yourself** — the controller runs it; ask for a restart instead.
- **Frontend build needs `VITE_API_BASE_URL`**: `VITE_API_BASE_URL=http://localhost:5000 npm run build`.
- **`.superpowers/sdd/` is never committed. `.superpowers/checks/` is committed** despite the stale `.gitignore` entry (tracked since 2026-09-18).
- **The interface ships one theme only.** `src/index.css` defines a single set of `--color-*` values. There is no dark mode; do not add `prefers-color-scheme`, `data-theme` or a toggle.
- **Roles are the strings `"Admin"`, `"Teacher"`, `"Student"`.**

### Build and verification commands

Run from the repository root.

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

```bash
node .superpowers/checks/hardening-check.mjs
```

## File Structure

**Backend — new files**

| File | Responsibility |
|---|---|
| `Services/SecurityLog.cs` | The security event vocabulary: one method per event, fixed template and fields (§2.3) |
| `Services/SessionStateValidator.cs` | The per-request account-state check behind every bearer token (§2.1) |
| `Services/OfficePackageInspector.cs` | The single ZIP/Office/PDF/image inspector used by every upload path (§3) |
| `Services/ArchiveErrors.cs` | Error codes for the archive area |
| `Services/ArchiveService.cs` | Writes archive rows; reads the archive; purges it (§4) |
| `Services/DashboardService.cs` | The three dashboard reads (§7.3–§7.5) |
| `Interfaces/IArchiveService.cs`, `Interfaces/IDashboardService.cs` | Their interfaces |
| `Controllers/ArchiveController.cs` | `/api/archive/*` |
| `Entities/ArchivedGroup.cs`, `ArchivedGroupReviewer.cs`, `ArchivedFile.cs` | The archive entity set (§4.2) |
| `DTOs/Archive/*.cs`, `DTOs/Dashboard/*.cs` | Their response shapes |
| `Models/PagedResponse.cs` | `{ items, page, pageSize, total }` |

**Backend — modified files**

`Services/PasswordPolicy.cs`, `AuthService.cs`, `AdminService.cs`, `AdminBootstrapper.cs`, `IdentityNormalizer.cs`, `StudentService.cs`, `StudentImportService.cs`, `FacultyService.cs`, `DepartmentService.cs`, `GroupService.cs`, `ReservationService.cs`, `TopicService.cs`, `TopicSettingsService.cs`, `TaskTemplateService.cs`, `StudentWorkflowService.cs`, `DocumentTemplateService.cs`, `SubmissionFileRules.cs`, `OnboardingErrors.cs`, `AcademicStructureErrors.cs`, `TemplateErrors.cs`, `Errors/CommonErrors.cs`, `Errors/ErrorCatalog.cs`, `Data/AppDbContext.cs`, `Entities/StudentProfile.cs`, `Entities/DocumentTemplate.cs`, `Controllers/DashboardController.cs`, `ReviewController.cs`, `TaskTemplatesController.cs`, `StudentTasksController.cs`, `Program.cs`.

**Frontend — new files**

`src/api/archiveApi.ts`, `src/api/dashboardApi.ts`, `src/pages/ArchivePage.tsx`, `src/pages/ArchivedGroupPage.tsx`, `src/components/dashboard/StatTile.tsx`, `src/components/dashboard/ProportionBar.tsx`, `src/components/dashboard/GroupProgressCard.tsx`, `src/components/ui/Pagination.tsx`.

**Frontend — modified files**

`src/api/types.ts`, `workflowApi.ts`, `taskTemplatesApi.ts`, `src/pages/AdminDashboardPage.tsx`, `TeacherDashboardPage.tsx`, `StudentDashboardPage.tsx`, `ReviewQueuePage.tsx`, `TaskTemplatesPage.tsx`, `StudentTopicsPage.tsx`, `src/components/topics/MyTopicCard.tsx`, `src/components/workflow/GroupProgressMatrix.tsx`, `StepStatusBadge.tsx`, `stepTones.ts`, `ProgressSummary.tsx`, `src/App.tsx`, `src/components/layout/*` (navigation), `src/i18n/uk.json`, `src/i18n/en.json`.

**Repository**

`.gitattributes` (new), `.superpowers/checks/checkCleanup.mjs` (new), `.superpowers/checks/hardening-check.mjs` (new), every existing `.superpowers/checks/*.mjs` (modified).

---

### Task 1: Session state, password policy and the logging vocabulary

Implements §2.1, §2.2 and the vocabulary half of §2.3.

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/SecurityLog.cs`
- Create: `backend/DiplomaTracker.Api/Services/SessionStateValidator.cs`
- Modify: `backend/DiplomaTracker.Api/Services/PasswordPolicy.cs`
- Modify: `backend/DiplomaTracker.Api/Services/OnboardingErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AuthService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AdminService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AdminBootstrapper.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs` (access reset line only)
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Produces: `SecurityLog` static methods (used by Tasks 2, 6, 7); `SessionStateValidator.IsSessionValidAsync(ClaimsPrincipal, CancellationToken) → Task<bool>`; `PasswordPolicy.IsSatisfiedByElevated(string?)`, `PasswordPolicy.ElevatedViolation`, `PasswordPolicy.ElevatedMinimumLength`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Create the security event vocabulary**

Create `Services/SecurityLog.cs`:

```csharp
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.3. Every security-relevant event is written through one of these methods, so a
/// line's shape does not depend on which service wrote it. A line never carries a password, a
/// password hash, a token, a file's contents or a connection string. An email address appears
/// only where the account is not yet identified - a failed sign-in or a refused claim - because
/// there is no id to name instead.
public static class SecurityLog
{
    public static void SignInSucceeded(ILogger logger, Guid userId, string role) =>
        logger.LogInformation("Sign-in succeeded: UserId={UserId}, Role={Role}", userId, role);

    /// Reason is one of UnknownAccount, WrongPassword, Inactive, Unclaimed.
    public static void SignInFailed(ILogger logger, string email, string reason) =>
        logger.LogWarning("Sign-in failed: Email={Email}, Reason={Reason}", email, reason);

    /// Reason is one of Missing, Inactive, Unclaimed, RoleChanged, Malformed.
    public static void SessionRejected(ILogger logger, Guid userId, string reason) =>
        logger.LogWarning("Session rejected: UserId={UserId}, Reason={Reason}", userId, reason);

    public static void ClaimSucceeded(ILogger logger, Guid userId, bool reopened) =>
        logger.LogInformation("Account claimed: UserId={UserId}, Reopened={Reopened}", userId, reopened);

    /// Reason is one of DetailsMismatch, RegistrationClosed.
    public static void ClaimRefused(ILogger logger, string email, string reason) =>
        logger.LogWarning("Claim refused: Email={Email}, Reason={Reason}", email, reason);

    public static void PasswordChanged(ILogger logger, Guid userId) =>
        logger.LogInformation("Password changed: UserId={UserId}", userId);

    public static void AccessReset(ILogger logger, Guid studentUserId, Guid administratorId) =>
        logger.LogInformation(
            "Access reset: StudentUserId={StudentUserId}, AdministratorId={AdministratorId}",
            studentUserId, administratorId);

    public static void AccessRefused(ILogger logger, Guid actorUserId, string role, string resource, Guid resourceId) =>
        logger.LogWarning(
            "Access refused: ActorUserId={ActorUserId}, Role={Role}, Resource={Resource}, ResourceId={ResourceId}",
            actorUserId, role, resource, resourceId);

    public static void StudentsImported(ILogger logger, Guid administratorId, int created, int updated, int failed) =>
        logger.LogInformation(
            "Students imported: AdministratorId={AdministratorId}, Created={Created}, Updated={Updated}, Failed={Failed}",
            administratorId, created, updated, failed);

    public static void StudentsArchived(ILogger logger, Guid administratorId, int count, IReadOnlyList<Guid> studentProfileIds) =>
        logger.LogInformation(
            "Students archived: AdministratorId={AdministratorId}, Count={Count}, StudentProfileIds={StudentProfileIds}",
            administratorId, count, studentProfileIds);

    public static void StudentsRestored(ILogger logger, Guid administratorId, int count, IReadOnlyList<Guid> studentProfileIds) =>
        logger.LogInformation(
            "Students restored: AdministratorId={AdministratorId}, Count={Count}, StudentProfileIds={StudentProfileIds}",
            administratorId, count, studentProfileIds);

    /// Action is Created, Updated, Deleted, Activated or Deactivated; entity is the entity type
    /// name (Faculty, Department, Group, TaskTemplate, GroupTask, Teacher, Administrator,
    /// Student, Topic, Settings).
    public static void AdministratorAction(ILogger logger, Guid administratorId, string action, string entity, Guid entityId) =>
        logger.LogInformation(
            "Administrator action: AdministratorId={AdministratorId}, Action={Action}, Entity={Entity}, EntityId={EntityId}",
            administratorId, action, entity, entityId);

    public static void TopicAssigned(ILogger logger, Guid studentProfileId, Guid administratorId, Guid? topicId) =>
        logger.LogInformation(
            "Topic assigned: StudentProfileId={StudentProfileId}, AdministratorId={AdministratorId}, TopicId={TopicId}",
            studentProfileId, administratorId, topicId);

    public static void SubmissionDecided(ILogger logger, Guid reviewerId, Guid submissionId, string decision, int? mark) =>
        logger.LogInformation(
            "Submission decided: ReviewerId={ReviewerId}, SubmissionId={SubmissionId}, Decision={Decision}, Mark={Mark}",
            reviewerId, submissionId, decision, mark);

    public static void FileDownloaded(ILogger logger, Guid actorUserId, Guid fileId, Guid studentProfileId) =>
        logger.LogInformation(
            "File downloaded: ActorUserId={ActorUserId}, FileId={FileId}, StudentProfileId={StudentProfileId}",
            actorUserId, fileId, studentProfileId);

    /// Action is Uploaded, Replaced, Deleted or Generated.
    public static void TemplateAction(ILogger logger, Guid actorUserId, string action, Guid templateId) =>
        logger.LogInformation(
            "Template {Action}: ActorUserId={ActorUserId}, TemplateId={TemplateId}",
            action, actorUserId, templateId);

    public static void GroupDeleted(ILogger logger, Guid administratorId, Guid groupId, string groupCode, int archivedFileCount, int deletedStudentCount) =>
        logger.LogWarning(
            "Group deleted: AdministratorId={AdministratorId}, GroupId={GroupId}, GroupCode={GroupCode}, ArchivedFileCount={ArchivedFileCount}, DeletedStudentCount={DeletedStudentCount}",
            administratorId, groupId, groupCode, archivedFileCount, deletedStudentCount);

    public static void ArchivePurged(ILogger logger, Guid administratorId, Guid archivedGroupId, int fileCount, long bytes) =>
        logger.LogWarning(
            "Archive purged: AdministratorId={AdministratorId}, ArchivedGroupId={ArchivedGroupId}, FileCount={FileCount}, Bytes={Bytes}",
            administratorId, archivedGroupId, fileCount, bytes);
}
```

- [ ] **Step 2: Give the password policy a second, elevated rule**

Replace `Services/PasswordPolicy.cs` entirely:

```csharp
namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.2: an administrator can create and delete accounts, reassign topics, delete
/// groups and purge the archive, so that account carries a longer minimum than a student's.
/// The two rules have their own error codes so each message can state its own number without
/// interpolation.
public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int ElevatedMinimumLength = 12;
    public const int MaximumLength = 128;
    public const string Violation = "password.policy";
    public const string ElevatedViolation = "password.policyElevated";

    public static bool IsSatisfiedBy(string? password) =>
        password is not null && password.Length is >= MinimumLength and <= MaximumLength;

    public static bool IsSatisfiedByElevated(string? password) =>
        password is not null && password.Length is >= ElevatedMinimumLength and <= MaximumLength;
}
```

- [ ] **Step 3: Register the elevated error code**

In `Services/OnboardingErrors.cs`, add one entry to the `All` array, directly after the existing `PasswordPolicy.Violation` entry:

```csharp
        new(PasswordPolicy.Violation, StatusCodes.Status400BadRequest, "Password must be between 8 and 128 characters."),
        new(PasswordPolicy.ElevatedViolation, StatusCodes.Status400BadRequest, "An administrator password must be between 12 and 128 characters.")
```

(The existing entry is the last in the array and has no trailing comma — add the comma.)

- [ ] **Step 4: Apply the elevated rule to administrator accounts**

In `Services/AdminService.cs`, replace both policy checks. At line ~50 (creating an administrator):

```csharp
        if (!PasswordPolicy.IsSatisfiedByElevated(request.Password))
        {
            return (null, PasswordPolicy.ElevatedViolation);
        }
```

At line ~129 (setting an administrator's password):

```csharp
        if (!PasswordPolicy.IsSatisfiedByElevated(password))
        {
            return (false, PasswordPolicy.ElevatedViolation);
        }
```

Leave `TeacherService`, `StudentService` and `AuthService.ClaimAccountAsync`/`ChangePasswordAsync` on the standard rule — a teacher's and a student's minimum is unchanged.

`AuthService.ChangePasswordAsync` is the one place where a single method serves every role, so it must choose by role. Replace its policy check (line ~164) with:

```csharp
        var satisfied = user.Role == "Admin"
            ? PasswordPolicy.IsSatisfiedByElevated(request.NewPassword)
            : PasswordPolicy.IsSatisfiedBy(request.NewPassword);
        if (!satisfied)
        {
            return (false, user.Role == "Admin" ? PasswordPolicy.ElevatedViolation : PasswordPolicy.Violation);
        }
```

- [ ] **Step 5: Refuse a short bootstrap administrator password at startup**

In `Services/AdminBootstrapper.cs`, inside `EnsureAdminAsync`, before the user is constructed, add:

```csharp
        if (!PasswordPolicy.IsSatisfiedByElevated(settings.AdminPassword))
        {
            throw new InvalidOperationException(
                $"Bootstrap:AdminPassword must be at least {PasswordPolicy.ElevatedMinimumLength} characters.");
        }
```

Place it after the existing guard that returns when an administrator already exists, so an already-bootstrapped deployment is never blocked by a value that is no longer used. Never log the value.

- [ ] **Step 6: Create the per-request session check**

Create `Services/SessionStateValidator.cs`:

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Phase 8 §2.1: a bearer token carries claims, not facts. The account it names may have been
/// archived, deactivated, given a different role or had its access reset since the token was
/// issued, and the token would otherwise keep working for up to sixty minutes. Every
/// authenticated request re-reads four columns of that account. There is no revocation list and
/// no cache: the database is the only authority, and it is consulted every time.
public sealed class SessionStateValidator
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<SessionStateValidator> _logger;

    public SessionStateValidator(AppDbContext dbContext, ILogger<SessionStateValidator> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<bool> IsSessionValidAsync(ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var idValue = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);
        var role = principal.FindFirstValue(ClaimTypes.Role);

        if (!Guid.TryParse(idValue, out var userId) || string.IsNullOrEmpty(role))
        {
            SecurityLog.SessionRejected(_logger, Guid.Empty, "Malformed");
            return false;
        }

        var state = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.IsActive, u.Role, HasPassword = u.PasswordHash != null })
            .FirstOrDefaultAsync(cancellationToken);

        if (state is null)
        {
            SecurityLog.SessionRejected(_logger, userId, "Missing");
            return false;
        }

        // An access reset clears the password hash and leaves the account active, so this is the
        // condition that ends a reset student's session at once and keeps them out until they
        // have claimed the account again.
        if (!state.IsActive)
        {
            SecurityLog.SessionRejected(_logger, userId, "Inactive");
            return false;
        }

        if (!state.HasPassword)
        {
            SecurityLog.SessionRejected(_logger, userId, "Unclaimed");
            return false;
        }

        if (!string.Equals(state.Role, role, StringComparison.Ordinal))
        {
            SecurityLog.SessionRejected(_logger, userId, "RoleChanged");
            return false;
        }

        return true;
    }
}
```

- [ ] **Step 7: Wire the check into token validation**

In `Program.cs`, register the validator next to the other scoped services (after `builder.Services.AddScoped<IDocumentTemplateService, DocumentTemplateService>();`):

```csharp
builder.Services.AddScoped<SessionStateValidator>();
```

Then extend the JWT bearer configuration. Inside the existing `builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<IOptions<JwtSettings>>((options, jwtSettings) => { … })` lambda, after `options.TokenValidationParameters = new TokenValidationParameters { … };`, add:

```csharp
        // Phase 8 §2.1: the signature and lifetime say the token is authentic; they say nothing
        // about the account still being allowed to use it. One projected read per authenticated
        // request closes the gap between an administrator archiving an account and that account's
        // token expiring.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var validator = context.HttpContext.RequestServices.GetRequiredService<SessionStateValidator>();
                if (!await validator.IsSessionValidAsync(context.Principal!, context.HttpContext.RequestAborted))
                {
                    context.Fail("The session is no longer valid.");
                }
            }
        };
```

A failed token produces a 401, which `UseStatusCodePages` already renders as `{ code: "user.notFound", … }`, and which the frontend's `apiClient` already turns into a cleared token and a redirect to the sign-in page. Nothing else changes.

- [ ] **Step 8: Move the auth service onto the vocabulary and report a sign-in reason**

In `Services/AuthService.cs`, replace `LoginAsync` entirely:

```csharp
    public async Task<LoginResponse?> LoginAsync(LoginRequest request)
    {
        var email = IdentityNormalizer.Email(request.Email);

        // The IsActive filter has moved out of the query so the refusal can be logged with a
        // reason. The RESPONSE is identical in every branch - null - and every branch that does
        // not verify a real hash still verifies the dummy one, so neither the answer nor the
        // time it takes reveals which branch ran.
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "UnknownAccount");
            return null;
        }

        if (!user.IsActive)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "Inactive");
            return null;
        }

        if (user.PasswordHash is null)
        {
            _passwordHasher.VerifyPassword(request.Password, DummyPasswordHash);
            SecurityLog.SignInFailed(_logger, email, "Unclaimed");
            return null;
        }

        if (!_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            SecurityLog.SignInFailed(_logger, email, "WrongPassword");
            return null;
        }

        SecurityLog.SignInSucceeded(_logger, user.Id, user.Role);

        return new LoginResponse
        {
            Token = CreateToken(user),
            User = MapCurrentUser(user)
        };
    }
```

Replace the three remaining inline log calls in the same file with vocabulary calls:

- in `ClaimAccountAsync`, `_logger.LogInformation("Account claimed: …")` → `SecurityLog.ClaimSucceeded(_logger, profile.UserId, wasReopened);`
- in `RefuseClaim`, the two `_logger.LogWarning("Claim refused: …")` calls → `SecurityLog.ClaimRefused(_logger, email, "DetailsMismatch");` and `SecurityLog.ClaimRefused(_logger, email, "RegistrationClosed");`
- in `ChangePasswordAsync`, `_logger.LogInformation("Password changed: …")` → `SecurityLog.PasswordChanged(_logger, userId);`

In `Services/StudentService.cs`, replace the access-reset log call (line ~282) with:

```csharp
        SecurityLog.AccessReset(_logger, profile.UserId, administratorId);
```

- [ ] **Step 9: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 10: Record the test gaps, do not write tests**

Append to `docs/superpowers/test-backlog.md` a `## Phase 8` section with these entries (create the section if absent):

```markdown
## Phase 8

### Sessions and passwords
- `SessionStateValidator` returns false for: missing user, `IsActive = false`, `PasswordHash = null`, role differing from the token claim; true for a healthy account.
- A token issued before an archive stops working on the next request (integration, needs an HTTP host).
- `AuthService.LoginAsync` returns null and logs the right reason for unknown, inactive, unclaimed and wrong-password, and verifies a hash in every branch.
- `PasswordPolicy.IsSatisfiedByElevated` boundaries at 11/12/128/129.
- `AdminService` create and set-password refuse an 11-character password with `password.policyElevated`.
- `AuthService.ChangePasswordAsync` picks the elevated rule for an Admin and the standard rule for a Teacher and a Student.
- `AdminBootstrapper` throws when `Bootstrap:AdminPassword` is shorter than 12, and does not throw when an administrator already exists.
```

---

### Task 2: Security logging across the services

Implements the application half of §2.3. No behaviour changes — every edit replaces or adds a log line.

**Files:**
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`, `GroupTaskService.cs`, `FacultyService.cs`, `DepartmentService.cs`, `TaskTemplateService.cs`, `TeacherService.cs`, `AdminService.cs`, `StudentService.cs`, `StudentImportService.cs`, `ReservationService.cs`, `StudentWorkflowService.cs`, `DocumentTemplateService.cs`, `TopicSettingsService.cs`

**Interfaces:**
- Consumes: `SecurityLog` (Task 1).
- Produces: nothing new. Services that do not already hold an `ILogger<T>` gain one through their constructor; register nothing — `ILogger<T>` resolves automatically.

- [ ] **Step 1: Replace the existing ad-hoc log lines**

These already exist and must now go through the vocabulary, unchanged in meaning:

| File | Existing call | Replacement |
|---|---|---|
| `GroupService.ArchiveGroupStudentsAsync` | `"Group students archived: …"` | `SecurityLog.StudentsArchived(_logger, administratorId, archivedIds.Count, archivedIds);` |
| `StudentWorkflowService.OpenFileAsync` | `"User {ActorUserId} downloaded file …"` | `SecurityLog.FileDownloaded(_logger, user.UserId, fileId, file.StudentProfileId);` |
| `ReservationService` (assignment) | `"Student topic cleared by administrator: …"` and the assignment line | `SecurityLog.TopicAssigned(_logger, student.Id, administratorId, null);` and `SecurityLog.TopicAssigned(_logger, student.Id, administratorId, topic.Id);` |

Search for the remaining `_logger.Log` calls in the services listed above and convert each to the nearest vocabulary method. Where no method fits, the event is not in §2.3 and the line stays as it is.

- [ ] **Step 2: Add the administrator-action lines**

Every successful create, update, delete, activate and deactivate performed by an administrator logs one line. The actor id is already available on every one of these paths through the controller's `UserContext`; where a service method does not receive it, **add a `Guid administratorId` parameter to the service method and its interface**, and pass `user.UserId` from the controller.

Add, immediately before each successful return:

```csharp
        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Faculty", faculty.Id);
```

Apply to: `FacultyService` (create/update/delete), `DepartmentService` (create/update/delete), `GroupService` (create/update/delete, add/remove reviewer → `"Group"` with the group id), `TaskTemplateService` (create/update/activate/deactivate), `GroupTaskService` (assign/update/delete → entity `"GroupTask"`), `TeacherService` (create/update/deactivate/set password → entity `"Teacher"`), `AdminService` (create/update/deactivate/set password → entity `"Administrator"`), `StudentService` (create/update/archive/restore → entity `"Student"`, plus `SecurityLog.StudentsRestored` on the bulk restore), `TopicService` (create/update/delete → entity `"Topic"`), `TopicSettingsService.SetDeadlineAsync` (entity `"Settings"`, entity id `Guid.Empty`).

`StudentImportService` logs `SecurityLog.StudentsImported(_logger, administratorId, created, updated, failed)` once, with the counts it already computes for its outcome.

- [ ] **Step 3: Add the decision line**

In `StudentWorkflowService.DecideAsync`, after the decision is saved and before the response is mapped:

```csharp
        SecurityLog.SubmissionDecided(
            _logger,
            user.UserId,
            submission.Id,
            submission.Decision!.Value.ToString(),
            submission.Mark);
```

- [ ] **Step 4: Add the access-refused lines**

A service-layer refusal that is an authorization decision — not a validation failure and not a missing row — logs one line. Add `SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "<Resource>", <id>);` immediately before returning the error at each of these points:

- `StudentWorkflowService`: `WorkflowErrors.StudentTaskNotYours` (`"StudentTask"`), `WorkflowErrors.NotReviewer` (`"Submission"`), and the file-download refusal (`"SubmissionFile"`).
- `GroupService.GetGroupStudentsAsync` and `GetGroupReviewersAsync` when `CanSeeGroupAsync` is false (`"Group"`).
- `StudentWorkflowService.GetGroupProgressAsync` and `GetStudentProgressAsync` when the scope returns nothing (`"Group"`, `"StudentProfile"`).
- `TopicService` when a teacher or student is refused a topic they may not see (`"Topic"`).
- `DocumentTemplateService` when a template is not in the caller's audience (`"DocumentTemplate"`).

The refusal's status, code and message are unchanged — only a log line is added.

- [ ] **Step 5: Add the template action lines**

In `DocumentTemplateService`, after each successful operation: `SecurityLog.TemplateAction(_logger, actorUserId, "Uploaded" | "Replaced" | "Deleted" | "Generated", template.Id);`

- [ ] **Step 6: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

Adding a parameter to a service method requires the matching change in its interface in `Interfaces/` and in the calling controller. If the build reports an unused `ILogger<T>` field, the service was already logging and the field was already there — do not add a second one.

- [ ] **Step 7: Record the test gaps**

Append to the `## Phase 8` section of `docs/superpowers/test-backlog.md`:

```markdown
### Security logging
- Every method on `SecurityLog` writes at the documented level with the documented field names.
- No `SecurityLog` call site passes a password, hash, token or file content (review-level check, not a unit test).
- An access refusal logs exactly once and does not change the status, code or message returned.
```

---

### Task 3: One inspector for every upload

Implements §3, and the neutral 413 from §3's last paragraph.

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/OfficePackageInspector.cs`
- Modify: `backend/DiplomaTracker.Api/Services/SubmissionFileRules.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DocumentTemplateService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/WorkflowErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/CommonErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Produces: `OfficePackageInspector.Inspect(Stream, OfficePackageKind) → bool`, `OfficePackageInspector.Limits` constants, `OfficePackageKind` enum (`Word`, `Presentation`); `SubmissionFileRules.ValidateSupportingAsync(IReadOnlyList<IFormFile>) → Task<string?>` (replaces the synchronous `ValidateSupporting`).
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Extract the inspector**

Create `Services/OfficePackageInspector.cs`. The ZIP-budget logic is lifted verbatim from `DocumentTemplateService.IsSafeZipArchive`, which keeps phase 6's proven limits; what is new is the required-part check.

```csharp
using System.IO.Compression;
using System.Xml;

namespace DiplomaTracker.Api.Services;

public enum OfficePackageKind
{
    Word,
    Presentation
}

/// Phase 8 §3. A .docx and a .pptx are ZIP archives of XML parts, and every ZIP file on earth
/// begins with the same four bytes - so a Java archive renamed thesis.docx passes a magic-number
/// check and is then stored and served as a Word document. This opens the package instead.
///
/// Every limit is read from the ZIP directory before a single entry is decompressed, so the
/// inspection cannot itself be turned into a decompression bomb. The budgets are phase 6's,
/// unchanged; the required-part rules are new.
public static class OfficePackageInspector
{
    public const int MaxEntries = 1_000;
    public const long MaxUncompressedBytes = 100L * 1024 * 1024;
    public const long MaxXmlUncompressedBytes = 20L * 1024 * 1024;
    public const int MaxXmlDepth = 128;

    private const string ContentTypesEntry = "[Content_Types].xml";

    public static bool Inspect(Stream content, OfficePackageKind kind)
    {
        if (content.CanSeek)
        {
            content.Position = 0;
        }

        try
        {
            using var archive = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count > MaxEntries)
            {
                return false;
            }

            var requiredFolder = kind == OfficePackageKind.Word ? "word/" : "ppt/";
            var hasContentTypes = false;
            var hasRequiredPart = false;
            long uncompressedTotal = 0;
            long xmlTotal = 0;

            foreach (var entry in archive.Entries)
            {
                uncompressedTotal += entry.Length;
                if (uncompressedTotal > MaxUncompressedBytes)
                {
                    return false;
                }

                var name = entry.FullName.Replace('\\', '/');

                if (string.Equals(name, ContentTypesEntry, StringComparison.OrdinalIgnoreCase))
                {
                    hasContentTypes = true;
                }

                if (name.StartsWith(requiredFolder, StringComparison.OrdinalIgnoreCase) && entry.Length > 0)
                {
                    hasRequiredPart = true;
                }

                if (!IsBudgetedXmlEntry(name, requiredFolder))
                {
                    continue;
                }

                xmlTotal += entry.Length;
                if (xmlTotal > MaxXmlUncompressedBytes || !IsSafeXmlEntry(entry))
                {
                    return false;
                }
            }

            return hasContentTypes && hasRequiredPart;
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or ArgumentException)
        {
            return false;
        }
        finally
        {
            if (content.CanSeek)
            {
                content.Position = 0;
            }
        }
    }

    /// The SDK parses every top-level XML part of the main folder into a DOM, so that subset gets
    /// a much smaller budget than the whole package.
    private static bool IsBudgetedXmlEntry(string normalizedName, string requiredFolder)
    {
        if (!normalizedName.StartsWith(requiredFolder, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var rest = normalizedName[requiredFolder.Length..];
        return rest.Length > 0 && !rest.Contains('/') && rest.EndsWith(".xml", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSafeXmlEntry(ZipArchiveEntry entry)
    {
        try
        {
            using var stream = entry.Open();
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                CloseInput = true
            });

            while (reader.Read())
            {
                if (reader.Depth > MaxXmlDepth)
                {
                    return false;
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is XmlException or InvalidDataException or IOException)
        {
            return false;
        }
    }
}
```

- [ ] **Step 2: Point the template service at the inspector**

In `DocumentTemplateService`, delete the private `IsSafeZipArchive`, `IsWordXmlEntry` and `IsSafeXmlEntry` methods and the `MaxZipEntries`, `MaxZipUncompressedBytes`, `MaxXmlUncompressedBytes` and XML-depth constants they used. Replace the call site:

```csharp
        using (var inspection = new MemoryStream(content))
        {
            if (!OfficePackageInspector.Inspect(inspection, OfficePackageKind.Word))
            {
                return (TemplateErrors.InvalidFile, null, null, null);
            }
        }
```

A template that was accepted before and carries `[Content_Types].xml` and a `word/` part — every real `.docx` does — is still accepted.

- [ ] **Step 3: Replace the submission file rules**

Replace the type tables and both validators in `Services/SubmissionFileRules.cs`. Keep `MaxFileBytes`, `MaxRequestBytes`, `MaxSupportingFiles`, `SafeOriginalName`, `Normalize`, `TakeHead` and `SurrogateSafeSlice` exactly as they are.

```csharp
    private static readonly Dictionary<string, string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf"
    };

    /// Phase 8 §3: supporting files are an allowlist too. A file is accepted because it is
    /// recognised, not because it failed to match a list of things known to be bad. Images are
    /// here because a scan or a screenshot is the common reason for a supporting file.
    private static readonly Dictionary<string, string> SupportingContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg"
    };

    private static readonly byte[] PdfSignature = [0x25, 0x50, 0x44, 0x46];
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] JpegSignature = [0xFF, 0xD8, 0xFF];

    public static async Task<string?> ValidateMainAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return WorkflowErrors.MainFileMissing;
        }

        var (name, extension) = Normalize(file.FileName);
        if (name.Length == 0 || !AllowedContentTypes.ContainsKey(extension))
        {
            return WorkflowErrors.FileTypeNotAllowed;
        }

        if (file.Length > MaxFileBytes)
        {
            return WorkflowErrors.FileTooLarge;
        }

        return await MatchesExtensionAsync(file, extension) ? null : WorkflowErrors.FileContentMismatch;
    }

    public static async Task<string?> ValidateSupportingAsync(IReadOnlyList<IFormFile> files)
    {
        if (files.Count > MaxSupportingFiles)
        {
            return WorkflowErrors.TooManyFiles;
        }

        foreach (var file in files)
        {
            var (name, extension) = Normalize(file.FileName);
            if (name.Length == 0 || !SupportingContentTypes.ContainsKey(extension))
            {
                return WorkflowErrors.FileTypeNotAllowed;
            }

            if (file.Length == 0 || file.Length > MaxFileBytes)
            {
                return file.Length == 0 ? WorkflowErrors.FileContentMismatch : WorkflowErrors.FileTooLarge;
            }

            if (!await MatchesExtensionAsync(file, extension))
            {
                return WorkflowErrors.FileContentMismatch;
            }
        }

        return null;
    }

    /// A package is opened; a PDF and an image are matched against their signature. The stream is
    /// buffered because IFormFile's stream is forward-only and the inspector must read it whole.
    private static async Task<bool> MatchesExtensionAsync(IFormFile file, string extension)
    {
        await using var stream = file.OpenReadStream();

        switch (extension.ToLowerInvariant())
        {
            case ".docx":
            case ".pptx":
            {
                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer);
                buffer.Position = 0;
                var kind = extension.Equals(".docx", StringComparison.OrdinalIgnoreCase)
                    ? OfficePackageKind.Word
                    : OfficePackageKind.Presentation;
                return OfficePackageInspector.Inspect(buffer, kind);
            }
            case ".pdf":
                return await StartsWithAsync(stream, PdfSignature);
            case ".png":
                return await StartsWithAsync(stream, PngSignature);
            case ".jpg":
            case ".jpeg":
                return await StartsWithAsync(stream, JpegSignature);
            default:
                return false;
        }
    }

    private static async Task<bool> StartsWithAsync(Stream stream, byte[] signature)
    {
        var header = new byte[signature.Length];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false);
        return read == header.Length && header.AsSpan().SequenceEqual(signature);
    }

    public static string ContentTypeFor(IFormFile file, SubmissionFileKind kind)
    {
        var (_, extension) = Normalize(file.FileName);

        // A supporting file is still served as application/octet-stream on download, whatever it
        // is: being a real PNG does not make it safe to render in place. This value is what is
        // stored, and the download endpoint overrides it for supporting files as it already does.
        return kind == SubmissionFileKind.Main && AllowedContentTypes.TryGetValue(extension, out var contentType)
            ? contentType
            : "application/octet-stream";
    }
```

Delete the `BlockedExtensions` set and the now-unused `ZipSignature` field.

- [ ] **Step 4: Await the supporting validator at its call site**

In `Services/StudentWorkflowService.SubmitAsync`, change

```csharp
        var supportingError = SubmissionFileRules.ValidateSupporting(supportingFiles);
```

to

```csharp
        var supportingError = await SubmissionFileRules.ValidateSupportingAsync(supportingFiles);
```

- [ ] **Step 5: Make the 413 neutral**

In `Errors/CommonErrors.cs`, add the code and its definition:

```csharp
    public const string RequestTooLarge = "request.tooLarge";
```

```csharp
        new(RequestTooLarge, StatusCodes.Status413PayloadTooLarge, "The upload is larger than this form allows.")
```

In `Program.cs`, in the exception handler, change the 413 mapping:

```csharp
        StatusCodes.Status413PayloadTooLarge => CommonErrors.RequestTooLarge,
```

`OnboardingErrors.ImportFileTooLarge` stays exactly as it is: a CSV that arrives intact and is over 1 MB is still refused by `StudentImportService` with its own specific message.

- [ ] **Step 6: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 7: Record the test gaps**

Append to the `## Phase 8` section:

```markdown
### Uploads
- `OfficePackageInspector.Inspect` rejects: a non-ZIP, a ZIP without `[Content_Types].xml`, a ZIP with `[Content_Types].xml` but no `word/` part when Word is expected, a .jar, more than 1,000 entries, expansion past 100 MB, `word/*.xml` past 20 MB, XML nested past 128 levels. Accepts a real .docx and a real .pptx (with the right kind).
- A .jar renamed .docx is refused as `file.contentMismatch` on both the main and the supporting path.
- Supporting files: .png/.jpg/.jpeg/.pdf/.docx/.pptx accepted when genuine; .txt, .zip, .xlsx refused as `file.typeNotAllowed`; a .png whose bytes are not PNG refused as `file.contentMismatch`; a fourth file refused as `file.tooMany`.
- `ContentTypeFor` returns octet-stream for every supporting file including a genuine PNG.
- A request over the route's size limit answers 413 `request.tooLarge`, and a 1.5 MB CSV import still answers `import.tooLarge`.
```

---

### Task 4: One identity per student, and conflicts that name the right field

Implements §5.1 and §5.2.

**Files:**
- Modify: `backend/DiplomaTracker.Api/Services/IdentityNormalizer.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/StudentProfile.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentImportService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AuthService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs`
- Modify: `backend/DiplomaTracker.Api/Services/FacultyService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DepartmentService.cs`

**Interfaces:**
- Produces: `IdentityNormalizer.StudentNumberCanonical(string) → string`; `StudentProfile.StudentNumberCanonical`.
- Consumes: `SecurityLog` (Task 1).

- [ ] **Step 1: Define the canonical form**

In `Services/IdentityNormalizer.cs`, keep `StudentNumber` (it still trims and upper-cases what is displayed) and add:

```csharp
    /// Phase 8 §5.1. A student number is typed from a printed list or pasted from a spreadsheet,
    /// in a country where Latin and Cyrillic share a dozen glyphs: "KB123", "KB 123" and Cyrillic
    /// "KB123" are one student on paper and three rows in a database that compares strings. This
    /// is the comparison form - stored beside the number as entered, never shown.
    private static readonly Dictionary<char, char> CyrillicLookalikes = new()
    {
        ['А'] = 'A', ['В'] = 'B', ['Е'] = 'E', ['І'] = 'I', ['К'] = 'K', ['М'] = 'M',
        ['Н'] = 'H', ['О'] = 'O', ['Р'] = 'P', ['С'] = 'C', ['Т'] = 'T', ['У'] = 'Y',
        ['Х'] = 'X'
    };

    private static readonly char[] StrippedSeparators = ['-', '_', '/', '.'];

    public static string StudentNumberCanonical(string value)
    {
        var upper = value.Trim().ToUpperInvariant();
        var builder = new System.Text.StringBuilder(upper.Length);

        foreach (var character in upper)
        {
            if (char.IsWhiteSpace(character) || Array.IndexOf(StrippedSeparators, character) >= 0)
            {
                continue;
            }

            builder.Append(CyrillicLookalikes.TryGetValue(character, out var latin) ? latin : character);
        }

        return builder.ToString();
    }
```

Upper-casing first means the lowercase Cyrillic forms are folded too, so only the uppercase pairs need listing.

- [ ] **Step 2: Store it**

In `Entities/StudentProfile.cs`, add beneath `StudentNumber`:

```csharp
    public string StudentNumberCanonical { get; set; } = string.Empty;
```

In `Data/AppDbContext.cs`, in the `studentProfile` block, add the property configuration and **move the unique index**:

```csharp
        studentProfile.Property(x => x.StudentNumberCanonical).IsRequired().HasMaxLength(64);
        studentProfile.HasIndex(x => x.StudentNumberCanonical).IsUnique();
```

and delete `studentProfile.HasIndex(x => x.StudentNumber).IsUnique();`. Keep `StudentNumber` required with its existing max length, now without an index.

- [ ] **Step 3: Write it on every path that sets a number**

`StudentService.CreateStudentAsync` (~line 51) — replace the lookup and the assignment:

```csharp
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);
        var canonicalNumber = IdentityNormalizer.StudentNumberCanonical(request.StudentNumber);

        if (canonicalNumber.Length == 0)
        {
            return (null, CommonErrors.ValidationFailed);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumberCanonical == canonicalNumber))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }
```

and in the `new StudentProfile { … }` initialiser, beside `StudentNumber = studentNumber,` add `StudentNumberCanonical = canonicalNumber,`.

`StudentService.UpdateStudentAsync` (~line 132) — the same pair, with the existing `p.Id != profile.Id` exclusion:

```csharp
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);
        var canonicalNumber = IdentityNormalizer.StudentNumberCanonical(request.StudentNumber);

        if (canonicalNumber.Length == 0)
        {
            return (null, CommonErrors.ValidationFailed);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumberCanonical == canonicalNumber && p.Id != profile.Id))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }
```

and beside `profile.StudentNumber = studentNumber;` add `profile.StudentNumberCanonical = canonicalNumber;`.

`AuthService.ClaimAccountAsync` (~line 83) — claiming compares canonical forms, so a student who types their number with a space or in the other alphabet still finds their account:

```csharp
        var studentNumber = IdentityNormalizer.StudentNumberCanonical(request.StudentNumber);

        var profile = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.StudentNumberCanonical == studentNumber
                && p.User.Email == email
                && p.User.Role == "Student"
                && p.User.IsActive
                && p.User.PasswordHash == null);
```

`DbSeeder` — beside `StudentNumber = "SEED-0001",` add `StudentNumberCanonical = IdentityNormalizer.StudentNumberCanonical("SEED-0001"),` (which is `SEED0001`).

- [ ] **Step 4: Make the import compare canonical forms**

In `StudentImportService`, the parsed row keeps the number as entered and gains the canonical form. In the record at ~line 309 add a field:

```csharp
    private sealed record ParsedRow(
        int RowNumber,
        string LastName,
        string FirstName,
        string? Patronymic,
        string Email,
        string StudentNumber,
        string StudentNumberCanonical);
```

At ~line 246, where the row is built:

```csharp
            var studentNumberRaw = Value(StudentNumberColumn);
            var studentNumber = IdentityNormalizer.StudentNumber(studentNumberRaw);
            var studentNumberCanonical = IdentityNormalizer.StudentNumberCanonical(studentNumberRaw);
```

and pass both into `ParsedRow`. Reject a row whose canonical form is empty with the same validation failure the row already uses for a missing number.

Replace the in-use lookup at ~line 87:

```csharp
        var canonicalNumbers = rows.Select(r => r.StudentNumberCanonical).ToList();
        var numbersInUse = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => canonicalNumbers.Contains(p.StudentNumberCanonical))
            .Select(p => new { p.StudentNumberCanonical, p.StudentNumber })
            .ToListAsync();
        var numbersInUseSet = numbersInUse.ToDictionary(x => x.StudentNumberCanonical, x => x.StudentNumber);
```

At ~line 111 compare canonical forms (`existingUser.StudentProfile.StudentNumberCanonical != row.StudentNumberCanonical`), and at ~line 120 look the clash up in the dictionary so the error names **the number as it was already entered**, letting the registrar see the two spellings side by side:

```csharp
            else if (numbersInUseSet.TryGetValue(row.StudentNumberCanonical, out var existingNumber))
            {
                // row error: OnboardingErrors.StudentNumberTaken, detail = existingNumber
            }
```

Follow the shape the surrounding code already uses for a row error; the detail goes into the row's existing message field, not a new one. At ~line 157, set both properties on the new profile. Also guard a file that repeats the same canonical number on two rows: the second row fails the same way.

- [ ] **Step 5: Name the field that actually conflicts**

In `FacultyService`, both `CreateFacultyAsync` and `UpdateFacultyAsync` currently answer from one combined lookup. Replace each with two independent checks, name first:

```csharp
        if (await _dbContext.Faculties.AnyAsync(f => f.Id != id && f.Name == name))
        {
            return (null, AcademicStructureErrors.FacultyNameTaken);
        }

        if (await _dbContext.Faculties.AnyAsync(f => f.Id != id && f.ShortName == shortName))
        {
            return (null, AcademicStructureErrors.FacultyShortNameTaken);
        }
```

(On create there is no `id`; drop that clause.) Do the same in `DepartmentService`, with the `FacultyId` scope both indexes use:

```csharp
        if (await _dbContext.Departments.AnyAsync(d => d.Id != id && d.FacultyId == facultyId && d.Name == name))
        {
            return (null, AcademicStructureErrors.DepartmentNameTaken);
        }

        if (await _dbContext.Departments.AnyAsync(d => d.Id != id && d.FacultyId == facultyId && d.ShortName == shortName))
        {
            return (null, AcademicStructureErrors.DepartmentShortNameTaken);
        }
```

Where the service also catches a unique-constraint violation from `SaveChangesAsync` as a fallback, leave that fallback in place and keep its current code — the race it covers is unchanged.

- [ ] **Step 6: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

The migration is **not** regenerated here — Task 19 regenerates `InitialCreate` once, after every schema change in this plan is in place. The API will not start against the existing database until then; that is expected, and no task before 19 needs it running.

- [ ] **Step 7: Record the test gaps**

```markdown
### Identity and structure
- `StudentNumberCanonical`: "KB 123", "kb-123", "КВ123" (Cyrillic К and В) and "K B 1 2 3" all fold to "KB123"; "SEED-0001" folds to "SEED0001"; an empty or whitespace-only value folds to "".
- Creating a second student with a lookalike number answers `student.numberTaken`.
- Claiming with a spaced or Cyrillic spelling of the stored number succeeds.
- An import file with two rows whose numbers differ only by alphabet fails the second row and names the first row's number as entered.
- A faculty colliding on name with one row and on short name with another answers `faculty.nameTaken`; colliding on short name only answers `faculty.shortNameTaken`. Same for departments, scoped per faculty.
```

---

> **Owner checkpoint — after Task 4.** Report what was built and ask whether to continue or stop and write a handoff.

---

### Task 5: One source of truth for a student's topic

Implements §5.3, and §8's second paragraph (the topic projection) — the two are one edit, because both rewrite `TopicService.Projection`.

**Files:**
- Modify: `backend/DiplomaTracker.Api/Entities/Topic.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TopicService.cs`

**Interfaces:**
- Produces: `Topic.Holders` navigation; `TopicResponse` unchanged on the wire (same property names and meanings).
- Consumes: nothing from earlier tasks.

The rule this task establishes: **`StudentProfile.TopicId` says which topic a student holds. `TopicReservations` is the history of how they got there, plus any pending request.** No read derives a *current* topic from a reservation; a *pending request* is still a reservation, because that is what a request is.

- [ ] **Step 1: Give a topic its holder**

In `Entities/Topic.cs`, add beneath `Reservations`:

```csharp
    /// The student who holds this topic, as a collection because EF cannot model the
    /// relationship one-to-one: StudentProfile.TopicId is guarded by a FILTERED unique index
    /// (SQL Server allows only one NULL in a plain unique index, and most students have none).
    /// It contains at most one profile, and the filtered index is what guarantees that.
    public ICollection<StudentProfile> Holders { get; set; } = new List<StudentProfile>();
```

In `Data/AppDbContext.cs`, change the student-profile topic relationship from `.WithMany()` to name the inverse:

```csharp
        studentProfile.HasOne(x => x.Topic)
            .WithMany(x => x.Holders)
            .HasForeignKey(x => x.TopicId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
```

This changes no column and no index — only how EF navigates an existing foreign key.

- [ ] **Step 2: Rewrite the row and the projection**

In `Services/TopicService.cs`, replace the `TopicRow` class and the `Projection` field.

```csharp
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
        public TopicPartyRow? Holder { get; init; }
        public TopicPartyRow? Request { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }

    /// One party on a topic: the student who holds it, or the student asking for it.
    private sealed class TopicPartyRow
    {
        public Guid? ReservationId { get; init; }
        public Guid StudentProfileId { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;

        public string Name => LastName + " " + FirstName;
    }

    /// Phase 8 §5.3 and §8. The holder comes from StudentProfile.TopicId - the source of truth -
    /// and the pending request from TopicReservations, which is what a request actually is.
    ///
    /// Both are projected as one nested object each, so SQL Server plans two OUTER APPLYs rather
    /// than the five correlated scalar subqueries this used to issue per topic row (reservation
    /// id, status, student id, student name and group code, each its own scan).
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
        Holder = t.Holders
            .Select(p => new TopicPartyRow
            {
                ReservationId = p.TopicReservations
                    .Where(r => r.Status == ReservationStatus.Approved)
                    .Select(r => (Guid?)r.Id)
                    .FirstOrDefault(),
                StudentProfileId = p.Id,
                LastName = p.User.LastName,
                FirstName = p.User.FirstName,
                GroupCode = p.Group.Code
            })
            .FirstOrDefault(),
        Request = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending)
            .Select(r => new TopicPartyRow
            {
                ReservationId = r.Id,
                StudentProfileId = r.StudentProfileId,
                LastName = r.StudentProfile.User.LastName,
                FirstName = r.StudentProfile.User.FirstName,
                GroupCode = r.StudentProfile.Group.Code
            })
            .FirstOrDefault(),
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt
    };
```

- [ ] **Step 3: Map the two parties back onto the unchanged response**

`TopicResponse` keeps every property it has today, so no client changes. A topic with a holder reports that holder; a topic with only a request reports the requester. Replace `ToResponse`:

```csharp
    private static TopicResponse ToResponse(TopicRow row, UserContext user)
    {
        var showStudent = !user.IsStudent;

        // The holder wins: a topic can be held by one student and requested by another only
        // through an administrator's assignment, and the holder is the topic's real state.
        var party = row.Holder ?? row.Request;
        var partyStatus = row.Holder is not null ? ReservationStatus.Approved : ReservationStatus.Pending;

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
            ActiveReservationId = party?.ReservationId,
            ActiveReservationStatus = party is null ? null : partyStatus.ToString(),
            StudentProfileId = showStudent ? party?.StudentProfileId : null,
            StudentName = showStudent ? party?.Name : null,
            GroupCode = showStudent ? party?.GroupCode : null,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }
```

- [ ] **Step 4: Derive a student's own topics from the column**

`LoadStudentAsync` gains the held topic id — replace the record and the method:

```csharp
    private sealed record StudentScope(Guid Id, Guid DepartmentId, Guid? TopicId);
```

```csharp
    private async Task<StudentScope?> LoadStudentAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => new StudentScope(p.Id, p.Group.DepartmentId, p.TopicId))
            .FirstOrDefaultAsync();
    }
```

In `GetTopicsAsync`, replace the `ownTopicIds` block with the column plus the pending request:

```csharp
            // The topic the student HOLDS comes from their profile (§5.3); a topic they have
            // REQUESTED is a pending reservation, which is what a request is. Both stay visible
            // in the catalogue, because a student mid-change-request must see the one they hold
            // and the one they want.
            var requestedTopicId = await _dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.StudentProfileId == student.Id && r.Status == ReservationStatus.Pending)
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

            topics = topics.Where(t =>
                ownTopicIds.Contains(t.Id)
                || (t.DepartmentId == student.DepartmentId
                    && t.Origin == TopicOrigin.Catalogue
                    && t.Status == TopicStatus.Available
                    && t.Supervisor.IsActive));
```

In `GetTopicAsync`, replace the `isOwn` line:

```csharp
            var isOwn = row.Holder?.StudentProfileId == student.Id || row.Request?.StudentProfileId == student.Id;
```

- [ ] **Step 5: Check the remaining reservation reads**

Run:

```bash
grep -rn "Reservations" backend/DiplomaTracker.Api/Services/ backend/DiplomaTracker.Api/Controllers/
```

Every remaining hit must be one of: `ReservationService` (the writer and the history reader — unchanged), the pending-request read added in Step 4, or the projection's `Request`. Anything else that answers *"which topic does this student hold"* from a reservation is a violation of §5.3 — change it to read `StudentProfile.TopicId`. Record what you found in the task report.

`DocumentTemplateService.DefaultTopicAsync` is expected to read a pending reservation: a student generating an application before their request is approved is filling it from the topic they have *requested*, which is deliberate (phase 6, commit `182caa1`). Leave it.

- [ ] **Step 6: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 7: Record the test gaps**

```markdown
### Topic source of truth
- A student holding topic A with a pending request for topic B sees both in the catalogue and neither disappears.
- An administrator's topic list shows the holder for an approved topic and the requester for a pending one.
- A student never sees `studentProfileId`, `studentName` or `groupCode` on any topic.
- `GetTopicAsync` treats a student's held topic and their requested topic as their own, and refuses a catalogue topic from another department.
- The topic list issues two OUTER APPLYs, not five correlated subqueries (verify by reading the generated SQL with EF logging, not by asserting on it).
```

---

### Task 6: The archive, and what fills it

Implements §4.1–§4.4 and §4.7.

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/ArchivedGroup.cs`
- Create: `backend/DiplomaTracker.Api/Entities/ArchivedGroupReviewer.cs`
- Create: `backend/DiplomaTracker.Api/Entities/ArchivedFile.cs`
- Create: `backend/DiplomaTracker.Api/Services/ArchiveErrors.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IArchiveService.cs`
- Create: `backend/DiplomaTracker.Api/Services/ArchiveService.cs` (write half; the read half is Task 7)
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IGroupService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/GroupsController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Produces: `IArchiveService.ArchiveGroupAsync(Guid groupId, CancellationToken) → Task<int>` (files archived), `IArchiveService.ArchiveStudentsAsync(IReadOnlyList<Guid> studentProfileIds, CancellationToken) → Task<int>`; `ArchiveErrors.NotFound`; `GroupService.DeleteGroupAsync(Guid id, Guid administratorId, CancellationToken)` (signature changed).
- Consumes: `SecurityLog` (Task 1).

- [ ] **Step 1: Create the entities**

`Entities/ArchivedGroup.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Phase 8 §4.2. The archive refers to nothing: every name, code and decision is copied in as
/// text at the moment of archiving, and there is no foreign key to a group, a student, a step or
/// a user - because each of those may be deleted afterwards, and the archive must still answer.
public class ArchivedGroup
{
    public Guid Id { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;

    /// Set when the group itself was deleted; null when the archive holds only copies made as
    /// individual students were archived.
    public DateTime? GroupDeletedAt { get; set; }

    /// The live group this archive was built from, kept only so a second archiving event for the
    /// same group finds the same row. It is deliberately NOT a foreign key: the group it names
    /// is usually gone.
    public Guid SourceGroupId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<ArchivedGroupReviewer> Reviewers { get; set; } = new List<ArchivedGroupReviewer>();
    public ICollection<ArchivedFile> Files { get; set; } = new List<ArchivedFile>();
}
```

`Entities/ArchivedGroupReviewer.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// Who, besides an administrator, may read this archive. The live GroupReviewers rows are
/// deleted with the group, so the ids are copied in here at archive time (§4.5).
public class ArchivedGroupReviewer
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;
    public Guid ReviewerId { get; set; }
    public string ReviewerName { get; set; } = string.Empty;
}
```

`Entities/ArchivedFile.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class ArchivedFile
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;

    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }

    /// "Approved", "Returned" or null for a submission that was never decided.
    public string? Decision { get; set; }
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? DecidedAt { get; set; }

    /// "Main" or "Supporting".
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }

    /// The same key the live SubmissionFile uses. The archive does not copy bytes (§4.4); a
    /// stored file is deleted only when nothing points at it any more.
    public string StorageKey { get; set; } = string.Empty;

    public DateTime ArchivedAt { get; set; }
}
```

- [ ] **Step 2: Map them**

In `Data/AppDbContext.cs`, add the three `DbSet` properties beside the existing ones:

```csharp
    public DbSet<ArchivedGroup> ArchivedGroups => Set<ArchivedGroup>();
    public DbSet<ArchivedGroupReviewer> ArchivedGroupReviewers => Set<ArchivedGroupReviewer>();
    public DbSet<ArchivedFile> ArchivedFiles => Set<ArchivedFile>();
```

and, at the end of `OnModelCreating`, the configuration:

```csharp
        var archivedGroup = modelBuilder.Entity<ArchivedGroup>();
        archivedGroup.ToTable("ArchivedGroups");
        archivedGroup.HasKey(x => x.Id);
        archivedGroup.Property(x => x.GroupCode).HasMaxLength(32).IsRequired();
        archivedGroup.Property(x => x.AcademicYear).HasMaxLength(20).IsRequired();
        archivedGroup.Property(x => x.DepartmentName).HasMaxLength(200).IsRequired();
        archivedGroup.Property(x => x.FacultyName).HasMaxLength(200).IsRequired();
        archivedGroup.Property(x => x.CreatedAt).IsRequired();
        archivedGroup.Property(x => x.UpdatedAt).IsRequired();
        archivedGroup.HasIndex(x => x.SourceGroupId).IsUnique();
        archivedGroup.HasIndex(x => new { x.AcademicYear, x.GroupCode });

        var archivedReviewer = modelBuilder.Entity<ArchivedGroupReviewer>();
        archivedReviewer.ToTable("ArchivedGroupReviewers");
        archivedReviewer.HasKey(x => x.Id);
        archivedReviewer.Property(x => x.ReviewerName).HasMaxLength(300).IsRequired();
        archivedReviewer.HasIndex(x => new { x.ArchivedGroupId, x.ReviewerId }).IsUnique();
        archivedReviewer.HasIndex(x => x.ReviewerId);
        archivedReviewer.HasOne(x => x.ArchivedGroup)
            .WithMany(x => x.Reviewers)
            .HasForeignKey(x => x.ArchivedGroupId)
            .OnDelete(DeleteBehavior.Cascade);

        var archivedFile = modelBuilder.Entity<ArchivedFile>();
        archivedFile.ToTable("ArchivedFiles");
        archivedFile.HasKey(x => x.Id);
        archivedFile.Property(x => x.StudentName).HasMaxLength(300).IsRequired();
        archivedFile.Property(x => x.StudentNumber).HasMaxLength(32).IsRequired();
        archivedFile.Property(x => x.StepTitle).HasMaxLength(300).IsRequired();
        archivedFile.Property(x => x.Decision).HasMaxLength(50);
        archivedFile.Property(x => x.ReviewerName).HasMaxLength(300);
        archivedFile.Property(x => x.ReviewerComment).HasMaxLength(2000);
        archivedFile.Property(x => x.Kind).HasMaxLength(50).IsRequired();
        archivedFile.Property(x => x.OriginalName).HasMaxLength(255).IsRequired();
        archivedFile.Property(x => x.ContentType).HasMaxLength(200).IsRequired();
        archivedFile.Property(x => x.StorageKey).HasMaxLength(200).IsRequired();
        archivedFile.Property(x => x.ArchivedAt).IsRequired();
        // Archiving a student and later deleting their group would otherwise write the same file
        // twice. The service skips keys that are already present; this index is what makes that
        // guarantee hold under a race.
        archivedFile.HasIndex(x => new { x.ArchivedGroupId, x.StorageKey }).IsUnique();
        archivedFile.HasIndex(x => new { x.ArchivedGroupId, x.StudentName, x.StepOrder, x.Version });
        archivedFile.HasOne(x => x.ArchivedGroup)
            .WithMany(x => x.Files)
            .HasForeignKey(x => x.ArchivedGroupId)
            .OnDelete(DeleteBehavior.Cascade);
```

- [ ] **Step 3: Add the error codes**

Create `Services/ArchiveErrors.cs`:

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class ArchiveErrors
{
    public const string NotFound = "archive.notFound";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Archived item not found.")
    ];
}
```

In `Errors/ErrorCatalog.cs`, add `ArchiveErrors.All,` to the `areas` array.

- [ ] **Step 4: Write the archive service's write half**

Create `Interfaces/IArchiveService.cs` with the two write methods for now; Task 7 adds the read methods to the same interface.

```csharp
namespace DiplomaTracker.Api.Interfaces;

public interface IArchiveService
{
    /// Copies every submitted file of every student in the group into the archive and marks the
    /// archive as belonging to a deleted group. Adds nothing that is already there. Does not
    /// delete anything; the caller owns the transaction. Returns the number of files archived.
    Task<int> ArchiveGroupAsync(Guid groupId, CancellationToken cancellationToken);

    /// Copies the submitted files of the named students into their group's archive, leaving the
    /// live rows untouched. Returns the number of files archived.
    Task<int> ArchiveStudentsAsync(IReadOnlyList<Guid> studentProfileIds, CancellationToken cancellationToken);
}
```

Create `Services/ArchiveService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class ArchiveService : IArchiveService
{
    private readonly AppDbContext _dbContext;
    private readonly IFileStorage _storage;
    private readonly ILogger<ArchiveService> _logger;

    public ArchiveService(AppDbContext dbContext, IFileStorage storage, ILogger<ArchiveService> logger)
    {
        _dbContext = dbContext;
        _storage = storage;
        _logger = logger;
    }

    public Task<int> ArchiveGroupAsync(Guid groupId, CancellationToken cancellationToken) =>
        ArchiveAsync(groupId, studentProfileIds: null, markGroupDeleted: true, cancellationToken);

    public async Task<int> ArchiveStudentsAsync(IReadOnlyList<Guid> studentProfileIds, CancellationToken cancellationToken)
    {
        if (studentProfileIds.Count == 0)
        {
            return 0;
        }

        // Students may span several groups (a bulk archive from the students page), and the
        // archive is organised by group, so each group is handled on its own.
        var byGroup = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => studentProfileIds.Contains(p.Id))
            .Select(p => new { p.Id, p.GroupId })
            .ToListAsync(cancellationToken);

        var archived = 0;
        foreach (var group in byGroup.GroupBy(x => x.GroupId))
        {
            archived += await ArchiveAsync(
                group.Key,
                group.Select(x => x.Id).ToList(),
                markGroupDeleted: false,
                cancellationToken);
        }

        return archived;
    }

    private async Task<int> ArchiveAsync(
        Guid groupId,
        IReadOnlyList<Guid>? studentProfileIds,
        bool markGroupDeleted,
        CancellationToken cancellationToken)
    {
        var group = await _dbContext.Groups.AsNoTracking()
            .Where(g => g.Id == groupId)
            .Select(g => new
            {
                g.Id,
                g.Code,
                g.AcademicYear,
                DepartmentName = g.Department.Name,
                FacultyName = g.Department.Faculty.Name
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (group is null)
        {
            return 0;
        }

        var now = DateTime.UtcNow;

        var archive = await _dbContext.ArchivedGroups
            .Include(a => a.Reviewers)
            .FirstOrDefaultAsync(a => a.SourceGroupId == groupId, cancellationToken);

        if (archive is null)
        {
            archive = new ArchivedGroup
            {
                Id = Guid.NewGuid(),
                SourceGroupId = group.Id,
                GroupCode = group.Code,
                AcademicYear = group.AcademicYear,
                DepartmentName = group.DepartmentName,
                FacultyName = group.FacultyName,
                CreatedAt = now,
                UpdatedAt = now
            };
            _dbContext.ArchivedGroups.Add(archive);
        }
        else
        {
            archive.UpdatedAt = now;
        }

        if (markGroupDeleted)
        {
            archive.GroupDeletedAt = now;
        }

        // The live reviewer rows go with the group, so who may read this archive is copied in
        // now (§4.5). Reviewers added since a previous archiving event are picked up here too.
        var reviewers = await _dbContext.GroupReviewers.AsNoTracking()
            .Where(r => r.GroupId == groupId)
            .Select(r => new { r.ReviewerId, r.Reviewer.LastName, r.Reviewer.FirstName, r.Reviewer.Patronymic })
            .ToListAsync(cancellationToken);

        var knownReviewerIds = archive.Reviewers.Select(r => r.ReviewerId).ToHashSet();
        foreach (var reviewer in reviewers.Where(r => !knownReviewerIds.Contains(r.ReviewerId)))
        {
            archive.Reviewers.Add(new ArchivedGroupReviewer
            {
                Id = Guid.NewGuid(),
                ArchivedGroupId = archive.Id,
                ReviewerId = reviewer.ReviewerId,
                ReviewerName = string.Join(' ', new[] { reviewer.LastName, reviewer.FirstName, reviewer.Patronymic }
                    .Where(part => !string.IsNullOrWhiteSpace(part)))
            });
        }

        var filesQuery = _dbContext.SubmissionFiles.AsNoTracking()
            .Where(f => f.Submission.StudentTask.StudentProfile.GroupId == groupId
                && f.Submission.StudentTask.GroupTask.GroupId == groupId);

        if (studentProfileIds is not null)
        {
            filesQuery = filesQuery.Where(f => studentProfileIds.Contains(f.Submission.StudentTask.StudentProfileId));
        }

        var rows = await filesQuery
            .Select(f => new
            {
                f.StorageKey,
                f.OriginalName,
                f.ContentType,
                f.SizeBytes,
                f.Kind,
                StudentLastName = f.Submission.StudentTask.StudentProfile.User.LastName,
                StudentFirstName = f.Submission.StudentTask.StudentProfile.User.FirstName,
                StudentPatronymic = f.Submission.StudentTask.StudentProfile.User.Patronymic,
                f.Submission.StudentTask.StudentProfile.StudentNumber,
                StepTitle = f.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = f.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                f.Submission.StudentTask.GroupTask.Deadline,
                f.Submission.Version,
                f.Submission.SubmittedAt,
                f.Submission.IsLate,
                f.Submission.Decision,
                f.Submission.Mark,
                ReviewerLastName = f.Submission.Reviewer != null ? f.Submission.Reviewer.LastName : null,
                ReviewerFirstName = f.Submission.Reviewer != null ? f.Submission.Reviewer.FirstName : null,
                f.Submission.ReviewerComment,
                f.Submission.DecidedAt
            })
            .ToListAsync(cancellationToken);

        var existingKeys = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.ArchivedGroupId == archive.Id)
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);
        var existing = existingKeys.ToHashSet(StringComparer.Ordinal);

        var added = 0;
        foreach (var row in rows)
        {
            if (!existing.Add(row.StorageKey))
            {
                continue;
            }

            _dbContext.ArchivedFiles.Add(new ArchivedFile
            {
                Id = Guid.NewGuid(),
                ArchivedGroupId = archive.Id,
                StudentName = string.Join(' ', new[] { row.StudentLastName, row.StudentFirstName, row.StudentPatronymic }
                    .Where(part => !string.IsNullOrWhiteSpace(part))),
                StudentNumber = row.StudentNumber,
                StepTitle = row.StepTitle,
                StepOrder = row.StepOrder,
                Deadline = row.Deadline,
                Version = row.Version,
                SubmittedAt = row.SubmittedAt,
                IsLate = row.IsLate,
                Decision = row.Decision != null ? row.Decision.ToString() : null,
                Mark = row.Mark,
                ReviewerName = row.ReviewerLastName == null
                    ? null
                    : string.Join(' ', new[] { row.ReviewerLastName, row.ReviewerFirstName }
                        .Where(part => !string.IsNullOrWhiteSpace(part))),
                ReviewerComment = row.ReviewerComment,
                DecidedAt = row.DecidedAt,
                Kind = row.Kind.ToString(),
                OriginalName = row.OriginalName,
                ContentType = row.ContentType,
                SizeBytes = row.SizeBytes,
                StorageKey = row.StorageKey,
                ArchivedAt = now
            });
            added++;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return added;
    }
}
```

Register it in `Program.cs` beside the other scoped services:

```csharp
builder.Services.AddScoped<IArchiveService, ArchiveService>();
```

- [ ] **Step 5: Archive a student's work when they are archived**

Both archiving paths call the service after `StudentArchiver.Archive` has run and after `SaveChangesAsync`, passing the ids it returned. Nothing live is deleted; this is a copy (§4.3).

In `GroupService.ArchiveGroupStudentsAsync`, inject `IArchiveService _archive` and replace the save block:

```csharp
        var now = DateTime.UtcNow;
        var archivedIds = StudentArchiver.Archive(profiles, now);
        await _dbContext.SaveChangesAsync();
        await _archive.ArchiveStudentsAsync(archivedIds, CancellationToken.None);

        SecurityLog.StudentsArchived(_logger, administratorId, archivedIds.Count, archivedIds);
```

Do the same in `StudentService.ArchiveStudentsAsync`, with its own ids.

- [ ] **Step 6: Delete a group whose students are all archived**

Replace `GroupService.DeleteGroupAsync` entirely, and change its signature in `Interfaces/IGroupService.cs` to `Task<(bool success, string? error)> DeleteGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken);`. In `Controllers/GroupsController.cs`, read the caller with `TryGetCurrentUser` and pass `user.UserId` and `HttpContext.RequestAborted`.

```csharp
    public async Task<(bool success, string? error)> DeleteGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id, cancellationToken);
        if (group is null)
        {
            return (false, GroupErrors.NotFound);
        }

        // Phase 8 §4.7: an ACTIVE student still blocks deletion. Archived ones do not - their
        // work and their record go to the archive, and the empty accounts go with the group.
        var hasActiveStudents = await _dbContext.StudentProfiles
            .AnyAsync(s => s.GroupId == id && s.ArchivedAt == null, cancellationToken);
        if (hasActiveStudents)
        {
            return (false, GroupErrors.HasStudents);
        }

        var groupCode = group.Code;

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        // Archive BEFORE anything is deleted: a failure here leaves the group intact.
        var archivedFileCount = await _archive.ArchiveGroupAsync(id, cancellationToken);

        var profiles = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .Where(p => p.GroupId == id)
            .ToListAsync(cancellationToken);

        var heldTopicIds = profiles.Where(p => p.TopicId is not null).Select(p => p.TopicId!.Value).ToList();

        // Both links are Restrict, so they are cleared and saved before the profiles go.
        foreach (var profile in profiles)
        {
            profile.TopicId = null;
            profile.SupervisorId = null;
        }
        await _dbContext.SaveChangesAsync(cancellationToken);

        var heldTopics = await _dbContext.Topics
            .Where(t => heldTopicIds.Contains(t.Id))
            .ToListAsync(cancellationToken);

        foreach (var topic in heldTopics)
        {
            if (topic.Origin == TopicOrigin.StudentProposal)
            {
                // A proposal exists only for the student who proposed it.
                _dbContext.Topics.Remove(topic);
            }
            else
            {
                topic.Status = TopicStatus.Available;
                topic.UpdatedAt = DateTime.UtcNow;
            }
        }

        // Deleting the user cascades to the profile, its reservations and its student tasks;
        // student tasks cascade to submissions and submission files. The group's own cascade
        // takes its reviewers, group tasks and template links.
        _dbContext.Users.RemoveRange(profiles.Select(p => p.User));
        _dbContext.Groups.Remove(group);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            await transaction.RollbackAsync(cancellationToken);
            return (false, GroupErrors.HasStudents);
        }

        await transaction.CommitAsync(cancellationToken);

        SecurityLog.GroupDeleted(_logger, administratorId, id, groupCode, archivedFileCount, profiles.Count);
        return (true, null);
    }
```

Add `using DiplomaTracker.Api.Interfaces;` if absent and inject `IArchiveService archive` into the constructor.

The files on disk are deliberately **not** deleted here: every one of them is now named by an `ArchivedFile` row (§4.4).

- [ ] **Step 7: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 8: Record the test gaps**

```markdown
### Archive (writing)
- Archiving a student copies their files into their group's archive and leaves every live row in place; restoring them afterwards still shows their whole history.
- Archiving the same student twice adds no second copy (the (ArchivedGroupId, StorageKey) index).
- Deleting a group with one active student is refused with `group.hasStudents`.
- Deleting a group whose students are all archived: archive rows exist for every file before any delete runs; the group, its students' profiles and their user accounts are gone; a catalogue topic they held is `Available` again; a StudentProposal topic they held is deleted.
- A failure during the delete leaves the group, its students and the archive exactly as they were.
- `ArchivedGroup.Reviewers` holds every reviewer the group had, by id and name.
```

---

### Task 7: Reading and purging the archive, and template file safety

Implements §4.5, §4.6 and the archive half of §11.

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Archive/ArchiveResponses.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/ArchiveController.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IArchiveService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ArchiveService.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/DocumentTemplate.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DocumentTemplateService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TemplateErrors.cs`

**Interfaces:**
- Consumes: `IArchiveService` write half (Task 6), `SecurityLog` (Task 1), `StoredFileDownload` (existing, `DTOs/Workflow`).
- Produces: `IArchiveService` read methods; `TemplateErrors.Conflict`.

- [ ] **Step 1: Define the response shapes**

Create `DTOs/Archive/ArchiveResponses.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Archive;

public class ArchivedGroupSummaryResponse
{
    public Guid Id { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public string FacultyName { get; set; } = string.Empty;
    public DateTime? GroupDeletedAt { get; set; }
    public int StudentCount { get; set; }
    public int FileCount { get; set; }
    public long TotalSizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class ArchivedFileResponse
{
    public Guid Id { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int Version { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }
    public string? Decision { get; set; }
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string OriginalName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}

public class ArchivedGroupDetailsResponse : ArchivedGroupSummaryResponse
{
    public IReadOnlyList<string> ReviewerNames { get; set; } = [];
    public IReadOnlyList<ArchivedFileResponse> Files { get; set; } = [];
}

public class ArchiveUsageResponse
{
    public int GroupCount { get; set; }
    public int FileCount { get; set; }
    public long TotalSizeBytes { get; set; }
}
```

- [ ] **Step 2: Extend the interface**

Add to `Interfaces/IArchiveService.cs`:

```csharp
    Task<IReadOnlyList<ArchivedGroupSummaryResponse>> GetGroupsAsync(UserContext user, string? academicYear, string? search);
    Task<(ArchivedGroupDetailsResponse? details, string? error)> GetGroupAsync(UserContext user, Guid id);
    Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken);
    Task<ArchiveUsageResponse> GetUsageAsync();
    Task<(bool success, string? error)> PurgeGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken);
```

with `using DiplomaTracker.Api.DTOs.Archive;`, `using DiplomaTracker.Api.DTOs.Workflow;` and `using DiplomaTracker.Api.Services;`.

- [ ] **Step 3: Implement the read half**

Append to `ArchiveService`:

```csharp
    /// Phase 8 §4.5. An administrator sees every archive; a teacher sees the ones whose stored
    /// reviewer ids include theirs. Everyone else sees nothing - and an archive they may not see
    /// answers exactly like one that does not exist.
    private IQueryable<ArchivedGroup> Visible(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.ArchivedGroups;
        }

        if (user.IsTeacher)
        {
            return _dbContext.ArchivedGroups.Where(a => a.Reviewers.Any(r => r.ReviewerId == user.UserId));
        }

        return _dbContext.ArchivedGroups.Where(_ => false);
    }

    public async Task<IReadOnlyList<ArchivedGroupSummaryResponse>> GetGroupsAsync(UserContext user, string? academicYear, string? search)
    {
        var query = Visible(user).AsNoTracking();

        if (!string.IsNullOrWhiteSpace(academicYear))
        {
            var year = academicYear.Trim();
            query = query.Where(a => a.AcademicYear == year);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = search.Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            query = query.Where(a => EF.Functions.Like(a.GroupCode, $"%{term}%")
                || a.Files.Any(f => EF.Functions.Like(f.StudentName, $"%{term}%")));
        }

        return await query
            .OrderByDescending(a => a.AcademicYear)
            .ThenBy(a => a.GroupCode)
            .Select(a => new ArchivedGroupSummaryResponse
            {
                Id = a.Id,
                GroupCode = a.GroupCode,
                AcademicYear = a.AcademicYear,
                DepartmentName = a.DepartmentName,
                FacultyName = a.FacultyName,
                GroupDeletedAt = a.GroupDeletedAt,
                StudentCount = a.Files.Select(f => f.StudentNumber).Distinct().Count(),
                FileCount = a.Files.Count,
                TotalSizeBytes = a.Files.Sum(f => (long?)f.SizeBytes) ?? 0,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt
            })
            .ToListAsync();
    }

    public async Task<(ArchivedGroupDetailsResponse? details, string? error)> GetGroupAsync(UserContext user, Guid id)
    {
        var details = await Visible(user).AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new ArchivedGroupDetailsResponse
            {
                Id = a.Id,
                GroupCode = a.GroupCode,
                AcademicYear = a.AcademicYear,
                DepartmentName = a.DepartmentName,
                FacultyName = a.FacultyName,
                GroupDeletedAt = a.GroupDeletedAt,
                StudentCount = a.Files.Select(f => f.StudentNumber).Distinct().Count(),
                FileCount = a.Files.Count,
                TotalSizeBytes = a.Files.Sum(f => (long?)f.SizeBytes) ?? 0,
                CreatedAt = a.CreatedAt,
                UpdatedAt = a.UpdatedAt,
                ReviewerNames = a.Reviewers.OrderBy(r => r.ReviewerName).Select(r => r.ReviewerName).ToList(),
                Files = a.Files
                    .OrderBy(f => f.StudentName)
                    .ThenBy(f => f.StepOrder)
                    .ThenBy(f => f.Version)
                    .ThenBy(f => f.Kind)
                    .Select(f => new ArchivedFileResponse
                    {
                        Id = f.Id,
                        StudentName = f.StudentName,
                        StudentNumber = f.StudentNumber,
                        StepTitle = f.StepTitle,
                        StepOrder = f.StepOrder,
                        Deadline = f.Deadline,
                        Version = f.Version,
                        SubmittedAt = f.SubmittedAt,
                        IsLate = f.IsLate,
                        Decision = f.Decision,
                        Mark = f.Mark,
                        ReviewerName = f.ReviewerName,
                        ReviewerComment = f.ReviewerComment,
                        DecidedAt = f.DecidedAt,
                        Kind = f.Kind,
                        OriginalName = f.OriginalName,
                        SizeBytes = f.SizeBytes
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync();

        return details is null ? (null, ArchiveErrors.NotFound) : (details, null);
    }

    public async Task<(StoredFileDownload? file, string? error)> OpenFileAsync(UserContext user, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.Id == fileId)
            .Where(f => Visible(user).Any(a => a.Id == f.ArchivedGroupId))
            .Select(f => new { f.StorageKey, f.OriginalName })
            .FirstOrDefaultAsync(cancellationToken);

        if (file is null)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "ArchivedFile", fileId);
            return (null, ArchiveErrors.NotFound);
        }

        var stream = await _storage.OpenReadAsync(file.StorageKey, cancellationToken);
        if (stream is null)
        {
            return (null, ArchiveErrors.NotFound);
        }

        SecurityLog.FileDownloaded(_logger, user.UserId, fileId, Guid.Empty);

        // Always octet-stream: an archived file is handed to a browser for saving, never rendered.
        return (new StoredFileDownload(stream, "application/octet-stream", file.OriginalName), null);
    }

    public async Task<ArchiveUsageResponse> GetUsageAsync()
    {
        var totals = await _dbContext.ArchivedFiles.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(g => new { FileCount = g.Count(), TotalSizeBytes = g.Sum(f => (long?)f.SizeBytes) ?? 0 })
            .FirstOrDefaultAsync();

        return new ArchiveUsageResponse
        {
            GroupCount = await _dbContext.ArchivedGroups.CountAsync(),
            FileCount = totals == null ? 0 : totals.FileCount,
            TotalSizeBytes = totals == null ? 0 : totals.TotalSizeBytes
        };
    }

    public async Task<(bool success, string? error)> PurgeGroupAsync(Guid id, Guid administratorId, CancellationToken cancellationToken)
    {
        var archive = await _dbContext.ArchivedGroups
            .Include(a => a.Files)
            .FirstOrDefaultAsync(a => a.Id == id, cancellationToken);

        if (archive is null)
        {
            return (false, ArchiveErrors.NotFound);
        }

        var keys = archive.Files.Select(f => f.StorageKey).ToList();
        var fileCount = archive.Files.Count;
        var bytes = archive.Files.Sum(f => f.SizeBytes);

        // Phase 8 §4.4: a stored file is deleted only when nothing points at it any more. A key
        // may still be named by a live SubmissionFile (this archive was a copy made when the
        // student was archived) or by another archived group.
        var stillLive = await _dbContext.SubmissionFiles.AsNoTracking()
            .Where(f => keys.Contains(f.StorageKey))
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);
        var stillArchived = await _dbContext.ArchivedFiles.AsNoTracking()
            .Where(f => f.ArchivedGroupId != id && keys.Contains(f.StorageKey))
            .Select(f => f.StorageKey)
            .ToListAsync(cancellationToken);

        var referenced = stillLive.Concat(stillArchived).ToHashSet(StringComparer.Ordinal);

        _dbContext.ArchivedGroups.Remove(archive);
        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var key in keys.Where(key => !referenced.Contains(key)))
        {
            try
            {
                await _storage.DeleteAsync(key, cancellationToken);
            }
            catch (IOException exception)
            {
                // §11: a blob that cannot be removed does not fail the purge. The rows are gone;
                // the next purge that finds nothing referencing this key collects it.
                _logger.LogWarning(exception, "Archived blob could not be deleted: StorageKey={StorageKey}", key);
            }
        }

        SecurityLog.ArchivePurged(_logger, administratorId, id, fileCount, bytes);
        return (true, null);
    }
```

- [ ] **Step 4: Expose it**

Create `Controllers/ArchiveController.cs`:

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/archive")]
[Authorize(Roles = "Admin,Teacher")]
public class ArchiveController : ApiControllerBase
{
    private readonly IArchiveService _archive;

    public ArchiveController(IArchiveService archive)
    {
        _archive = archive;
    }

    [HttpGet("groups")]
    public async Task<IActionResult> Groups([FromQuery] string? academicYear, [FromQuery] string? search)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _archive.GetGroupsAsync(user, academicYear, search));
    }

    [HttpGet("groups/{id:guid}")]
    public async Task<IActionResult> Group(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (details, error) = await _archive.GetGroupAsync(user, id);
        return details is null ? ErrorResult(error) : Ok(details);
    }

    [HttpGet("files/{id:guid}")]
    public async Task<IActionResult> File(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (file, error) = await _archive.OpenFileAsync(user, id, HttpContext.RequestAborted);
        if (file is null)
        {
            return ErrorResult(error);
        }

        Response.Headers.XContentTypeOptions = "nosniff";
        return File(file.Content, file.ContentType, file.FileName);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("usage")]
    public async Task<IActionResult> Usage() => Ok(await _archive.GetUsageAsync());

    [Authorize(Roles = "Admin")]
    [HttpDelete("groups/{id:guid}")]
    public async Task<IActionResult> Purge(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _archive.PurgeGroupAsync(id, user.UserId, HttpContext.RequestAborted);
        return success ? NoContent() : ErrorResult(error);
    }
}
```

Match the `File(...)` and `Content-Disposition` handling to what the existing submission-file download does, so an archived download behaves identically to a live one (including the RFC 5987 encoded file name the frontend's `parseFileName` expects).

- [ ] **Step 5: Stop a template replacement from overwriting silently**

In `Entities/DocumentTemplate.cs`, add:

```csharp
    public byte[] RowVersion { get; set; } = [];
```

In `Data/AppDbContext.cs`, in the `template` block:

```csharp
        template.Property(x => x.RowVersion).IsRowVersion();
```

In `Services/TemplateErrors.cs`, add the code and its definition:

```csharp
    public const string Conflict = "template.conflict";
```

```csharp
        new(Conflict, StatusCodes.Status409Conflict, "This template was changed by someone else. Reload and try again.")
```

In `DocumentTemplateService`, in the method that replaces a template's file: capture the key being replaced **before** assigning the new one, catch the concurrency failure, and delete the loser.

```csharp
        var replacedKey = template.StorageKey;
        var newKey = await _storage.SaveAsync(stream, cancellationToken);
        template.StorageKey = newKey;
        template.OriginalFileName = safeName;
        template.SizeBytes = content.LongLength;
        template.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            // Someone else replaced the file first. The file just written is ours and nothing
            // references it, so it goes - rather than being left behind as the orphan this whole
            // change exists to prevent (§4.6).
            await _storage.DeleteAsync(newKey, cancellationToken);
            return (null, TemplateErrors.Conflict);
        }

        // Only after the save commits: a rollback must never leave a template pointing at a
        // deleted file.
        if (!string.IsNullOrEmpty(replacedKey) && replacedKey != newKey)
        {
            await _storage.DeleteAsync(replacedKey, cancellationToken);
        }

        SecurityLog.TemplateAction(_logger, actorUserId, "Replaced", template.Id);
```

Adapt the surrounding names to the method's actual locals and return shape; the sequence — capture, save, delete-on-conflict, delete-replaced-after-commit — is what matters. Apply the same post-commit delete to template deletion, which today leaves its file behind for the same reason.

- [ ] **Step 6: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 7: Record the test gaps**

```markdown
### Archive (reading) and templates
- A teacher sees only archives whose stored reviewers include them; an archive they may not see answers 404 `archive.notFound`, identical to a missing id.
- A student receives 403 from every `/api/archive/*` route.
- Purging deletes the rows; a blob still named by a live SubmissionFile or another archived group survives; an unreferenced blob is gone.
- A blob that cannot be deleted logs a warning and does not fail the purge.
- Replacing a template's file with a stale row version answers `template.conflict` and leaves exactly one file on disk.
- A successful replacement deletes the file it replaced.
```

---

### Task 8: Reads that suit a cohort

Implements §8's first and third paragraphs (the topic projection was Task 5).

**Files:**
- Modify: `backend/DiplomaTracker.Api/Services/TopicSettingsService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DepartmentService.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes — every response shape is identical.

- [ ] **Step 1: Read the deadline once per request**

`ITopicSettingsService` is registered scoped, so an instance lives exactly as long as one request. Replace the read in `TopicSettingsService`:

```csharp
    // Phase 8 §8: the deadline is read once per request and held for the lifetime of this
    // scoped instance. A request that checks it five times issues one query; the NEXT request
    // constructs a new instance and reads the database again, so a change to the deadline takes
    // effect immediately. Nothing is cached across requests.
    private bool _deadlineLoaded;
    private DateTime? _deadline;

    public async Task<DateTime?> GetDeadlineAsync()
    {
        if (_deadlineLoaded)
        {
            return _deadline;
        }

        var deadline = await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.TopicSelectionDeadline)
            .FirstOrDefaultAsync();

        _deadline = deadline is null ? null : DateTime.SpecifyKind(deadline.Value, DateTimeKind.Utc);
        _deadlineLoaded = true;
        return _deadline;
    }
```

At the end of `SetDeadlineAsync`, after `SaveChangesAsync`, invalidate the memo so a request that writes and then reads sees its own write:

```csharp
        _deadlineLoaded = false;
        _deadline = null;
```

`IsSelectionOpenAsync` needs no change — it already goes through `GetDeadlineAsync`.

- [ ] **Step 2: Project the group lists**

In `GroupService`, replace `GetGroupsAsync` and `GetGroupByIdAsync` so the query returns the response shape rather than an entity graph:

```csharp
    /// Phase 8 §8: the API returns exactly the columns it sends. This used to materialise a
    /// Group with its Department and Faculty and map afterwards.
    private static readonly Expression<Func<Group, GroupResponse>> GroupProjection = g => new GroupResponse
    {
        Id = g.Id,
        DepartmentId = g.DepartmentId,
        DepartmentName = g.Department.Name,
        FacultyId = g.Department.FacultyId,
        FacultyName = g.Department.Faculty.Name,
        Code = g.Code,
        Description = g.Description,
        AcademicYear = g.AcademicYear,
        CreatedAt = g.CreatedAt,
        UpdatedAt = g.UpdatedAt
    };

    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync(UserContext user)
    {
        return await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .OrderBy(g => g.Code)
            .ThenBy(g => g.AcademicYear)
            .Select(GroupProjection)
            .ToListAsync();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(UserContext user, Guid id)
    {
        return await _accessScope.VisibleGroups(user)
            .AsNoTracking()
            .Where(g => g.Id == id)
            .Select(GroupProjection)
            .FirstOrDefaultAsync();
    }
```

Add `using System.Linq.Expressions;`. Keep `MapGroup` — the create and update paths still map a tracked entity they already hold, and re-querying there would be a second round trip for no gain.

Do the same in `GetGroupStudentsAsync`: replace the three `Include`s with a `Select` into `GroupStudentResponse`, taking the same columns `MapGroupStudent` reads (`User.FirstName/LastName/Email/IsActive`, `User.PasswordHash != null` as `IsClaimed`, `Topic.Title`, `Supervisor.FirstName/LastName/Email`). The group code is already fetched separately; keep that.

- [ ] **Step 3: Project the department lists**

Apply the same change to `DepartmentService`'s list and by-id reads: a static `Expression<Func<Department, DepartmentResponse>>` selecting exactly the response's columns, `Include` removed, `AsNoTracking()` kept. Leave the create, update and delete paths alone.

- [ ] **Step 4: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 5: Record the test gaps**

```markdown
### Reads
- `GetDeadlineAsync` issues one query when called repeatedly within a request, and a fresh instance reads the database again.
- `SetDeadlineAsync` followed by `GetDeadlineAsync` on the same instance returns the new value.
- Group, group-student and department list responses are byte-identical to the pre-change responses for the same data.
- A teacher's group list still contains only groups they review or supervise in.
```

---

> **Owner checkpoint — after Task 8.** Report and ask whether to continue or stop and write a handoff.

---

### Task 9: A paged review queue

Implements §8's last paragraph.

**Files:**
- Create: `backend/DiplomaTracker.Api/Models/PagedResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IStudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/ReviewController.cs`

**Interfaces:**
- Produces: `PagedResponse<T>` (`Items`, `Page`, `PageSize`, `Total`); `IStudentWorkflowService.GetReviewQueueAsync(UserContext, Guid?, bool?, int, int) → Task<PagedResponse<ReviewQueueItem>>` (signature changed).
- Consumes: nothing from earlier tasks. Task 11's teacher dashboard calls this method with `pageSize: 5`.

- [ ] **Step 1: Define the envelope**

Create `Models/PagedResponse.cs`:

```csharp
namespace DiplomaTracker.Api.Models;

/// One page of a list, with the total so a caller can render page controls and a count without
/// a second request. `Page` is 1-based.
public class PagedResponse<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int Total { get; init; }

    public static PagedResponse<T> Empty(int page, int pageSize) =>
        new() { Items = [], Page = page, PageSize = pageSize, Total = 0 };
}
```

- [ ] **Step 2: Page the queue**

In `Interfaces/IStudentWorkflowService.cs`, replace the queue method:

```csharp
    Task<PagedResponse<ReviewQueueItem>> GetReviewQueueAsync(UserContext user, Guid? groupId, bool? late, int page, int pageSize);
```

with `using DiplomaTracker.Api.Models;`. In `StudentWorkflowService`, replace `GetReviewQueueAsync`:

```csharp
    public const int ReviewQueueDefaultPageSize = 25;
    public const int ReviewQueueMaxPageSize = 100;

    public async Task<PagedResponse<ReviewQueueItem>> GetReviewQueueAsync(
        UserContext user,
        Guid? groupId,
        bool? late,
        int page,
        int pageSize)
    {
        // Phase 8 §8: an administrator used to receive every undecided submission in one array.
        // The page is clamped rather than refused - a bad page number is a client mistake, not
        // something a reviewer should see an error for.
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? ReviewQueueDefaultPageSize
            : pageSize > ReviewQueueMaxPageSize ? ReviewQueueMaxPageSize
            : pageSize;

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

        var total = await query.CountAsync();

        var rows = await query
            .OrderBy(s => s.SubmittedAt)
            .ThenBy(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new ReviewQueueItem
            {
                SubmissionId = s.Id,
                StudentTaskId = s.StudentTaskId,
                StudentProfileId = s.StudentTask.StudentProfileId,
                StudentName = s.StudentTask.StudentProfile.User.LastName + " "
                    + s.StudentTask.StudentProfile.User.FirstName
                    + (s.StudentTask.StudentProfile.User.Patronymic == null
                        ? ""
                        : " " + s.StudentTask.StudentProfile.User.Patronymic),
                GroupId = s.StudentTask.StudentProfile.GroupId,
                GroupCode = s.StudentTask.StudentProfile.Group.Code,
                StepTitle = s.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = s.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                Version = s.Version,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate
            })
            .ToListAsync();

        return new PagedResponse<ReviewQueueItem>
        {
            Items = rows,
            Page = page,
            PageSize = pageSize,
            Total = total
        };
    }
```

`ThenBy(s => s.Id)` is not decoration: two submissions made in the same millisecond would otherwise be ordered arbitrarily, and a row could appear on two pages or on none.

The name was previously assembled in memory by `JoinName`. It is now built in the query so the page can be taken in SQL. If `JoinName` has no remaining caller, delete it; if it has, leave it.

- [ ] **Step 3: Take the page from the request**

Replace the action in `Controllers/ReviewController.cs`:

```csharp
    [HttpGet("queue")]
    public async Task<IActionResult> Queue(
        [FromQuery] Guid? groupId,
        [FromQuery] bool? late,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = StudentWorkflowService.ReviewQueueDefaultPageSize)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _workflow.GetReviewQueueAsync(user, groupId, late, page, pageSize));
    }
```

Add `using DiplomaTracker.Api.Services;`.

- [ ] **Step 4: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 5: Record the test gaps**

```markdown
### Review queue
- 60 waiting submissions: page 1 returns 25 with total 60; page 3 returns 10; page 4 returns none with total 60.
- `pageSize=0`, `pageSize=500` and `page=0` are clamped, not refused.
- The group and late filters change the total, and the order is oldest first with the id as a tiebreak.
- A teacher's queue contains only their reviewable students.
```

---

### Task 10: Overdue steps, and lateness counted in steps

Implements §7.1 and §7.2.

**Files:**
- Modify: `backend/DiplomaTracker.Api/DTOs/Workflow/GroupProgressResponse.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Workflow/StudentProgressResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs`

**Interfaces:**
- Produces: `GroupProgressCell.IsOverdue`; `StudentProgressResponse.LateSteps` (replacing `LateSubmissions`); `StudentWorkflowService.IsOverdue(StudentTaskStatus, DateTime, DateTime)`.
- Consumes: nothing from earlier tasks. Task 11 uses the same overdue rule; Task 14 renders the cell.

- [ ] **Step 1: Add the cell flag**

In `DTOs/Workflow/GroupProgressResponse.cs`, add to `GroupProgressCell`:

```csharp
    /// Phase 8 §7.1: past its deadline with nothing awaiting a decision. `IsLate` is fixed on a
    /// submission when it is made, so a step that was NEVER submitted cannot carry it - which is
    /// why a month-overdue step used to look exactly like one that is not due yet.
    public bool IsOverdue { get; set; }
```

- [ ] **Step 2: Rename the student figure**

In `DTOs/Workflow/StudentProgressResponse.cs`, replace `LateSubmissions`:

```csharp
    /// Steps whose current submission was late. A student who submits one step late three times
    /// is late on ONE step (§7.2).
    public int LateSteps { get; set; }
```

- [ ] **Step 3: Compute both**

In `StudentWorkflowService`, add the shared rule near the top of the class:

```csharp
    /// Phase 8 §7.1. Approved is done; Submitted is with a reviewer and not the student's
    /// problem. Pending and Returned past the deadline are overdue. Evaluated against the
    /// server's clock so it never depends on the client's.
    public static bool IsOverdue(StudentTaskStatus status, DateTime deadline, DateTime now) =>
        status != StudentTaskStatus.Approved
        && status != StudentTaskStatus.Submitted
        && deadline < now;
```

In `GetGroupProgressAsync`, add the deadline to the per-task projection and set the flag. The anonymous type gains `Deadline = t.GroupTask.Deadline`, and the cell becomes:

```csharp
                    .Select(t => new GroupProgressCell
                    {
                        GroupTaskId = t!.GroupTaskId,
                        StudentTaskId = t.Id,
                        Status = t.Status.ToString(),
                        Mark = t.Mark,
                        IsLate = t.LatestLate ?? false,
                        IsOverdue = IsOverdue(t.Status, t.Deadline, now)
                    }).ToList()
```

with `var now = DateTime.UtcNow;` taken once at the top of the method, so every cell in one response is judged against the same instant.

In `GetStudentProgressAsync`, replace the `lateSubmissions` count. The current query counts `Submissions` rows; it must count steps instead, which means the per-task projection carries the latest submission's late flag:

```csharp
        var tasks = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => t.StudentProfileId == profile.Id && t.GroupTask.GroupId == profile.GroupId)
            .Select(t => new
            {
                t.Status,
                t.Mark,
                t.GroupTask.Deadline,
                LatestLate = t.Submissions.OrderByDescending(s => s.Version).Select(s => (bool?)s.IsLate).FirstOrDefault()
            })
            .ToListAsync();

        var marks = tasks.Where(t => t.Mark is not null).Select(t => (double)t.Mark!.Value).ToList();
```

and the response field:

```csharp
            LateSteps = tasks.Count(t => t.LatestLate == true),
```

Delete the separate `lateSubmissions` query entirely — its `CountAsync` over `Submissions` is what counted versions.

- [ ] **Step 4: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 5: Record the test gaps**

```markdown
### Overdue and lateness
- A step submitted late three times counts as one late step.
- A step approved after a late submission still counts as late (the latest submission carried the flag).
- `IsOverdue`: Pending past deadline = true; Returned past deadline = true; Submitted past deadline = false; Approved past deadline = false; Pending before deadline = false.
- Every cell in one group-progress response is judged against the same instant.
```

---

### Task 11: The three dashboards

Implements §7.3, §7.4 and §7.5.

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Dashboard/DashboardResponses.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IDashboardService.cs`
- Create: `backend/DiplomaTracker.Api/Services/DashboardService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/DashboardController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `IStudentWorkflowService.GetReviewQueueAsync` (Task 9, five-argument form), `StudentWorkflowService.IsOverdue` (Task 10), `IAccessScope` (existing), `ITopicSettingsService` (existing).
- Produces: `IDashboardService` with `GetStudentAsync`, `GetTeacherAsync`, `GetAdminAsync`.

- [ ] **Step 1: Define the response shapes**

Create `DTOs/Dashboard/DashboardResponses.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Workflow;

namespace DiplomaTracker.Api.DTOs.Dashboard;

public class LatestDecisionResponse
{
    public Guid StudentTaskId { get; set; }
    public Guid SubmissionId { get; set; }
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }

    /// "Approved" or "Returned".
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? ReviewerName { get; set; }
    public string? ReviewerComment { get; set; }
    public DateTime DecidedAt { get; set; }
}

public class StudentDashboardResponse
{
    public StudentProgressResponse Progress { get; set; } = new();
    public LatestDecisionResponse? LatestDecision { get; set; }
}

/// One row of the per-group breakdown both the teacher's and the administrator's page show.
public class DashboardGroupRow
{
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string AcademicYear { get; set; } = string.Empty;
    public string DepartmentName { get; set; } = string.Empty;
    public int StudentCount { get; set; }
    public int ApprovedTopicCount { get; set; }
    public int StepsApproved { get; set; }
    public int StepsTotal { get; set; }
    public int WaitingReviews { get; set; }
    public int LateSteps { get; set; }
    public int OverdueSteps { get; set; }
}

public class OverdueStepRow
{
    public Guid StudentTaskId { get; set; }
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public DateTime Deadline { get; set; }
    public int DaysOverdue { get; set; }
}

public class SupervisedStudentRow
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public string? TopicTitle { get; set; }
    public string? CurrentStepTitle { get; set; }
    public string? CurrentStepStatus { get; set; }
    public DateTime? NextDeadline { get; set; }
}

public class TeacherDashboardResponse
{
    public int WaitingReviews { get; set; }
    public IReadOnlyList<ReviewQueueItem> LatestForReview { get; set; } = [];
    public IReadOnlyList<OverdueStepRow> OverdueSteps { get; set; } = [];
    public IReadOnlyList<SupervisedStudentRow> SupervisedStudents { get; set; } = [];
    public IReadOnlyList<DashboardGroupRow> Groups { get; set; } = [];
}

public class TopicSelectionSummary
{
    public int TotalStudents { get; set; }
    public int WithApprovedTopic { get; set; }
    public int WithPendingRequest { get; set; }
    public int WithoutTopic { get; set; }
    public DateTime? Deadline { get; set; }
    public bool IsOpen { get; set; }
}

public class ReviewBacklogSummary
{
    public int WaitingReviews { get; set; }
    public int WaitingLate { get; set; }
    public int OverdueSteps { get; set; }
}

public class StructureSummary
{
    public int Faculties { get; set; }
    public int Departments { get; set; }
    public int Groups { get; set; }
    public int ActiveStudents { get; set; }
    public int UnclaimedAccounts { get; set; }
    public int Teachers { get; set; }
    public int TopicsAvailable { get; set; }
    public int TopicsReserved { get; set; }
    public int TopicsApproved { get; set; }
}

public class AdminDashboardResponse
{
    public TopicSelectionSummary TopicSelection { get; set; } = new();
    public ReviewBacklogSummary ReviewBacklog { get; set; } = new();
    public StructureSummary Structure { get; set; } = new();
    public IReadOnlyList<DashboardGroupRow> Groups { get; set; } = [];
}
```

- [ ] **Step 2: Declare the service**

Create `Interfaces/IDashboardService.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Dashboard;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDashboardService
{
    Task<(StudentDashboardResponse? dashboard, string? error)> GetStudentAsync(UserContext user);
    Task<TeacherDashboardResponse> GetTeacherAsync(UserContext user);
    Task<AdminDashboardResponse> GetAdminAsync(UserContext user);
}
```

- [ ] **Step 3: Implement it**

Create `Services/DashboardService.cs`. Every read is scoped through `IAccessScope`, so the teacher's page is the administrator's page restricted to what that teacher may see — not a different query with a different rule.

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Dashboard;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class DashboardService : IDashboardService
{
    private const int LatestForReviewCount = 5;
    private const int OverdueStepsCount = 20;

    private readonly AppDbContext _dbContext;
    private readonly IAccessScope _accessScope;
    private readonly IStudentWorkflowService _workflow;
    private readonly ITopicSettingsService _settings;

    public DashboardService(
        AppDbContext dbContext,
        IAccessScope accessScope,
        IStudentWorkflowService workflow,
        ITopicSettingsService settings)
    {
        _dbContext = dbContext;
        _accessScope = accessScope;
        _workflow = workflow;
        _settings = settings;
    }

    public async Task<(StudentDashboardResponse? dashboard, string? error)> GetStudentAsync(UserContext user)
    {
        var (progress, error) = await _workflow.GetStudentProgressAsync(user, null);
        if (progress is null)
        {
            return (null, error);
        }

        var latest = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.StudentTask.StudentProfile.UserId == user.UserId && s.Decision != null)
            .OrderByDescending(s => s.DecidedAt)
            .ThenByDescending(s => s.Id)
            .Select(s => new LatestDecisionResponse
            {
                StudentTaskId = s.StudentTaskId,
                SubmissionId = s.Id,
                StepTitle = s.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = s.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                Version = s.Version,
                Decision = s.Decision!.ToString()!,
                Mark = s.Mark,
                ReviewerName = s.Reviewer == null ? null : s.Reviewer.LastName + " " + s.Reviewer.FirstName,
                ReviewerComment = s.ReviewerComment,
                DecidedAt = s.DecidedAt!.Value
            })
            .FirstOrDefaultAsync();

        return (new StudentDashboardResponse { Progress = progress, LatestDecision = latest }, null);
    }

    public async Task<TeacherDashboardResponse> GetTeacherAsync(UserContext user)
    {
        var queue = await _workflow.GetReviewQueueAsync(user, null, null, 1, LatestForReviewCount);
        var now = DateTime.UtcNow;

        var overdue = await OverdueStepsAsync(user, now);
        var groups = await GroupRowsAsync(user, now);

        var supervised = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.SupervisorId == user.UserId && p.ArchivedAt == null)
            .OrderBy(p => p.User.LastName)
            .ThenBy(p => p.User.FirstName)
            .Select(p => new SupervisedStudentRow
            {
                StudentProfileId = p.Id,
                StudentName = p.User.LastName + " " + p.User.FirstName,
                GroupId = p.GroupId,
                GroupCode = p.Group.Code,
                TopicTitle = p.Topic == null ? null : p.Topic.Title,
                // The step they are on: the lowest-ordered step that is not approved.
                CurrentStepTitle = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
                    .Select(t => t.GroupTask.DiplomaTaskTemplate.Title)
                    .FirstOrDefault(),
                CurrentStepStatus = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.DiplomaTaskTemplate.Order)
                    .Select(t => t.Status.ToString())
                    .FirstOrDefault(),
                NextDeadline = p.StudentTasks
                    .Where(t => t.Status != StudentTaskStatus.Approved)
                    .OrderBy(t => t.GroupTask.Deadline)
                    .Select(t => (DateTime?)t.GroupTask.Deadline)
                    .FirstOrDefault()
            })
            .ToListAsync();

        return new TeacherDashboardResponse
        {
            WaitingReviews = queue.Total,
            LatestForReview = queue.Items,
            OverdueSteps = overdue,
            SupervisedStudents = supervised,
            Groups = groups
        };
    }

    public async Task<AdminDashboardResponse> GetAdminAsync(UserContext user)
    {
        var now = DateTime.UtcNow;
        var deadline = await _settings.GetDeadlineAsync();

        var students = _dbContext.StudentProfiles.AsNoTracking().Where(p => p.ArchivedAt == null);

        var totalStudents = await students.CountAsync();
        var withTopic = await students.CountAsync(p => p.TopicId != null);
        var withRequest = await students.CountAsync(p =>
            p.TopicId == null && p.TopicReservations.Any(r => r.Status == ReservationStatus.Pending));

        var waiting = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null && s.StudentTask.Status == StudentTaskStatus.Submitted)
            .GroupBy(_ => 1)
            .Select(g => new { Total = g.Count(), Late = g.Count(s => s.IsLate) })
            .FirstOrDefaultAsync();

        var overdueCount = await _dbContext.StudentTasks.AsNoTracking()
            .CountAsync(t => t.StudentProfile.ArchivedAt == null
                && t.Status != StudentTaskStatus.Approved
                && t.Status != StudentTaskStatus.Submitted
                && t.GroupTask.Deadline < now);

        var topics = await _dbContext.Topics.AsNoTracking()
            .GroupBy(t => t.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        return new AdminDashboardResponse
        {
            TopicSelection = new TopicSelectionSummary
            {
                TotalStudents = totalStudents,
                WithApprovedTopic = withTopic,
                WithPendingRequest = withRequest,
                WithoutTopic = totalStudents - withTopic - withRequest,
                Deadline = deadline,
                IsOpen = await _settings.IsSelectionOpenAsync()
            },
            ReviewBacklog = new ReviewBacklogSummary
            {
                WaitingReviews = waiting == null ? 0 : waiting.Total,
                WaitingLate = waiting == null ? 0 : waiting.Late,
                OverdueSteps = overdueCount
            },
            Structure = new StructureSummary
            {
                Faculties = await _dbContext.Faculties.CountAsync(),
                Departments = await _dbContext.Departments.CountAsync(),
                Groups = await _dbContext.Groups.CountAsync(),
                ActiveStudents = totalStudents,
                UnclaimedAccounts = await students.CountAsync(p => p.User.PasswordHash == null),
                Teachers = await _dbContext.Users.CountAsync(u => u.Role == "Teacher" && u.IsActive),
                TopicsAvailable = topics.FirstOrDefault(t => t.Status == TopicStatus.Available)?.Count ?? 0,
                TopicsReserved = topics.FirstOrDefault(t => t.Status == TopicStatus.Reserved)?.Count ?? 0,
                TopicsApproved = topics.FirstOrDefault(t => t.Status == TopicStatus.Approved)?.Count ?? 0
            },
            Groups = await GroupRowsAsync(user, now)
        };
    }

    /// The per-group breakdown, identical for both roles apart from which groups are in it.
    private async Task<IReadOnlyList<DashboardGroupRow>> GroupRowsAsync(UserContext user, DateTime now)
    {
        return await _accessScope.VisibleGroups(user).AsNoTracking()
            .OrderByDescending(g => g.AcademicYear)
            .ThenBy(g => g.Code)
            .Select(g => new DashboardGroupRow
            {
                GroupId = g.Id,
                GroupCode = g.Code,
                AcademicYear = g.AcademicYear,
                DepartmentName = g.Department.Name,
                StudentCount = g.Students.Count(s => s.ArchivedAt == null),
                ApprovedTopicCount = g.Students.Count(s => s.ArchivedAt == null && s.TopicId != null),
                StepsApproved = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Approved),
                StepsTotal = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null),
                WaitingReviews = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null && t.Status == StudentTaskStatus.Submitted),
                LateSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Submissions.OrderByDescending(s => s.Version).Select(s => s.IsLate).FirstOrDefault()),
                OverdueSteps = g.GroupTasks
                    .SelectMany(gt => gt.StudentTasks)
                    .Count(t => t.StudentProfile.ArchivedAt == null
                        && t.Status != StudentTaskStatus.Approved
                        && t.Status != StudentTaskStatus.Submitted
                        && t.GroupTask.Deadline < now)
            })
            .ToListAsync();
    }

    /// Steps past their deadline with nothing submitted - the one thing the review queue can
    /// never show, because a step that was never submitted never enters it (§7.4).
    private async Task<IReadOnlyList<OverdueStepRow>> OverdueStepsAsync(UserContext user, DateTime now)
    {
        var reviewable = _accessScope.ReviewableStudents(user).Select(s => s.Id);

        var rows = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => reviewable.Contains(t.StudentProfileId)
                && t.StudentProfile.ArchivedAt == null
                && t.Status != StudentTaskStatus.Approved
                && t.Status != StudentTaskStatus.Submitted
                && t.GroupTask.Deadline < now)
            .OrderBy(t => t.GroupTask.Deadline)
            .ThenBy(t => t.Id)
            .Take(OverdueStepsCount)
            .Select(t => new OverdueStepRow
            {
                StudentTaskId = t.Id,
                StudentProfileId = t.StudentProfileId,
                StudentName = t.StudentProfile.User.LastName + " " + t.StudentProfile.User.FirstName,
                GroupId = t.StudentProfile.GroupId,
                GroupCode = t.StudentProfile.Group.Code,
                StepTitle = t.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = t.GroupTask.DiplomaTaskTemplate.Order,
                Deadline = t.GroupTask.Deadline
            })
            .ToListAsync();

        foreach (var row in rows)
        {
            row.DaysOverdue = (int)Math.Floor((now - row.Deadline).TotalDays);
        }

        return rows;
    }
}
```

`DaysOverdue` is filled after materialisation deliberately: SQL Server's own date arithmetic and .NET's disagree about partial days, and the figure is shown to a person.

- [ ] **Step 4: Replace the placeholder endpoints**

Replace `Controllers/DashboardController.cs` entirely:

```csharp
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/dashboard")]
[Authorize]
public class DashboardController : ApiControllerBase
{
    private readonly IDashboardService _dashboard;

    public DashboardController(IDashboardService dashboard)
    {
        _dashboard = dashboard;
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin")]
    public async Task<IActionResult> Admin()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _dashboard.GetAdminAsync(user));
    }

    [Authorize(Roles = "Teacher")]
    [HttpGet("teacher")]
    public async Task<IActionResult> Teacher()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _dashboard.GetTeacherAsync(user));
    }

    [Authorize(Roles = "Student")]
    [HttpGet("student")]
    public async Task<IActionResult> Student()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (dashboard, error) = await _dashboard.GetStudentAsync(user);
        return dashboard is null ? ErrorResult(error) : Ok(dashboard);
    }
}
```

The route changes from `/api/Dashboard/...` to `/api/dashboard/...`; nothing calls the old placeholders.

Register in `Program.cs`:

```csharp
builder.Services.AddScoped<IDashboardService, DashboardService>();
```

- [ ] **Step 5: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 6: Record the test gaps**

```markdown
### Dashboards
- A teacher's group rows contain only groups they review or supervise in; an administrator's contain every group.
- A teacher's overdue list and supervised list exclude archived students.
- `WaitingReviews` on the teacher dashboard equals the queue's total, not the length of the five-item list.
- A student with no decided submission gets `latestDecision: null`; with several, the newest decision by `decidedAt`.
- The administrator's topic-selection figures sum to the active student count.
- `IsOpen` is false once the deadline has passed and true when no deadline is set.
- An administrator with no groups gets empty arrays and zero counts rather than an error.
```

---

### Task 12: Reordering step templates

Implements §6 (the API half; the page is Task 16).

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/TaskTemplates/ReorderTaskTemplatesRequest.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TaskErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/ITaskTemplateService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/TaskTemplateService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/TaskTemplatesController.cs`

**Interfaces:**
- Produces: `PUT /api/task-templates/order`; `ITaskTemplateService.ReorderAsync(ReorderTaskTemplatesRequest, Guid administratorId) → Task<(IReadOnlyList<TaskTemplateResponse>? templates, string? error)>`; `TaskErrors.TemplateOrderMismatch`.
- Consumes: `SecurityLog` (Task 1).

- [ ] **Step 1: Define the request and the error**

Create `DTOs/TaskTemplates/ReorderTaskTemplatesRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.TaskTemplates;

public class ReorderTaskTemplatesRequest
{
    public Guid FacultyId { get; set; }

    /// The faculty's templates in their new order, first to last. The complete set: same
    /// members, no duplicates, nothing missing.
    [Required]
    public IReadOnlyList<Guid> TemplateIds { get; set; } = [];
}
```

In `Services/TaskErrors.cs`:

```csharp
    public const string TemplateOrderMismatch = "taskTemplate.orderMismatch";
```

```csharp
        new(TemplateOrderMismatch, StatusCodes.Status400BadRequest, "The new order must list every step of this faculty exactly once.")
```

- [ ] **Step 2: Implement the reorder**

Add to `Interfaces/ITaskTemplateService.cs`:

```csharp
    Task<(IReadOnlyList<TaskTemplateResponse>? templates, string? error)> ReorderAsync(ReorderTaskTemplatesRequest request, Guid administratorId);
```

Add to `TaskTemplateService`:

```csharp
    /// Phase 8 §6. One request carries the whole new order, so the result does not depend on the
    /// order the client happened to send individual moves in.
    ///
    /// The two-phase negate-then-assign inside a transaction is the same technique the
    /// single-step move already uses: a straight sequence of updates would transiently violate
    /// the unique (FacultyId, Order) index, and EF chooses its own statement order.
    ///
    /// Orders are rewritten as 1..n, which also closes any gaps left by deleted steps.
    public async Task<(IReadOnlyList<TaskTemplateResponse>? templates, string? error)> ReorderAsync(
        ReorderTaskTemplatesRequest request,
        Guid administratorId)
    {
        var facultyExists = await _dbContext.Faculties.AnyAsync(f => f.Id == request.FacultyId);
        if (!facultyExists)
        {
            return (null, TaskErrors.TemplateFacultyNotFound);
        }

        var templates = await _dbContext.DiplomaTaskTemplates
            .Include(t => t.Faculty)
            .Where(t => t.FacultyId == request.FacultyId)
            .ToListAsync();

        var requested = request.TemplateIds;
        if (requested.Count != templates.Count
            || requested.Distinct().Count() != requested.Count
            || requested.Any(id => templates.All(t => t.Id != id)))
        {
            return (null, TaskErrors.TemplateOrderMismatch);
        }

        var byId = templates.ToDictionary(t => t.Id);
        var now = DateTime.UtcNow;

        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        foreach (var template in templates)
        {
            template.Order = -template.Order;
        }
        await _dbContext.SaveChangesAsync();

        for (var index = 0; index < requested.Count; index++)
        {
            var template = byId[requested[index]];
            template.Order = index + 1;
            template.UpdatedAt = now;
        }
        await _dbContext.SaveChangesAsync();

        await transaction.CommitAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "Reordered", "TaskTemplate", request.FacultyId);

        return (templates.OrderBy(t => t.Order).Select(Map).ToList(), null);
    }
```

`TaskTemplateService` has no logger today; add `ILogger<TaskTemplateService> logger` to its constructor and a `private readonly ILogger<TaskTemplateService> _logger;` field. (Task 2 will already have done this if it ran first; do not add a second field.)

The negation is safe against the unique index only because every row of the faculty is negated, and no real order is ever negative.

- [ ] **Step 3: Expose it**

In `Controllers/TaskTemplatesController.cs`:

```csharp
    [Authorize(Roles = "Admin")]
    [HttpPut("order")]
    public async Task<IActionResult> Reorder([FromBody] ReorderTaskTemplatesRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (templates, error) = await _taskTemplates.ReorderAsync(request, user.UserId);
        return templates is null ? ErrorResult(error) : Ok(templates);
    }
```

Place it before any `[HttpPut("{id:guid}")]` action so the literal route wins, and match the controller's existing authorization attributes and field names.

- [ ] **Step 4: Build**

Run: `dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj`
Expected: `0 Error(s)`, `0 Warning(s)`.

- [ ] **Step 5: Record the test gaps**

```markdown
### Reordering
- A complete, reordered list renumbers the faculty's steps 1..n in the order given.
- A list missing one id, containing a duplicate, containing an id from another faculty, or empty when the faculty has steps, answers `taskTemplate.orderMismatch` and changes nothing.
- An unknown faculty answers `taskTemplate.facultyNotFound`.
- Reordering a faculty with gaps in its orders (1, 2, 7) produces 1, 2, 3.
- Reordering does not touch another faculty's steps.
- A reorder that fails midway leaves every order as it was (transaction).
```

---

> **Owner checkpoint — after Task 12.** The backend is complete at this point. Report and ask whether to continue or stop and write a handoff.

---

### Task 13: Frontend shared infrastructure

Everything the pages in Tasks 14–16 consume: types, API modules, three shared components and the complete translation blocks. No page is changed here.

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`
- Modify: `frontend/diploma-tracker-web/src/api/workflowApi.ts`
- Modify: `frontend/diploma-tracker-web/src/api/taskTemplatesApi.ts`
- Create: `frontend/diploma-tracker-web/src/api/dashboardApi.ts`
- Create: `frontend/diploma-tracker-web/src/api/archiveApi.ts`
- Create: `frontend/diploma-tracker-web/src/components/ui/Pagination.tsx`
- Create: `frontend/diploma-tracker-web/src/components/dashboard/StatTile.tsx`
- Create: `frontend/diploma-tracker-web/src/components/dashboard/ProportionBar.tsx`
- Modify: `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json`

**Interfaces:**
- Consumes: the API built in Tasks 6–12.
- Produces: every type and function Tasks 14–16 import.

- [ ] **Step 1: Add the types**

Append to `src/api/types.ts`, and **change the two existing types in place**:

```ts
// --- changed in place ---
// StudentProgress.lateSubmissions -> lateSteps  (§7.2)
// GroupProgress ... cells[] gains isOverdue      (§7.1)

export type Paged<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type LatestDecision = {
  studentTaskId: string
  submissionId: string
  stepTitle: string
  stepOrder: number
  version: number
  decision: 'Approved' | 'Returned'
  mark: number | null
  reviewerName: string | null
  reviewerComment: string | null
  decidedAt: string
}

export type StudentDashboard = {
  progress: StudentProgress
  latestDecision: LatestDecision | null
}

export type DashboardGroupRow = {
  groupId: string
  groupCode: string
  academicYear: string
  departmentName: string
  studentCount: number
  approvedTopicCount: number
  stepsApproved: number
  stepsTotal: number
  waitingReviews: number
  lateSteps: number
  overdueSteps: number
}

export type OverdueStepRow = {
  studentTaskId: string
  studentProfileId: string
  studentName: string
  groupId: string
  groupCode: string
  stepTitle: string
  stepOrder: number
  deadline: string
  daysOverdue: number
}

export type SupervisedStudentRow = {
  studentProfileId: string
  studentName: string
  groupId: string
  groupCode: string
  topicTitle: string | null
  currentStepTitle: string | null
  currentStepStatus: StudentTaskStatus | null
  nextDeadline: string | null
}

export type TeacherDashboard = {
  waitingReviews: number
  latestForReview: ReviewQueueItem[]
  overdueSteps: OverdueStepRow[]
  supervisedStudents: SupervisedStudentRow[]
  groups: DashboardGroupRow[]
}

export type AdminDashboard = {
  topicSelection: {
    totalStudents: number
    withApprovedTopic: number
    withPendingRequest: number
    withoutTopic: number
    deadline: string | null
    isOpen: boolean
  }
  reviewBacklog: {
    waitingReviews: number
    waitingLate: number
    overdueSteps: number
  }
  structure: {
    faculties: number
    departments: number
    groups: number
    activeStudents: number
    unclaimedAccounts: number
    teachers: number
    topicsAvailable: number
    topicsReserved: number
    topicsApproved: number
  }
  groups: DashboardGroupRow[]
}

export type ArchivedGroupSummary = {
  id: string
  groupCode: string
  academicYear: string
  departmentName: string
  facultyName: string
  groupDeletedAt: string | null
  studentCount: number
  fileCount: number
  totalSizeBytes: number
  createdAt: string
  updatedAt: string
}

export type ArchivedFile = {
  id: string
  studentName: string
  studentNumber: string
  stepTitle: string
  stepOrder: number
  deadline: string
  version: number
  submittedAt: string
  isLate: boolean
  decision: 'Approved' | 'Returned' | null
  mark: number | null
  reviewerName: string | null
  reviewerComment: string | null
  decidedAt: string | null
  kind: 'Main' | 'Supporting'
  originalName: string
  sizeBytes: number
}

export type ArchivedGroupDetails = ArchivedGroupSummary & {
  reviewerNames: string[]
  files: ArchivedFile[]
}

export type ArchiveUsage = {
  groupCount: number
  fileCount: number
  totalSizeBytes: number
}
```

- [ ] **Step 2: Page the queue in the API module**

In `src/api/workflowApi.ts`, replace `getReviewQueue`:

```ts
export function getReviewQueue(
  groupId?: string,
  late?: boolean,
  page = 1,
  pageSize = 25
): Promise<Paged<ReviewQueueItem>> {
  const params = new URLSearchParams()
  if (groupId) params.set('groupId', groupId)
  if (late !== undefined) params.set('late', String(late))
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  return apiRequest<Paged<ReviewQueueItem>>(`/api/review/queue?${params.toString()}`)
}
```

and add `Paged` to the type import.

- [ ] **Step 3: Add the dashboard module**

Create `src/api/dashboardApi.ts`:

```ts
import { apiRequest } from './apiClient'
import type { AdminDashboard, StudentDashboard, TeacherDashboard } from './types'

export function getStudentDashboard(): Promise<StudentDashboard> {
  return apiRequest<StudentDashboard>('/api/dashboard/student')
}

export function getTeacherDashboard(): Promise<TeacherDashboard> {
  return apiRequest<TeacherDashboard>('/api/dashboard/teacher')
}

export function getAdminDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/api/dashboard/admin')
}
```

- [ ] **Step 4: Add the archive module**

Create `src/api/archiveApi.ts`:

```ts
import { apiDownload, apiRequest, saveBlob } from './apiClient'
import type { ArchiveUsage, ArchivedGroupDetails, ArchivedGroupSummary } from './types'

export function getArchivedGroups(academicYear?: string, search?: string): Promise<ArchivedGroupSummary[]> {
  const params = new URLSearchParams()
  if (academicYear) params.set('academicYear', academicYear)
  if (search) params.set('search', search)
  const query = params.toString()
  return apiRequest<ArchivedGroupSummary[]>(`/api/archive/groups${query ? `?${query}` : ''}`)
}

export function getArchivedGroup(id: string): Promise<ArchivedGroupDetails> {
  return apiRequest<ArchivedGroupDetails>(`/api/archive/groups/${id}`)
}

export function getArchiveUsage(): Promise<ArchiveUsage> {
  return apiRequest<ArchiveUsage>('/api/archive/usage')
}

export function purgeArchivedGroup(id: string): Promise<void> {
  return apiRequest<void>(`/api/archive/groups/${id}`, { method: 'DELETE' })
}

export async function downloadArchivedFile(fileId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/archive/files/${fileId}`)
  saveBlob(blob, fileName ?? fallbackName)
}
```

- [ ] **Step 5: Add the reorder call**

In `src/api/taskTemplatesApi.ts`:

```ts
export function reorderTaskTemplates(facultyId: string, templateIds: string[]): Promise<TaskTemplate[]> {
  return apiRequest<TaskTemplate[]>('/api/task-templates/order', {
    method: 'PUT',
    body: JSON.stringify({ facultyId, templateIds })
  })
}
```

Match the existing module's import of the `TaskTemplate` type.

- [ ] **Step 6: Create the three shared components**

`src/components/ui/Pagination.tsx`:

```tsx
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  disabled?: boolean
}

export function Pagination({ page, pageSize, total, onChange, disabled = false }: PaginationProps) {
  const { t } = useTranslation()

  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  if (total <= pageSize) {
    return null
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-4">
      <p className="text-xs text-text-muted">{t('pagination.showing', { from, to, total })}</p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={ChevronFirst} aria-label={t('pagination.first')}
          disabled={disabled || page <= 1} onClick={() => onChange(1)} />
        <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label={t('pagination.previous')}
          disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} />
        <span className="px-2 text-xs text-text-muted">{t('pagination.page', { page, lastPage })}</span>
        <Button variant="ghost" size="sm" icon={ChevronRight} aria-label={t('pagination.next')}
          disabled={disabled || page >= lastPage} onClick={() => onChange(page + 1)} />
        <Button variant="ghost" size="sm" icon={ChevronLast} aria-label={t('pagination.last')}
          disabled={disabled || page >= lastPage} onClick={() => onChange(lastPage)} />
      </div>
    </div>
  )
}
```

Check `Button`'s props before writing this — it already accepts `variant`, `size` and `icon`; keep to what it supports.

`src/components/dashboard/StatTile.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

type StatTileProps = {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: 'neutral' | 'warning' | 'danger'
  onClick?: () => void
}

const toneClasses = {
  neutral: 'text-heading',
  warning: 'text-warning',
  danger: 'text-danger'
} as const

export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', onClick }: StatTileProps) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-text-muted" aria-hidden />}
        <p className="text-xs font-medium text-text-muted">{label}</p>
      </div>
      <p className={cn('mt-1 text-2xl font-semibold', toneClasses[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </>
  )

  if (!onClick) {
    return <div className="rounded-card bg-surface p-4">{content}</div>
  }

  return (
    <button type="button" onClick={onClick} className="rounded-card bg-surface p-4 text-left hover:bg-surface/80">
      {content}
    </button>
  )
}
```

`src/components/dashboard/ProportionBar.tsx`:

```tsx
import { cn } from '../ui/cn'

export type ProportionSegment = {
  key: string
  label: string
  value: number
  className: string
}

/// A stacked bar built from the design tokens. No charting library is added (§7.5).
export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  if (total === 0) {
    return <div className="h-2 w-full rounded-pill bg-surface" />
  }

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-pill bg-surface">
        {segments.filter((segment) => segment.value > 0).map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full', segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <span className={cn('size-2 rounded-pill', segment.className)} aria-hidden />
            {segment.label} {segment.value}
          </span>
        ))}
      </div>
    </div>
  )
}
```

Replace the `///` comment with a normal `//` comment — `///` is C# syntax and will read as a stray comment in TypeScript.

- [ ] **Step 7: Add every translation key**

Both files get the same keys. **English** (`src/i18n/en.json`):

```json
"pagination": {
  "showing": "Showing {{from}}–{{to}} of {{total}}",
  "page": "Page {{page}} of {{lastPage}}",
  "first": "First page",
  "previous": "Previous page",
  "next": "Next page",
  "last": "Last page"
},
"archive": {
  "title": "Archive",
  "subtitle": "Work kept from groups that are no longer in the system",
  "empty": "Nothing has been archived yet.",
  "searchPlaceholder": "Group code or student",
  "academicYear": "Academic year",
  "allYears": "All years",
  "groupCode": "Group",
  "department": "Department",
  "faculty": "Faculty",
  "students": "Students",
  "files": "Files",
  "size": "Size",
  "archivedAt": "Archived",
  "groupDeleted": "Group deleted",
  "groupKept": "Group still exists",
  "reviewers": "Reviewers",
  "usage": "{{files}} files, {{size}} in total",
  "backToArchive": "Back to the archive",
  "step": "Step",
  "version": "Version",
  "submittedAt": "Submitted",
  "decision": "Decision",
  "mark": "Mark",
  "reviewer": "Reviewer",
  "comment": "Comment",
  "file": "File",
  "download": "Download",
  "noFiles": "This archive holds no files.",
  "purge": "Delete permanently",
  "purgeConfirm": "Permanently delete the archive of {{code}} and its {{count}} files? This cannot be undone.",
  "purged": "Archive deleted",
  "mainFile": "Main document",
  "supportingFile": "Supporting file"
},
"dashboard": {
  "latestForReview": "Latest submissions to review",
  "openSubmission": "Open",
  "noWaiting": "Nothing is waiting for a decision.",
  "overdueSteps": "Overdue steps",
  "overdueEmpty": "No step is overdue.",
  "daysOverdue_one": "{{count}} day overdue",
  "daysOverdue_other": "{{count}} days overdue",
  "supervisedStudents": "Students I supervise",
  "supervisedEmpty": "You do not supervise any students.",
  "currentStep": "Current step",
  "nextDeadline": "Next deadline",
  "noTopic": "No topic",
  "groupsBreakdown": "Groups",
  "groupsEmpty": "No groups to show.",
  "studentsColumn": "Students",
  "approvedTopics": "Topics",
  "stepsApproved": "Steps approved",
  "waiting": "Waiting",
  "late": "Late",
  "overdue": "Overdue",
  "groupProgress": "Group progress",
  "selectGroup": "Group",
  "noGroupSelected": "Choose a group to see its progress.",
  "topicSelection": "Topic selection",
  "withTopic": "With a topic",
  "withRequest": "Request pending",
  "withoutTopic": "No topic",
  "selectionOpen": "Selection is open",
  "selectionClosed": "Selection is closed",
  "noDeadline": "No deadline set",
  "deadlineOn": "Deadline {{date}}",
  "reviewBacklog": "Review backlog",
  "waitingLate": "of which late",
  "structure": "Structure",
  "faculties": "Faculties",
  "departments": "Departments",
  "groupsCount": "Groups",
  "activeStudents": "Active students",
  "unclaimedAccounts": "Unclaimed accounts",
  "teachers": "Teachers",
  "topicsAvailable": "Available topics",
  "topicsReserved": "Reserved topics",
  "topicsApproved": "Approved topics",
  "latestDecision": "Most recent decision",
  "decisionApproved": "Approved",
  "decisionReturned": "Returned",
  "noDecisionYet": "No work of yours has been decided yet.",
  "openStep": "Open the step"
},
"steps": {
  "overdue": "Overdue",
  "legend": "Legend",
  "legendPending": "not submitted, deadline ahead",
  "legendOverdue": "past the deadline, nothing submitted",
  "legendSubmitted": "awaiting a decision",
  "legendReturned": "returned for revision",
  "legendApproved": "approved, with its mark"
},
"progress": {
  "lateSteps": "Late steps"
},
"taskTemplates": {
  "reorderHint": "Drag a step, or use the arrows, to change the order.",
  "moveUp": "Move up",
  "moveDown": "Move down",
  "reordered": "Order saved",
  "dragHandle": "Reorder"
},
"errors": {
  "password": { "policyElevated": "An administrator password must be between 12 and 128 characters." },
  "request": { "tooLarge": "The upload is larger than this form allows." },
  "taskTemplate": { "orderMismatch": "The new order must list every step of this faculty exactly once." },
  "template": { "conflict": "This template was changed by someone else. Reload and try again." },
  "archive": { "notFound": "Archived item not found." }
}
```

**Ukrainian** (`src/i18n/uk.json`), the same keys:

```json
"pagination": {
  "showing": "Показано {{from}}–{{to}} з {{total}}",
  "page": "Сторінка {{page}} з {{lastPage}}",
  "first": "Перша сторінка",
  "previous": "Попередня сторінка",
  "next": "Наступна сторінка",
  "last": "Остання сторінка"
},
"archive": {
  "title": "Архів",
  "subtitle": "Роботи груп, яких уже немає в системі",
  "empty": "Архів порожній.",
  "searchPlaceholder": "Код групи або студент",
  "academicYear": "Навчальний рік",
  "allYears": "Усі роки",
  "groupCode": "Група",
  "department": "Кафедра",
  "faculty": "Факультет",
  "students": "Студенти",
  "files": "Файли",
  "size": "Розмір",
  "archivedAt": "Заархівовано",
  "groupDeleted": "Групу видалено",
  "groupKept": "Група ще існує",
  "reviewers": "Перевіряючі",
  "usage": "{{files}} файлів, разом {{size}}",
  "backToArchive": "Назад до архіву",
  "step": "Етап",
  "version": "Версія",
  "submittedAt": "Подано",
  "decision": "Рішення",
  "mark": "Оцінка",
  "reviewer": "Перевіряючий",
  "comment": "Коментар",
  "file": "Файл",
  "download": "Завантажити",
  "noFiles": "У цьому архіві немає файлів.",
  "purge": "Видалити назавжди",
  "purgeConfirm": "Видалити назавжди архів групи {{code}} і {{count}} файлів? Дію не можна скасувати.",
  "purged": "Архів видалено",
  "mainFile": "Основний документ",
  "supportingFile": "Додатковий файл"
},
"dashboard": {
  "latestForReview": "Останні роботи на перевірку",
  "openSubmission": "Відкрити",
  "noWaiting": "Немає робіт, що очікують рішення.",
  "overdueSteps": "Прострочені етапи",
  "overdueEmpty": "Прострочених етапів немає.",
  "daysOverdue_one": "прострочено на {{count}} день",
  "daysOverdue_few": "прострочено на {{count}} дні",
  "daysOverdue_many": "прострочено на {{count}} днів",
  "supervisedStudents": "Мої студенти",
  "supervisedEmpty": "Ви не керуєте жодним студентом.",
  "currentStep": "Поточний етап",
  "nextDeadline": "Найближчий дедлайн",
  "noTopic": "Без теми",
  "groupsBreakdown": "Групи",
  "groupsEmpty": "Груп немає.",
  "studentsColumn": "Студенти",
  "approvedTopics": "Теми",
  "stepsApproved": "Етапів затверджено",
  "waiting": "На перевірці",
  "late": "Із запізненням",
  "overdue": "Прострочено",
  "groupProgress": "Прогрес групи",
  "selectGroup": "Група",
  "noGroupSelected": "Оберіть групу, щоб побачити її прогрес.",
  "topicSelection": "Вибір тем",
  "withTopic": "Мають тему",
  "withRequest": "Очікують рішення",
  "withoutTopic": "Без теми",
  "selectionOpen": "Вибір відкрито",
  "selectionClosed": "Вибір закрито",
  "noDeadline": "Термін не встановлено",
  "deadlineOn": "Термін до {{date}}",
  "reviewBacklog": "Черга перевірки",
  "waitingLate": "з них із запізненням",
  "structure": "Структура",
  "faculties": "Факультети",
  "departments": "Кафедри",
  "groupsCount": "Групи",
  "activeStudents": "Активні студенти",
  "unclaimedAccounts": "Неактивовані акаунти",
  "teachers": "Викладачі",
  "topicsAvailable": "Вільні теми",
  "topicsReserved": "Зарезервовані теми",
  "topicsApproved": "Затверджені теми",
  "latestDecision": "Останнє рішення",
  "decisionApproved": "Затверджено",
  "decisionReturned": "Повернено",
  "noDecisionYet": "Ваші роботи ще не оцінювали.",
  "openStep": "Відкрити етап"
},
"steps": {
  "overdue": "Прострочено",
  "legend": "Позначення",
  "legendPending": "не подано, термін ще не минув",
  "legendOverdue": "термін минув, нічого не подано",
  "legendSubmitted": "очікує рішення",
  "legendReturned": "повернено на доопрацювання",
  "legendApproved": "затверджено, з оцінкою"
},
"progress": {
  "lateSteps": "Етапів із запізненням"
},
"taskTemplates": {
  "reorderHint": "Перетягніть етап або скористайтеся стрілками, щоб змінити порядок.",
  "moveUp": "Вище",
  "moveDown": "Нижче",
  "reordered": "Порядок збережено",
  "dragHandle": "Змінити порядок"
},
"errors": {
  "password": { "policyElevated": "Пароль адміністратора має містити від 12 до 128 символів." },
  "request": { "tooLarge": "Файл більший, ніж дозволяє ця форма." },
  "taskTemplate": { "orderMismatch": "Новий порядок має містити кожен етап цього факультету рівно один раз." },
  "template": { "conflict": "Шаблон змінив хтось інший. Оновіть сторінку та спробуйте ще раз." },
  "archive": { "notFound": "Архівний запис не знайдено." }
}
```

These are **merges into the existing sections**, not replacements: `dashboard`, `steps`, `progress`, `taskTemplates` and `errors.*` already exist and keep every key they have. `progress.late` is replaced by `progress.lateSteps`; delete `progress.late` in both files once `ProgressSummary` stops using it (Task 14).

`nav.archive` is also needed: `"archive": "Archive"` / `"archive": "Архів"` inside the existing `nav` section.

- [ ] **Step 8: Verify**

Run:

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: no type errors; lint 0 errors / 0 warnings; `i18n:check` reports both languages with the same keys and the right plural categories. `daysOverdue` must have `_one`/`_other` in English and `_one`/`_few`/`_many` in Ukrainian — that is exactly what `i18n:check` verifies.

TypeScript will report errors wherever `lateSubmissions` is still read (`ProgressSummary`) and wherever `getReviewQueue` is used as an array (`ReviewQueuePage`, `TeacherDashboardPage`). **That is expected at this point** — those are Tasks 14 and 15. If you need a green build before then, fix those three call sites minimally as part of this task and refine them in the next.

---

### Task 14: Progress, lateness and the topic card

Implements §7.1's rendering, §7.2's label and §7.6.

**Files:**
- Modify: `frontend/diploma-tracker-web/src/components/workflow/GroupProgressMatrix.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/workflow/StepStatusBadge.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/workflow/ProgressSummary.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/topics/MyTopicCard.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/StudentTopicsPage.tsx`

**Interfaces:**
- Consumes: `GroupProgress` cells with `isOverdue`, `StudentProgress.lateSteps` (Task 13).
- Produces: `StepStatusBadge` gains an `isOverdue` prop, used by Task 15's matrix card.

- [ ] **Step 1: Show overdue on the badge**

`StepStatusBadge` takes a third piece of state: an `isOverdue?: boolean` prop, defaulting to false.

The status badge still renders as it does today — the step's status matters whether or not it is overdue. What changes is the badge beside it: `isOverdue` replaces the late badge, because a step cannot be both. `isLate` describes a submission that exists and arrived late; `isOverdue` describes one that does not exist at all.

```tsx
{isOverdue ? <Badge tone="danger">{t('steps.overdue')}</Badge> : isLate && <Badge tone="warning">{t('steps.late')}</Badge>}
```

- [ ] **Step 2: Pass it through the matrix, and add the legend**

In `GroupProgressMatrix`, pass `isOverdue={cell.isOverdue}` to `StepStatusBadge`, and render a legend under the table: five `<span>`s, each an example badge plus its `steps.legend*` description, wrapped in a row with `text-xs text-text-muted` and preceded by the `steps.legend` label. Keep the sticky first column, the per-step footer counts and the click-to-open behaviour exactly as they are.

- [ ] **Step 3: Rename the late figure**

In `ProgressSummary`, the third tile reads `t('progress.lateSteps')` and `progress.lateSteps`. Remove `progress.late` from both translation files once this is done.

- [ ] **Step 4: Show a rejection that carries no comment**

In `MyTopicCard`, the `lastRejected` condition currently requires a comment, so a rejection decided without one shows the student nothing at all:

```tsx
const lastRejected = latest && latest.status === 'Rejected' && latest.id !== dismissedRejectionId ? latest : null
```

The block renders the topic title and the decision date always, and the comment paragraph **only when there is one**. Add `topics.rejectedNoComment` ("The topic was rejected without a comment." / "Тему відхилено без коментаря.") to both translation files and render it in the comment's place when `decisionComment` is empty, so the block is never a bare title.

- [ ] **Step 5: Let the deadline pass by itself**

In `StudentTopicsPage`, `selectionClosedRaw` is computed during render, so a page left open across the deadline keeps offering *Reserve* and *Cancel* until something else causes a re-render. Replace the derived constant with state that re-evaluates on a timer:

```tsx
const [now, setNow] = useState(() => Date.now())

useEffect(() => {
  if (deadline === null) return

  const remaining = new Date(deadline).getTime() - Date.now()
  if (remaining <= 0) return

  // setTimeout is capped at ~24.8 days (2^31-1 ms); a deadline further away is re-checked
  // when the window regains focus, which is enough - nobody leaves this page open for a month.
  const delay = Math.min(remaining + 1000, 2_147_483_647)
  const timer = window.setTimeout(() => setNow(Date.now()), delay)
  return () => window.clearTimeout(timer)
}, [deadline])

useEffect(() => {
  const onFocus = () => setNow(Date.now())
  window.addEventListener('focus', onFocus)
  return () => window.removeEventListener('focus', onFocus)
}, [])

const selectionClosedRaw = deadline !== null && new Date(deadline).getTime() <= now
```

Every existing use of `selectionClosedRaw` keeps working unchanged.

- [ ] **Step 6: Verify**

Run:

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: clean.

---

### Task 15: The three dashboards

Implements §7.3, §7.4 and §7.5 in the interface.

**Files:**
- Create: `frontend/diploma-tracker-web/src/components/dashboard/GroupProgressCard.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/StudentDashboardPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/TeacherDashboardPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/AdminDashboardPage.tsx`

**Interfaces:**
- Consumes: `dashboardApi` (Task 13), `StatTile`, `ProportionBar`, `Pagination` (Task 13), `GroupProgressMatrix` (Task 14), `getGroups` and `getGroupProgress` (existing).
- Produces: `GroupProgressCard`, used by both the teacher and the administrator page.

- [ ] **Step 1: Build the shared group-progress card**

`GroupProgressCard` is one `Card` titled `dashboard.groupProgress` holding a `Select` labelled `dashboard.selectGroup` and, beneath it, `GroupProgressMatrix`.

- It loads the viewer's groups once with `getGroups()`, labelling each option `` `${group.code} — ${group.departmentName}, ${group.academicYear}` `` (§7.5: one dropdown).
- It selects the first group automatically when exactly one exists, and otherwise starts empty showing `dashboard.noGroupSelected` in an `EmptyState`.
- Changing the selection loads `getGroupProgress(groupId)` and renders the matrix; a `Spinner` while loading, the error message in `text-danger` on failure.
- Clicking a cell navigates to `/review/steps/{studentTaskId}`, exactly as `GroupProgressPage` does.
- Use a request-sequence guard (`let isCurrent = true` in the effect, cleared in its cleanup) so a slow response for a previously selected group cannot overwrite a newer one — the pattern `GroupProgressPage` already uses.

- [ ] **Step 2: The student dashboard**

Replace the single `getMyProgress()` call with `getStudentDashboard()`. The page renders, in order: `MyTopicCard`, `ProgressSummary` fed from `dashboard.progress`, the **latest decision** card, then the existing *Go to my steps* button.

The latest-decision card is a `Card` titled `dashboard.latestDecision`:
- when `latestDecision` is null, an `EmptyState` with `dashboard.noDecisionYet`;
- otherwise the step as `{order}. {title}`, a `Badge` — `success` with `dashboard.decisionApproved` and the mark, or `warning` with `dashboard.decisionReturned` — the reviewer's name, the formatted `decidedAt`, the comment when present, and a `Button` reading `dashboard.openStep` that navigates to `/student/tasks/{studentTaskId}`.

- [ ] **Step 3: The teacher dashboard**

Replace both existing calls with one `getTeacherDashboard()`. Layout:

1. A two-tile row: `dashboard.waiting` (value `waitingReviews`, links to `/review`) and `nav.groups` (value `groups.length`, links to `/teacher/groups`), both `StatTile`.
2. `Card` titled `dashboard.latestForReview` holding a `DataTable` of `latestForReview` — student, group, step (`{order}. {title}`), version, submitted date, late badge — with `onRowClick` navigating to `/review/steps/{studentTaskId}`. `EmptyState` with `dashboard.noWaiting`. Below it, a `Button` to `/review` when `waitingReviews > latestForReview.length`.
3. `Card` titled `dashboard.overdueSteps` holding a `DataTable` of `overdueSteps` — student, group, step, deadline, and `t('dashboard.daysOverdue', { count: daysOverdue })` in `text-danger`. `EmptyState` with `dashboard.overdueEmpty`. Rows open the same step route.
4. `Card` titled `dashboard.supervisedStudents` holding a `DataTable` — student, group, topic (or `dashboard.noTopic`), current step with its `StepStatusBadge`, next deadline. `EmptyState` with `dashboard.supervisedEmpty`.
5. `Card` titled `dashboard.groupsBreakdown` holding the group table described in Step 5 below.
6. `GroupProgressCard`.

- [ ] **Step 4: The administrator dashboard**

`AdminDashboardPage` today is a bare `PageHeader`. It becomes `getAdminDashboard()` plus:

1. `Card` titled `dashboard.topicSelection`: a `ProportionBar` with three segments — `dashboard.withTopic` (`bg-success`), `dashboard.withRequest` (`bg-accent`), `dashboard.withoutTopic` (`bg-warning`) — and beneath it the deadline line: `dashboard.noDeadline`, or `dashboard.deadlineOn` with the formatted date plus a `Badge` reading `dashboard.selectionOpen` (`success`) or `dashboard.selectionClosed` (`danger`).
2. A three-tile row from `reviewBacklog`: `dashboard.waiting` (links to `/review`), `dashboard.waitingLate` (tone `warning`), `dashboard.overdue` (tone `danger`).
3. `Card` titled `dashboard.structure`: a grid of `StatTile`s for the nine `structure` figures, each linking to its page where one exists (faculties → `/admin/faculties`, groups → `/admin/groups`, students → `/admin/students`, teachers → `/admin/teachers`, topics → `/admin/topics`).
4. `Card` titled `dashboard.groupsBreakdown` with the group table.
5. `GroupProgressCard`.

- [ ] **Step 5: The group table, identical on both pages**

A `DataTable<DashboardGroupRow>` with columns: group code (with academic year beneath in `text-xs text-text-muted`), department, `dashboard.studentsColumn`, `dashboard.approvedTopics` as `` `${approvedTopicCount}/${studentCount}` ``, `dashboard.stepsApproved` as `t('review.approvedOf', { approved: stepsApproved, total: stepsTotal })`, `dashboard.waiting`, `dashboard.late`, `dashboard.overdue` (the last in `text-danger` when non-zero). Rows navigate to `/groups/{groupId}/progress`.

Sorting: keep it in the page as local state — a column header click sets `{ key, direction }` and the rows are sorted with `useMemo` before being handed to `DataTable`. `DataTable` has no sorting of its own and does not need any.

Define this table **once**, in `GroupProgressCard`'s folder as `src/components/dashboard/GroupTable.tsx`, and import it from both pages. Two copies of the same seven columns is exactly the duplication this plan should avoid.

- [ ] **Step 6: Verify**

Run:

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: clean. Every string on all three pages comes from `t(...)`; no literal English or Ukrainian text in the JSX.

---

### Task 16: The archive page, queue paging and step reordering

Implements §4.5's interface, §8's queue controls and §6's interaction.

**Files:**
- Create: `frontend/diploma-tracker-web/src/pages/ArchivePage.tsx`
- Create: `frontend/diploma-tracker-web/src/pages/ArchivedGroupPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/ReviewQueuePage.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/TaskTemplatesPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/App.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`

**Interfaces:**
- Consumes: `archiveApi`, `Pagination`, `reorderTaskTemplates` (Task 13).
- Produces: routes `/archive` and `/archive/:id`.

- [ ] **Step 1: The archive list**

`ArchivePage` — `PageHeader` with `archive.title` and `archive.subtitle`, and on the administrator's view the usage line `t('archive.usage', { files, size })` where `size` comes from the existing `formatBytes` helper in `src/components/workflow/formatBytes.ts`.

Filters in one row: a `Select` for `archive.academicYear` (options built from the distinct years in the loaded list, plus `archive.allYears`) and a `TextField` for `archive.searchPlaceholder`. Both re-request from the API rather than filtering in memory, debounced by 300 ms for the search box.

A `DataTable<ArchivedGroupSummary>`: group code, academic year, department, faculty, students, files, size (`formatBytes`), archived date, and a `Badge` reading `archive.groupDeleted` (`neutral`) or `archive.groupKept` (`info`). Rows navigate to `/archive/{id}`. `EmptyState` with `archive.empty`.

- [ ] **Step 2: The archive detail**

`ArchivedGroupPage` — a back link to `/archive` reading `archive.backToArchive`, a `PageHeader` with the group code and the academic year and department as its subtitle, and a line listing `archive.reviewers` when `reviewerNames` is non-empty.

The files are grouped **by student, then by step, then by version**: render one `Card` per student titled with their name and number, each containing rows ordered by step order and version. A row shows the step as `{stepOrder}. {stepTitle}`, the version, the submitted date, an overdue/late badge where `isLate`, the decision badge (`success` + mark, or `warning`), the reviewer name and comment when present, the file name with `archive.mainFile`/`archive.supportingFile`, its size, and a `Button` reading `archive.download` calling `downloadArchivedFile(file.id, file.originalName)`.

For administrators only, a `Button` in the `danger` style reading `archive.purge`, opening a `ConfirmDialog` with `t('archive.purgeConfirm', { code, count: fileCount })`. On success: a toast with `archive.purged` and navigate back to `/archive`.

`EmptyState` with `archive.noFiles` when there are none.

- [ ] **Step 3: Route and navigate**

In `App.tsx`, add both routes inside the `allowedRoles={['Admin', 'Teacher']}` guard:

```tsx
<Route path="archive" element={<ArchivePage />} />
<Route path="archive/:id" element={<ArchivedGroupPage />} />
```

In `navigation.ts`, add `{ to: '/archive', labelKey: 'nav.archive' }` to **Admin** (after `/documents`) and to **Teacher** (after `/documents`). Students get no entry and no route.

- [ ] **Step 4: Page the review queue**

`ReviewQueuePage` currently holds `ReviewQueueItem[]`. It now holds `Paged<ReviewQueueItem>` plus a `page` state:

- the load effect passes `page` and depends on it alongside the existing group and late filters;
- changing either filter resets `page` to 1;
- `<Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} disabled={isLoading} />` goes below the table;
- the page's subtitle gains the total, or leave the count to `Pagination`'s "showing" line — do not print it twice;
- keep the request-sequence guard so an older page's response cannot overwrite a newer one.

- [ ] **Step 5: Reorder steps**

`TaskTemplatesPage` lists step templates, already filtered by faculty. Add reordering to that list, for administrators only.

- Each row becomes `draggable` with a grip icon (`GripVertical` from lucide) labelled `taskTemplates.dragHandle`, and carries `↑`/`↓` ghost buttons labelled `taskTemplates.moveUp`/`moveDown`, disabled at the ends. Use the browser's own `onDragStart`, `onDragOver` (with `event.preventDefault()`) and `onDrop`; no library.
- All three actions produce the same thing: a new array of ids. Apply it to local state immediately, then call `reorderTaskTemplates(facultyId, ids)`.
- On success, replace the list with the response (the server renumbers 1..n) and show a toast with `taskTemplates.reordered`.
- On failure, restore the array captured before the change and show the error through `useErrorMessage`.
- Reordering is only offered when a single faculty is selected — the order is unique *per faculty*, so a list showing every faculty cannot be reordered. Disable the handles and hide the hint when the faculty filter is "all", and show `taskTemplates.reorderHint` when it is not.
- A teacher sees the list exactly as they do today, with no handles and no arrows.

- [ ] **Step 6: Verify**

Run:

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: clean.

- [ ] **Step 7: Record the test gaps**

```markdown
### Interface
- Review queue: page controls move through a 60-item queue, filters reset to page 1, and a stale response cannot overwrite a newer page.
- Reordering: dropping a row and pressing the arrows produce the same request; a failed request restores the previous order.
- Reordering is unavailable when the faculty filter is "all" and for teachers.
- Archive: a teacher sees only their groups; the purge button is absent for a teacher.
- The matrix legend names five states and a cell past its deadline with nothing submitted shows the overdue badge.
- A rejection without a comment still renders the block on My topic.
- The topic page stops offering Reserve when the deadline passes with the page open.
```

---

> **Owner checkpoint — after Task 16.** The whole feature is built at this point; only the repository items and the commit remain. Report and ask whether to continue or stop and write a handoff.

---

### Task 17: Check scripts that leave nothing behind

Implements §9's first paragraph, and adds the script that verifies this phase.

**Files:**
- Create: `.superpowers/checks/checkCleanup.mjs`
- Create: `.superpowers/checks/hardening-check.mjs`
- Modify: `.superpowers/checks/onboarding-check.mjs`, `refinements-check.mjs`, `topics-check.mjs`, `workflow-check.mjs`, `design-system-check.mjs`, `fix-wave-backend-extra-check.mjs`, `templates-check.mjs`

**Interfaces:**
- Consumes: the whole API built in Tasks 1–16.
- Produces: `node .superpowers/checks/hardening-check.mjs`, the verification command for Task 19.

A correction to note before starting: the design calls `templates-check.mjs` the model, and it is — it is the only script that cleans up at all. But it deliberately **skips row cleanup when a check has already failed**, keeping the rows for diagnosis and restoring only shared state. That is the behaviour the owner is complaining about: a failed run is exactly when the leftovers accumulate. The rule below replaces it, and `templates-check.mjs` is brought up to the rule like every other script.

- [ ] **Step 1: Write the shared cleanup helper**

Create `.superpowers/checks/checkCleanup.mjs`:

```js
// Phase 8 §9. Every check script registers what it creates as it creates it, and the registry is
// drained in a `finally` - so a run that fails at check 12 of 60 still leaves the seeded data as
// it found it. Undo steps run newest-first, never assert, and never stop each other: a failure
// here is reported at the end, not thrown, because the script's own result is what matters.
export function createCleanup() {
  const undos = []
  const failures = []

  return {
    /// Register an undo step. `label` appears in the report if it fails.
    add(label, undo) {
      undos.push({ label, undo })
    },

    /// Run every registered step, newest first. Safe to call twice.
    async run() {
      while (undos.length > 0) {
        const { label, undo } = undos.pop()
        try {
          await undo()
        } catch (error) {
          failures.push(`${label}: ${error?.message ?? error}`)
        }
      }

      if (failures.length > 0) {
        console.log(`\nCleanup could not finish ${failures.length} step(s):`)
        for (const failure of failures) {
          console.log(`  - ${failure}`)
        }
        console.log('Remove these by hand before the next run.')
      } else {
        console.log('\nCleanup: nothing left behind.')
      }

      return failures.length === 0
    }
  }
}
```

Replace the `///` comments with `//` — this is JavaScript.

- [ ] **Step 2: Bring every script under the rule**

For each script in the list above:

1. Import and create the registry at the top: `import { createCleanup } from './checkCleanup.mjs'` and `const cleanup = createCleanup()`.
2. **Immediately after** each creation call that succeeds, register its undo. For example, after creating a group: `cleanup.add(\`group ${code}\`, () => call('DELETE', \`/api/groups/${id}\`, { token: admin }))`.
3. Wrap the whole run: `try { await runChecks() } finally { await cleanup.run() }`.
4. Move any existing cleanup into registrations, and delete the "skip cleanup when something failed" branches.

The registry order matters and comes for free: undo steps run newest-first, so a topic registered after its group is deleted before the group.

**Students need the three-step dance**, because a student can never be deleted and a group cannot be deleted while any student points at it. Register it as one undo step at the moment the students are created:

```js
cleanup.add('students -> seeded group', async () => {
  await call('POST', '/api/students/restore', { token: admin, json: { studentIds } })
  for (const id of studentIds) {
    await call('PUT', `/api/students/${id}`, { token: admin, json: { ...studentBodies[id], groupId: SEEDED_GROUP_ID } })
  }
  await call('POST', '/api/students/archive', { token: admin, json: { studentIds } })
})
```

Match each script's own `call` helper, its token variables and its request bodies — they differ between scripts. `SEEDED_GROUP_ID` is resolved at run time by looking up the group with code `SEED-A`, never hard-coded.

**Shared state is restored the same way**: the topic-selection deadline, `SEED-A`'s reviewer list and the registration switch are read before they are changed and registered as undo steps carrying the original value.

**Step templates** created by a run (the `RF Step …` rows `refinements-check.mjs` leaves behind) are registered for deletion too; a template that cannot be deleted because it is assigned to a group is first unassigned in the same undo step.

- [ ] **Step 3: Write the phase 8 check script**

Create `.superpowers/checks/hardening-check.mjs`, following the shape of `templates-check.mjs` (global `fetch`, a `check(name, actual, expected)` helper, a six-digit `stamp` for unique codes, emails and student numbers, and the cleanup registry from Step 1). It signs in as the seeded administrator, teacher and student, and asserts:

**Sessions and passwords (§2)**
1. Creating an administrator with an 11-character password answers `password.policyElevated`.
2. Creating one with a 12-character password succeeds.
3. Creating a teacher with an 8-character password still succeeds.
4. A student's token stops working immediately after that student is archived: the same token answers 401 on `/api/auth/me`.
5. After an access reset, the student's existing token answers 401 and a sign-in with the old password fails.
6. After re-claiming, a new token works.

**Uploads (§3)**
7. Submitting a `.docx` whose bytes are a plain ZIP without `[Content_Types].xml` answers `file.contentMismatch`.
8. Submitting a genuine minimal `.docx` (built with the zip writer `templates-check.mjs` already contains) succeeds.
9. A supporting file named `.txt` answers `file.typeNotAllowed`.
10. A supporting file named `.png` whose bytes are not PNG answers `file.contentMismatch`.
11. A genuine PNG supporting file succeeds.

**Identity (§5)**
12. Creating a student with number `AB{stamp}` and then another with `АВ {stamp}` (Cyrillic А and В, with a space) answers `student.numberTaken`.
13. The first student's number is returned exactly as entered.
14. A faculty colliding on name only answers `faculty.nameTaken`; on short name only, `faculty.shortNameTaken`.

**Archive (§4)**
15. Archiving a student leaves their steps and submissions readable.
16. `/api/archive/groups` contains their group with a file count greater than zero.
17. Deleting a group holding an active student answers `group.hasStudents`.
18. Deleting a group whose students are all archived answers 204.
19. The archived group's entry now reports `groupDeletedAt`.
20. The deleted group answers `group.notFound`, and one of its students' user ids no longer signs in.
21. Downloading an archived file returns the bytes that were uploaded.
22. A teacher who did not review that group answers `archive.notFound` for it.
23. A student answers 403 on `/api/archive/groups`.
24. Purging answers 204 and the archive is then empty of that group.

**Queue, progress and dashboards (§7, §8)**
25. `/api/review/queue?pageSize=2` returns two items and a total greater than two.
26. `page=2` returns different submission ids from `page=1`.
27. A step past its deadline with nothing submitted reports `isOverdue: true` in group progress, and one not yet due reports false.
28. Two late submissions of one step count as one in `lateSteps`.
29. `/api/dashboard/student` returns the most recent decision.
30. `/api/dashboard/teacher` returns `waitingReviews` equal to the queue's total and at most five `latestForReview`.
31. `/api/dashboard/admin` topic-selection figures sum to the active student count.

**Reordering (§6)**
32. `PUT /api/task-templates/order` with a reversed complete list renumbers 1..n.
33. A list missing one id answers `taskTemplate.orderMismatch` and leaves the order unchanged.
34. A list containing a duplicate answers `taskTemplate.orderMismatch`.

**Templates (§4.6)**
35. Replacing a template's file succeeds and the old file is no longer downloadable.

Print a `PASS`/`FAIL` line per check and a final `N/M` summary, and exit non-zero when any check failed — the same shape the other scripts use.

- [ ] **Step 4: Run every check script**

Ask the controller to start the API first — **do not start it yourself** (a subagent's `dotnet run` kills the controller's preview server, and the resulting confusion costs more than the wait).

```bash
node .superpowers/checks/hardening-check.mjs
```

```bash
for script in workflow-check topics-check refinements-check onboarding-check design-system-check templates-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: every script reports every check passing and ends with `Cleanup: nothing left behind.`

- [ ] **Step 5: Prove the cleanup**

Before and after the whole run, compare the seeded data:

```bash
node -e "const t=process.argv[1];(async()=>{const r=await fetch('http://localhost:5000/api/groups',{headers:{Authorization:'Bearer '+t}});const g=await r.json();const a=g.find(x=>x.code==='SEED-A');const s=await (await fetch('http://localhost:5000/api/groups/'+a.id+'/students',{headers:{Authorization:'Bearer '+t}})).json();const tp=await (await fetch('http://localhost:5000/api/topics',{headers:{Authorization:'Bearer '+t}})).json();const st=await (await fetch('http://localhost:5000/api/task-templates',{headers:{Authorization:'Bearer '+t}})).json();console.log(JSON.stringify({students:s.length,topics:tp.length,steps:st.length}))})()" "$ADMIN_TOKEN"
```

The three counts must be identical before and after. Report both numbers in the task report. If they differ, a script is still leaking — find which by running them one at a time.

---

### Task 18: Pin the line endings

Implements §9's second paragraph. **This task ends in its own commit**, separate from everything else, so the diff that rewrites line endings is never mixed with a diff that changes code.

**Files:**
- Create: `.gitattributes`

- [ ] **Step 1: Write the file**

Create `.gitattributes` at the repository root:

```gitattributes
# Phase 8 §9. Text is stored with LF and checked out with CRLF on Windows, which is what Visual
# Studio and the editors on both machines expect - so files stop flipping between the two and
# the history stops churning.
* text=auto eol=crlf

# Binary types are never converted.
*.docx binary
*.dotx binary
*.pptx binary
*.xlsx binary
*.pdf  binary
*.png  binary
*.jpg  binary
*.jpeg binary
*.gif  binary
*.ico  binary
*.woff binary
*.woff2 binary
*.ttf  binary
*.otf  binary
*.zip  binary
```

- [ ] **Step 2: Renormalise**

```bash
git add .gitattributes
```

```bash
git add --renormalize .
```

- [ ] **Step 3: Check what changed**

```bash
git status --short
```

Expected: `.gitattributes` added, plus the five files the design names — `backend/DiplomaTracker.Api/Services/GroupService.cs`, `Services/GroupTaskService.cs`, `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`, `backend/DiplomaTracker.Api/Migrations/AppDbContextModelSnapshot.cs`, `docs/superpowers/test-backlog.md` — and nothing else beyond files this plan has already edited.

```bash
git diff --cached --stat
```

If a file you have not touched appears with a large line count, it is a line-ending rewrite and belongs here. If a file you have touched appears, its content change belongs in Task 19 instead: unstage it with `git restore --staged <path>`, and re-add it with `git add --renormalize <path>` only if its line endings genuinely changed.

- [ ] **Step 4: Commit, alone**

```bash
git commit -m "Normalise line endings"
```

Nothing else is in this commit. Verify with `git show --stat HEAD`.

---

### Task 19: The schema, the verification and the commit

**Files:**
- Delete and regenerate: `backend/DiplomaTracker.Api/Migrations/*`
- Modify: `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: Ask before the database is dropped**

**Stop here and ask the owner.** This task drops and recreates the local database. Their standing instruction is to be told first, and the other machine will have to do the same when it next pulls. Do not run Step 2 until they have said yes.

While asking, tell them what will be lost: every hand-created row in `DiplomaTrackerDb` — the seeded accounts, faculty, department, group and step templates are recreated by the seeder, but any group, student, topic, submission or template made by hand or left by a check script is not.

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

The project keeps exactly one `InitialCreate` migration; nothing is deployed, so the schema is rebuilt rather than migrated.

```bash
rm -rf backend/DiplomaTracker.Api/Migrations
```

```bash
cd backend && dotnet ef migrations add InitialCreate --project DiplomaTracker.Api -- --environment Development
```

- [ ] **Step 4: Read the migration before trusting it**

```bash
grep -n "ArchivedGroups\|ArchivedFiles\|ArchivedGroupReviewers\|StudentNumberCanonical\|RowVersion" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected: the three archive tables are created; `StudentNumberCanonical` exists on `StudentProfiles` with a unique index, and `StudentNumber` no longer has one; `DocumentTemplates` has a `rowversion` column.

```bash
grep -n "IX_TopicReservations_PendingPerStudent\|IX_TopicReservations_ApprovedPerStudent\|IX_StudentProfiles_TopicId\|IX_ArchivedFiles_ArchivedGroupId_StorageKey" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected: both reservation indexes present with their separate filters (a single combined index here is the bug PROJECT_MEMORY warns about), `IX_StudentProfiles_TopicId` filtered on `[TopicId] IS NOT NULL`, and the archive's storage-key index unique.

- [ ] **Step 5: Rebuild and re-seed**

Ask the controller to start the API. It applies the migration and re-seeds development data on startup.

Confirm from the log that the migration was applied and the seeder ran, then confirm the model is settled:

```bash
cd backend && dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api -- --environment Development
```

Expected: `No changes have been made to the model since the last migration.`

- [ ] **Step 6: Full verification**

Every one of these must pass before the commit. Record the actual output of each in the task report — not "passed", the numbers.

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: all 56 existing tests pass. This plan adds no tests; if an existing test fails, it is asserting behaviour this phase deliberately changed (`lateSubmissions`, the supporting-file blocklist, `DeleteGroupAsync`'s signature) — update that test to the new behaviour and say so in the report. Do not delete a test to make it pass.

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: no type errors; lint 0/0; i18n both languages matching.

```bash
cd frontend/diploma-tracker-web && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: a successful production build.

```bash
node .superpowers/checks/hardening-check.mjs
```

```bash
for script in workflow-check topics-check refinements-check onboarding-check design-system-check templates-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: every script fully passing and ending with `Cleanup: nothing left behind.`

- [ ] **Step 7: Update the project memory**

In `docs/superpowers/PROJECT_MEMORY.md`:

- Status table: phase 8 becomes `Done — commit <hash>` with its design and plan paths.
- Add to **Gotchas**: uploads are an allowlist inspected as packages; a bearer token is re-checked against the account on every request; `StudentProfile.TopicId` is the single source of truth for a student's topic and `TopicReservations` is history; the archive shares storage keys with live files and a blob is deleted only when nothing references it; check scripts clean up in a `finally`; `.gitattributes` pins LF in the repository and CRLF on checkout.
- Add to the **Log**: one dated line summarising phase 8.
- Remove from **Parked for later** the items this phase closed (the phase 8 block, the two template-storage items).
- Keep the parked accessibility pass and the rate-limiting decision exactly as they are.

- [ ] **Step 8: Commit**

```bash
git add -A
```

```bash
git status --short
```

Check the list before committing: `.superpowers/sdd/` must not appear; `.superpowers/checks/*.mjs` must (they are tracked). No `App_Data/`, no `bin/`, no `obj/`.

```bash
git commit -m "Implement hardening and polish"
```

One bare title line. No body, no trailer.

```bash
git log --oneline -3
```

Expected: `Implement hardening and polish`, `Normalise line endings`, `Add hardening and polish design`.

- [ ] **Step 9: Report**

Report to the owner: what was built, the verification numbers from Step 6, the two commit hashes, and the fact that **the other machine must drop its own database** when it next pulls, because `InitialCreate` has a new id.

---

## Plan self-review

Checked against `docs/superpowers/specs/2026-09-21-hardening-and-polish-design.md`, section by section.

| Design section | Task |
|---|---|
| §2.1 session state, access reset end to end | 1 |
| §2.2 administrator password length | 1 |
| §2.3 logging vocabulary | 1 (vocabulary), 2 (application) |
| §3 package inspector, allowlists, neutral 413 | 3 |
| §4.1–§4.4 archive, shared storage keys | 6 |
| §4.5 reading, purging | 7, 16 |
| §4.6 template row version, replaced file deleted | 7 |
| §4.7 deleting a group with archived students | 6 |
| §5.1 student number canonical form | 4 |
| §5.2 conflicts name the right field | 4 |
| §5.3 one source of truth for a topic | 5 |
| §6 reordering | 12 (API), 16 (page) |
| §7.1 overdue cells | 10 (API), 14 (rendering) |
| §7.2 lateness in steps | 10, 14 |
| §7.3 student dashboard | 11, 15 |
| §7.4 teacher dashboard | 11, 15 |
| §7.5 administrator dashboard | 11, 15 |
| §7.6 topic page, two gaps | 14 |
| §8 deadline memo, topic projection, list projections, queue paging | 8, 5, 8, 9 |
| §9 check-script cleanup, line endings | 17, 18 |
| §10 data model changes | 4, 6, 7; migration regenerated in 19 |
| §11 API surface, new error codes | 6, 7, 9, 11, 12; translations in 13 |
| §12 amendments to earlier designs | **see below** |
| §13 deliberately not included | nothing to build |

**Gap found and closed:** §12 requires four earlier design documents to be amended, and no task did it. It belongs with the memory update, so it is added to Task 19 as a step:

- [ ] **Task 19, Step 7b: Amend the earlier designs**

Edit each file so it describes the system as it now is. These are small, surgical edits — a corrected sentence, not a rewrite, and never a changelog entry saying what used to be true.

- `docs/superpowers/specs/2026-09-17-submission-and-review-design.md` §5 — replace the supporting-files bullet with the allowlist (`.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`/`.jpeg`, every one inspected) and replace the main-file bullet's "content matching it" with the package inspection. Remove the banned-extension list.
- The same file, §7 — the queue row gains `page` and `pageSize` and returns a paged envelope; the student-progress row says *late steps* rather than *late submissions*.
- `docs/superpowers/specs/2026-09-17-topics-and-reservation-design.md` — state that `StudentProfile.TopicId` is the single source of truth and reservations are history.
- `docs/superpowers/specs/2026-09-17-document-templates-design.md` — `DocumentTemplate` carries a row version; a replaced file is deleted after the save commits.

**Placeholder scan:** none. Every code step carries the code; every specified page carries its components, state, behaviour and translation keys.

**Type consistency:** `PagedResponse<T>` (C#) ↔ `Paged<T>` (TypeScript) — deliberately different names, same shape, both declared. `GetReviewQueueAsync`'s five-argument form is declared in Task 9 and consumed in Task 11. `StudentWorkflowService.IsOverdue` is declared in Task 10 and reused in Task 11's SQL as an inline predicate (it cannot be called inside a LINQ-to-SQL expression, which is why Task 11 spells the condition out — this is intentional, not a divergence). `SecurityLog` method names used in Tasks 2, 6, 7 and 12 all exist in Task 1's class. `ArchiveErrors.NotFound` is declared in Task 6 and used in Task 7. `TaskErrors.TemplateOrderMismatch` is declared and used in Task 12. `lateSubmissions` → `lateSteps` is renamed in Task 10 (API), Task 13 (type) and Task 14 (the one component that reads it).
