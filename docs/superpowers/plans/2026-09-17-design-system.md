# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page one visual language modelled on schedule.kpi.ua, one set of shared components, Ukrainian and English interface text, and an API error contract (`{ code, message }`) that the interface translates.

**Architecture:** Backend: every service error becomes a stable code defined in a per-area catalogue together with its HTTP status and English message; one `ApiControllerBase.ErrorResult(code)` turns codes into responses, and the model-validation factory, exception handler and rate limiter emit the same shape. Frontend: Tailwind CSS v4 with tokens in `@theme`, Headless UI primitives wrapped in small components under `src/components/ui`, an `AppShell` with centred text tabs, `react-i18next` with typed keys, and `ApiError` carrying `code` so pages show translated messages. All existing pages move onto the components and translation keys without behaviour changes.

**Tech Stack:** .NET 8, EF Core 8.0.8; React 18.3, React Router 6, TypeScript 5.8, Vite 5.4, Tailwind CSS 4 (`tailwindcss`, `@tailwindcss/vite`), `@headlessui/react` 2, `lucide-react`, `i18next`, `react-i18next`, `@fontsource/exo-2`.

**Spec:** `docs/superpowers/specs/2026-09-17-design-system-design.md`

**Prerequisite:** `docs/superpowers/plans/2026-09-17-user-onboarding.md` is implemented and committed (this plan converts its error strings and migrates its pages).

## Global Constraints

- Reference application: **schedule.kpi.ua** — when a visual detail is unclear, match the reference.
- Tokens (exact values): `background #FFFFFF`, `surface #EFF0F8`, `surface-subtle #EEEEF7`, `border #AFB0BE`, `border-subtle #C7C8D5`, `text #000000`, `text-strong #141518`, `text-muted #808191`, `heading #14366C`, `accent #006DB3`, `accent-strong #004571`, `accent-soft #949DFF`, `accent-contrast #FFFFFF`; radii `card 20px`, `control 8px`, `pill 9999px`.
- Font **Exo 2** (weights 400, 500, 600, 700) self-hosted via `@fontsource/exo-2`; body 14px.
- Desktop only: `min-width: 1024px`; content max width `1200px`; page padding 32px.
- Navigation: centred horizontal **text** tabs; active tab bold and underlined; no pill backgrounds on tabs.
- Languages `uk` (default) and `en`; choice stored in `localStorage` key `dt.language`; `<html lang>` follows the choice. `en.json` has exactly the same key set as `uk.json`.
- Every API error body is `{ "code": string, "message": string }`, plus `fields` for `validation.failed` and `errors` for import row errors. Codes are `area.reason`. Controllers never compare message text.
- No dark theme, no phone layouts, no loading skeletons.
- Behaviour of existing pages and routes is unchanged except where this plan says otherwise.
- **No unit tests** are written. Existing test projects must still compile.
- **Commits: exactly one**, in the final task: `Implement design system`. No body, no trailer.
- Never stage `PROJECT_PAPER.md` or `frontend/diploma-tracker-web/README.md`.
- Shell is Git Bash; quote paths (spaces and Cyrillic); use `node` instead of Python.

## Rulings recorded while planning

- **Page migrations are specified, not transcribed.** Tasks 9–12 give each page's component structure, state, behaviour and complete translation blocks; the implementer writes the TSX against the component APIs defined in Tasks 5–7. Complete code is given for everything shared: error contract, catalogues, i18n, components, shell, API client. Cost if wrong: an implementer choice in page markup differs from what the owner pictured; fixed in the phase review.
- **Body references versus URL references get distinct codes** so one code maps to one status: e.g. `faculty.notFound` (404, URL) and `department.facultyNotFound` (400, request body).
- **Reviewer "must be a teacher" and "must be active" merge** into `reviewer.mustBeActiveTeacher`, matching `student.supervisorInvalid`.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Errors/ErrorDefinition.cs` | Code, status, English message |
| `backend/DiplomaTracker.Api/Errors/ApiErrorResponse.cs` | Response body |
| `backend/DiplomaTracker.Api/Errors/CommonErrors.cs` | Cross-cutting codes |
| `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs` | All definitions, lookup, duplicate detection |
| `backend/DiplomaTracker.Api/Errors/ValidationErrorResponseFactory.cs` | `validation.failed` body from model state |
| `backend/DiplomaTracker.Api/Controllers/ApiControllerBase.cs` | `ErrorResult(code)` |
| `backend/DiplomaTracker.Api/Services/AcademicStructureErrors.cs`, `GroupErrors.cs`, `TaskErrors.cs`, `OnboardingErrors.cs`, `PasswordPolicy.cs` | Area catalogues |
| `backend/DiplomaTracker.Api/Services/*Service.cs`, `Controllers/*Controller.cs` | Return and emit codes |
| `backend/DiplomaTracker.Api/Program.cs` | Validation factory, exception handler, rate-limit body, catalogue check |
| `frontend/diploma-tracker-web/vite.config.ts`, `package.json`, `tsconfig.app.json` | Tailwind plugin, dependencies, JSON modules |
| `frontend/diploma-tracker-web/src/index.css` | Tailwind entry and tokens (replaces old CSS) |
| `frontend/diploma-tracker-web/src/i18n/*` | i18next setup, `uk.json`, `en.json`, key types |
| `frontend/diploma-tracker-web/src/api/apiClient.ts`, `useErrorMessage.ts` | `ApiError` with code; translation of errors |
| `frontend/diploma-tracker-web/src/components/ui/*` | Shared components |
| `frontend/diploma-tracker-web/src/components/layout/*` | `AppShell`, `TabNav`, `UserMenu`, `LanguageSwitch`, `AuthLayout`, navigation |
| `frontend/diploma-tracker-web/src/pages/*` | Migrated pages |
| `.superpowers/checks/design-system-check.mjs` (git-ignored) | Error contract check |

---

### Task 1: Error contract infrastructure

**Files:**
- Create: `backend/DiplomaTracker.Api/Errors/ErrorDefinition.cs`
- Create: `backend/DiplomaTracker.Api/Errors/ApiErrorResponse.cs`
- Create: `backend/DiplomaTracker.Api/Errors/CommonErrors.cs`
- Create: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`
- Create: `backend/DiplomaTracker.Api/Errors/ValidationErrorResponseFactory.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/ApiControllerBase.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Produces:
  - `record ErrorDefinition(string Code, int Status, string Message)`.
  - `record ApiErrorResponse(string Code, string Message)` with init-only `Fields : IReadOnlyDictionary<string, string[]>?` and `Errors : object?`, both omitted from JSON when null.
  - `CommonErrors.ValidationFailed = "validation.failed"` (400), `Forbidden = "access.forbidden"` (403), `TooManyRequests = "request.tooMany"` (429), `Unexpected = "server.unexpected"` (500), `All : ErrorDefinition[]`.
  - `ErrorCatalog.Get(string? code) : ErrorDefinition` (unknown → `server.unexpected`), `ErrorCatalog.All : IReadOnlyCollection<ErrorDefinition>`.
  - `ApiControllerBase : ControllerBase` with `protected IActionResult ErrorResult(string? code, object? errors = null)` and `protected bool TryGetUserContext(out string role, out Guid userId)`.

- [ ] **Step 1: Create `Errors/ErrorDefinition.cs`**

```csharp
namespace DiplomaTracker.Api.Errors;

public sealed record ErrorDefinition(string Code, int Status, string Message);
```

- [ ] **Step 2: Create `Errors/ApiErrorResponse.cs`**

```csharp
using System.Text.Json.Serialization;

namespace DiplomaTracker.Api.Errors;

public sealed record ApiErrorResponse(string Code, string Message)
{
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public IReadOnlyDictionary<string, string[]>? Fields { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? Errors { get; init; }

    public static ApiErrorResponse From(ErrorDefinition definition) => new(definition.Code, definition.Message);
}
```

- [ ] **Step 3: Create `Errors/CommonErrors.cs`**

```csharp
namespace DiplomaTracker.Api.Errors;

public static class CommonErrors
{
    public const string ValidationFailed = "validation.failed";
    public const string Forbidden = "access.forbidden";
    public const string TooManyRequests = "request.tooMany";
    public const string Unexpected = "server.unexpected";

    public static readonly ErrorDefinition[] All =
    [
        new(ValidationFailed, StatusCodes.Status400BadRequest, "One or more fields are invalid."),
        new(Forbidden, StatusCodes.Status403Forbidden, "You do not have access to this resource."),
        new(TooManyRequests, StatusCodes.Status429TooManyRequests, "Too many attempts. Wait a minute and try again."),
        new(Unexpected, StatusCodes.Status500InternalServerError, "An unexpected error occurred.")
    ];
}
```

- [ ] **Step 4: Create `Errors/ErrorCatalog.cs`**

The area catalogues referenced here are converted in Task 2; until then, create this file with only `CommonErrors.All` in the array and add the other four entries in Task 2 Step 6.

```csharp
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Errors;

public static class ErrorCatalog
{
    private static readonly Dictionary<string, ErrorDefinition> Definitions = BuildDefinitions();

    public static IReadOnlyCollection<ErrorDefinition> All => Definitions.Values;

    public static ErrorDefinition Get(string? code) =>
        code is not null && Definitions.TryGetValue(code, out var definition)
            ? definition
            : Definitions[CommonErrors.Unexpected];

    private static Dictionary<string, ErrorDefinition> BuildDefinitions()
    {
        ErrorDefinition[][] areas =
        [
            CommonErrors.All
        ];

        var definitions = new Dictionary<string, ErrorDefinition>(StringComparer.Ordinal);
        foreach (var definition in areas.SelectMany(area => area))
        {
            if (!definitions.TryAdd(definition.Code, definition))
            {
                throw new InvalidOperationException($"Error code '{definition.Code}' is defined more than once.");
            }
        }

        return definitions;
    }
}
```

- [ ] **Step 5: Create `Errors/ValidationErrorResponseFactory.cs`**

```csharp
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace DiplomaTracker.Api.Errors;

public static class ValidationErrorResponseFactory
{
    public static ApiErrorResponse Create(ModelStateDictionary modelState)
    {
        var fields = modelState
            .Where(entry => entry.Value is { Errors.Count: > 0 })
            .ToDictionary(
                entry => ToFieldName(entry.Key),
                entry => entry.Value!.Errors.Select(error => Classify(error.ErrorMessage)).Distinct().ToArray());

        return ApiErrorResponse.From(ErrorCatalog.Get(CommonErrors.ValidationFailed)) with { Fields = fields };
    }

    private static string ToFieldName(string key)
    {
        var name = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
        return name.Length == 0 ? "request" : char.ToLowerInvariant(name[0]) + name[1..];
    }

    private static string Classify(string message)
    {
        if (message.Contains("required", StringComparison.OrdinalIgnoreCase)) return "required";
        if (message.Contains("maximum length", StringComparison.OrdinalIgnoreCase)) return "maxLength";
        if (message.Contains("minimum length", StringComparison.OrdinalIgnoreCase)) return "minLength";
        if (message.Contains("e-mail", StringComparison.OrdinalIgnoreCase)) return "format";
        return "invalid";
    }
}
```

- [ ] **Step 6: Create `Controllers/ApiControllerBase.cs`**

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Errors;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult ErrorResult(string? code, object? errors = null)
    {
        var definition = ErrorCatalog.Get(code);
        return StatusCode(definition.Status, ApiErrorResponse.From(definition) with { Errors = errors });
    }

    protected bool TryGetUserContext(out string role, out Guid userId)
    {
        role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        return Guid.TryParse(userIdValue, out userId) && role.Length > 0;
    }
}
```

- [ ] **Step 7: Wire the contract into `Program.cs`**

Add `using DiplomaTracker.Api.Errors;` to the usings.

Replace `builder.Services.AddControllers();` with:

```csharp
builder.Services.AddControllers().ConfigureApiBehaviorOptions(options =>
{
    options.InvalidModelStateResponseFactory = context =>
        new BadRequestObjectResult(ValidationErrorResponseFactory.Create(context.ModelState));
});
```

Inside `AddRateLimiter(options => { ... })`, after `options.RejectionStatusCode = ...;` add:

```csharp
    options.OnRejected = async (context, cancellationToken) =>
    {
        var definition = ErrorCatalog.Get(CommonErrors.TooManyRequests);
        context.HttpContext.Response.StatusCode = definition.Status;
        await context.HttpContext.Response.WriteAsJsonAsync(ApiErrorResponse.From(definition), cancellationToken);
    };
```

Directly after `var app = builder.Build();` add:

```csharp
_ = ErrorCatalog.All.Count;

app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var definition = ErrorCatalog.Get(CommonErrors.Unexpected);
    context.Response.StatusCode = definition.Status;
    await context.Response.WriteAsJsonAsync(ApiErrorResponse.From(definition));
}));
```

- [ ] **Step 8: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Warning(s) 0 Error(s)`.

---

### Task 2: Error catalogues and code-returning services

**Files:**
- Replace: `backend/DiplomaTracker.Api/Services/AcademicStructureErrors.cs`
- Create: `backend/DiplomaTracker.Api/Services/GroupErrors.cs`
- Create: `backend/DiplomaTracker.Api/Services/TaskErrors.cs`
- Replace: `backend/DiplomaTracker.Api/Services/OnboardingErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Services/PasswordPolicy.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Students/StudentImportResult.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentImportService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs`, `GroupTaskService.cs`, `TaskTemplateService.cs`, `DepartmentService.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`

**Interfaces:**
- Consumes: `ErrorDefinition` (Task 1).
- Produces: the constants below. After this task, every `string? error` returned by a service is one of these codes; no service returns English text.

- [ ] **Step 1: Replace `Services/AcademicStructureErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class AcademicStructureErrors
{
    public const string FacultyNotFound = "faculty.notFound";
    public const string FacultyNameTaken = "faculty.nameTaken";
    public const string FacultyShortNameTaken = "faculty.shortNameTaken";
    public const string FacultyHasDepartments = "faculty.hasDepartments";

    public const string DepartmentNotFound = "department.notFound";
    public const string DepartmentNameTaken = "department.nameTaken";
    public const string DepartmentShortNameTaken = "department.shortNameTaken";
    public const string DepartmentHasGroups = "department.hasGroups";
    public const string DepartmentFacultyNotFound = "department.facultyNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(FacultyNotFound, StatusCodes.Status404NotFound, "Faculty not found."),
        new(FacultyNameTaken, StatusCodes.Status409Conflict, "Faculty with the same name already exists."),
        new(FacultyShortNameTaken, StatusCodes.Status409Conflict, "Faculty with the same short name already exists."),
        new(FacultyHasDepartments, StatusCodes.Status409Conflict, "Cannot delete faculty because departments are assigned."),
        new(DepartmentNotFound, StatusCodes.Status404NotFound, "Department not found."),
        new(DepartmentNameTaken, StatusCodes.Status409Conflict, "Department with the same name already exists in this faculty."),
        new(DepartmentShortNameTaken, StatusCodes.Status409Conflict, "Department with the same short name already exists in this faculty."),
        new(DepartmentHasGroups, StatusCodes.Status409Conflict, "Cannot delete department because groups are assigned."),
        new(DepartmentFacultyNotFound, StatusCodes.Status400BadRequest, "The selected faculty does not exist.")
    ];
}
```

In `Services/DepartmentService.cs`, replace every `AcademicStructureErrors.FacultyNotFound` with `AcademicStructureErrors.DepartmentFacultyNotFound` (create and update, including the foreign-key catch blocks). `GetDepartmentsAsync` keeps returning `null` for an unknown faculty.

- [ ] **Step 2: Create `Services/GroupErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class GroupErrors
{
    public const string NotFound = "group.notFound";
    public const string Duplicate = "group.duplicate";
    public const string HasStudents = "group.hasStudents";
    public const string DepartmentNotFound = "group.departmentNotFound";
    public const string ReviewerNotFound = "reviewer.notFound";
    public const string ReviewerMustBeActiveTeacher = "reviewer.mustBeActiveTeacher";
    public const string ReviewerAlreadyAssigned = "reviewer.alreadyAssigned";
    public const string ReviewerAssignmentNotFound = "reviewer.assignmentNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Group not found."),
        new(Duplicate, StatusCodes.Status409Conflict, "Group with the same name and academic year already exists."),
        new(HasStudents, StatusCodes.Status409Conflict, "Cannot delete group because students are assigned."),
        new(DepartmentNotFound, StatusCodes.Status400BadRequest, "The selected department does not exist."),
        new(ReviewerNotFound, StatusCodes.Status400BadRequest, "The selected reviewer does not exist."),
        new(ReviewerMustBeActiveTeacher, StatusCodes.Status400BadRequest, "Reviewer must be an active teacher."),
        new(ReviewerAlreadyAssigned, StatusCodes.Status409Conflict, "Reviewer is already assigned to this group."),
        new(ReviewerAssignmentNotFound, StatusCodes.Status404NotFound, "Reviewer assignment not found.")
    ];
}
```

In `Services/GroupService.cs`:
- delete the private constant `DuplicateGroup` and use `GroupErrors.Duplicate` wherever it was used;
- replace `AcademicStructureErrors.DepartmentNotFound` with `GroupErrors.DepartmentNotFound`;
- replace the literals exactly as follows:

| Literal | Constant |
|---|---|
| `"Group not found."` | `GroupErrors.NotFound` |
| `"Cannot delete group because students are assigned."` | `GroupErrors.HasStudents` |
| `"Forbidden."` | `CommonErrors.Forbidden` (add `using DiplomaTracker.Api.Errors;`) |
| `"Reviewer not found."` | `GroupErrors.ReviewerNotFound` |
| `"Reviewer must be a teacher."` | `GroupErrors.ReviewerMustBeActiveTeacher` |
| `"Reviewer must be active."` | `GroupErrors.ReviewerMustBeActiveTeacher` |
| `"Reviewer is already assigned to this group."` | `GroupErrors.ReviewerAlreadyAssigned` |
| `"Reviewer assignment not found."` | `GroupErrors.ReviewerAssignmentNotFound` |

- [ ] **Step 3: Create `Services/TaskErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TaskErrors
{
    public const string TemplateNotFound = "taskTemplate.notFound";
    public const string TemplateOrderInvalid = "taskTemplate.orderInvalid";
    public const string TemplateTitleRequired = "taskTemplate.titleRequired";
    public const string TemplateTitleTaken = "taskTemplate.titleTaken";

    public const string GroupTaskNotFound = "groupTask.notFound";
    public const string GroupTaskGroupNotFound = "groupTask.groupNotFound";
    public const string GroupTaskTemplateNotFound = "groupTask.templateNotFound";
    public const string GroupTaskTemplateInactive = "groupTask.templateInactive";
    public const string GroupTaskAlreadyAssigned = "groupTask.alreadyAssigned";
    public const string GroupTaskNoTemplates = "groupTask.noTemplates";
    public const string GroupTaskDuplicateTemplates = "groupTask.duplicateTemplates";
    public const string GroupTaskHasProgress = "groupTask.hasProgress";

    public const string StudentTaskNotFound = "studentTask.notFound";
    public const string StudentProfileNotFound = "student.profileNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(TemplateNotFound, StatusCodes.Status404NotFound, "Task template not found."),
        new(TemplateOrderInvalid, StatusCodes.Status400BadRequest, "Order must be greater than 0."),
        new(TemplateTitleRequired, StatusCodes.Status400BadRequest, "Title is required."),
        new(TemplateTitleTaken, StatusCodes.Status409Conflict, "Active template with this title already exists."),
        new(GroupTaskNotFound, StatusCodes.Status404NotFound, "Group task not found."),
        new(GroupTaskGroupNotFound, StatusCodes.Status400BadRequest, "The selected group does not exist."),
        new(GroupTaskTemplateNotFound, StatusCodes.Status400BadRequest, "One or more selected task templates do not exist."),
        new(GroupTaskTemplateInactive, StatusCodes.Status400BadRequest, "Selected task templates must be active."),
        new(GroupTaskAlreadyAssigned, StatusCodes.Status409Conflict, "Task template is already assigned to this group."),
        new(GroupTaskNoTemplates, StatusCodes.Status400BadRequest, "At least one task template is required."),
        new(GroupTaskDuplicateTemplates, StatusCodes.Status400BadRequest, "Request contains duplicate task templates."),
        new(GroupTaskHasProgress, StatusCodes.Status409Conflict, "Cannot delete group task because related student tasks are no longer pending."),
        new(StudentTaskNotFound, StatusCodes.Status404NotFound, "Task not found."),
        new(StudentProfileNotFound, StatusCodes.Status404NotFound, "Student profile not found.")
    ];
}
```

In `Services/TaskTemplateService.cs` replace:

| Literal | Constant |
|---|---|
| `"Order must be greater than 0."` | `TaskErrors.TemplateOrderInvalid` |
| `"Title is required."` | `TaskErrors.TemplateTitleRequired` |
| `"Task template not found."` | `TaskErrors.TemplateNotFound` |
| `"Active template with this title already exists."` | `TaskErrors.TemplateTitleTaken` |

In `Services/GroupTaskService.cs` (add `using DiplomaTracker.Api.Errors;`) replace, by method:

| Method | Literal | Constant |
|---|---|---|
| `GetGroupTaskByIdAsync`, `UpdateGroupTaskAsync`, `DeleteGroupTaskAsync` | `"Group task not found."` | `TaskErrors.GroupTaskNotFound` |
| `GetTasksForGroupAsync`, `AssignAllTaskTemplatesAsync` (group id from the URL) | `"Group not found."` | `GroupErrors.NotFound` |
| `CreateGroupTaskAsync` (group id from the body) | `"Group not found."` | `TaskErrors.GroupTaskGroupNotFound` |
| any | `"Forbidden."` | `CommonErrors.Forbidden` |
| `CreateGroupTaskAsync` | `"Task template not found."` | `TaskErrors.GroupTaskTemplateNotFound` |
| `CreateGroupTaskAsync` | `"Task template must be active."` | `TaskErrors.GroupTaskTemplateInactive` |
| `CreateGroupTaskAsync` | `"Task template is already assigned to this group."` | `TaskErrors.GroupTaskAlreadyAssigned` |
| `AssignAllTaskTemplatesAsync` | `"At least one task template is required."` | `TaskErrors.GroupTaskNoTemplates` |
| `AssignAllTaskTemplatesAsync` | `"Request contains duplicate task template IDs."` | `TaskErrors.GroupTaskDuplicateTemplates` |
| `AssignAllTaskTemplatesAsync` | `"One or more task templates were not found."` | `TaskErrors.GroupTaskTemplateNotFound` |
| `AssignAllTaskTemplatesAsync` | `"All selected task templates must be active."` | `TaskErrors.GroupTaskTemplateInactive` |
| `DeleteGroupTaskAsync` | `"Cannot delete group task because related student tasks are no longer pending."` | `TaskErrors.GroupTaskHasProgress` |
| `GetMyTasksAsync`, `GetMyTaskByIdAsync` | `"Student profile not found."` | `TaskErrors.StudentProfileNotFound` |
| `GetMyTaskByIdAsync` | `"Task not found."` | `TaskErrors.StudentTaskNotFound` |

- [ ] **Step 4: Replace `Services/OnboardingErrors.cs` and the password rule**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class OnboardingErrors
{
    public const string InvalidCredentials = "auth.invalidCredentials";
    public const string RegistrationClosed = "registration.closed";
    public const string ClaimDetailsMismatch = "auth.claimMismatch";
    public const string CurrentPasswordIncorrect = "auth.currentPasswordIncorrect";
    public const string UserNotFound = "auth.userNotFound";

    public const string StudentNotFound = "student.notFound";
    public const string TeacherNotFound = "teacher.notFound";
    public const string GroupNotFound = "student.groupNotFound";
    public const string SupervisorNotFound = "student.supervisorNotFound";
    public const string SupervisorMustBeActiveTeacher = "student.supervisorInvalid";
    public const string EmailTaken = "user.emailTaken";
    public const string StudentNumberTaken = "student.numberTaken";

    public const string ImportGroupNotFound = "import.groupNotFound";
    public const string ImportFileMissing = "import.fileMissing";
    public const string ImportFileNotCsv = "import.notCsv";
    public const string ImportFileTooLarge = "import.tooLarge";
    public const string ImportFileNotUtf8 = "import.notUtf8";
    public const string ImportTooManyRows = "import.tooManyRows";
    public const string ImportHeaderInvalid = "import.headerInvalid";
    public const string ImportHasRowErrors = "import.rowErrors";
    public const string ImportConflict = "import.conflict";

    public const string RowRequired = "import.row.required";
    public const string RowNameTooLong = "import.row.nameTooLong";
    public const string RowInvalidEmail = "import.row.invalidEmail";
    public const string RowNumberTooLong = "import.row.numberTooLong";
    public const string RowDuplicateEmail = "import.row.duplicateEmail";
    public const string RowDuplicateNumber = "import.row.duplicateNumber";
    public const string RowStaffEmail = "import.row.staffEmail";
    public const string RowEmailNumberMismatch = "import.row.emailNumberMismatch";
    public const string RowNumberEmailMismatch = "import.row.numberEmailMismatch";

    public static readonly ErrorDefinition[] All =
    [
        new(InvalidCredentials, StatusCodes.Status401Unauthorized, "Invalid email or password."),
        new(RegistrationClosed, StatusCodes.Status403Forbidden, "Registration is closed."),
        new(ClaimDetailsMismatch, StatusCodes.Status400BadRequest, "These details don't match an account waiting to be claimed."),
        new(CurrentPasswordIncorrect, StatusCodes.Status400BadRequest, "Current password is incorrect."),
        new(UserNotFound, StatusCodes.Status401Unauthorized, "User not found."),
        new(StudentNotFound, StatusCodes.Status404NotFound, "Student not found."),
        new(TeacherNotFound, StatusCodes.Status404NotFound, "Teacher not found."),
        new(GroupNotFound, StatusCodes.Status400BadRequest, "The selected group does not exist."),
        new(SupervisorNotFound, StatusCodes.Status400BadRequest, "The selected supervisor does not exist."),
        new(SupervisorMustBeActiveTeacher, StatusCodes.Status400BadRequest, "Supervisor must be an active teacher."),
        new(EmailTaken, StatusCodes.Status409Conflict, "Email already exists."),
        new(StudentNumberTaken, StatusCodes.Status409Conflict, "Student number already exists."),
        new(ImportGroupNotFound, StatusCodes.Status404NotFound, "Group not found."),
        new(ImportFileMissing, StatusCodes.Status400BadRequest, "Choose a CSV file to upload."),
        new(ImportFileNotCsv, StatusCodes.Status400BadRequest, "Only .csv files can be imported."),
        new(ImportFileTooLarge, StatusCodes.Status400BadRequest, "The file is larger than 1 MB."),
        new(ImportFileNotUtf8, StatusCodes.Status400BadRequest, "Save the file as \"CSV UTF-8\" and upload it again."),
        new(ImportTooManyRows, StatusCodes.Status400BadRequest, "The file contains more than 500 students."),
        new(ImportHeaderInvalid, StatusCodes.Status400BadRequest, "The first line must name the columns lastName, firstName, email and studentNumber."),
        new(ImportHasRowErrors, StatusCodes.Status400BadRequest, "The file contains errors. Nothing was imported."),
        new(ImportConflict, StatusCodes.Status409Conflict, "The student list changed during import; upload the file again."),
        new(PasswordPolicy.Violation, StatusCodes.Status400BadRequest, "Password must be between 8 and 128 characters.")
    ];

    public static readonly IReadOnlyDictionary<string, string> RowMessages = new Dictionary<string, string>
    {
        [RowRequired] = "lastName, firstName, email and studentNumber are required.",
        [RowNameTooLong] = "Names must be at most 100 characters.",
        [RowInvalidEmail] = "\"{email}\" is not a valid email address.",
        [RowNumberTooLong] = "Student number must be at most 32 characters.",
        [RowDuplicateEmail] = "Email {email} already appears on line {line}.",
        [RowDuplicateNumber] = "Student number {number} already appears on line {line}.",
        [RowStaffEmail] = "Email belongs to a teacher or an administrator.",
        [RowEmailNumberMismatch] = "Email belongs to an existing student with a different student number.",
        [RowNumberEmailMismatch] = "Student number belongs to an existing student with a different email."
    };
}
```

In `Services/PasswordPolicy.cs` replace the `Violation` line with:

```csharp
    public const string Violation = "password.policy";
```

In `Services/StudentImportService.cs`, replace `StudentImportOutcome.Failed(OnboardingErrors.GroupNotFound)` with `StudentImportOutcome.Failed(OnboardingErrors.ImportGroupNotFound)`.

- [ ] **Step 5: Make import row errors carry codes**

Replace `DTOs/Students/StudentImportResult.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Students;

public sealed record SkippedImportRow(int Line, string Email);

public sealed record ImportRowError(int Line, string Code, string Message, IReadOnlyDictionary<string, string>? Params = null)
{
    public static ImportRowError Create(int line, string code, IReadOnlyDictionary<string, string>? parameters = null)
    {
        var message = Services.OnboardingErrors.RowMessages[code];
        if (parameters is not null)
        {
            foreach (var (name, value) in parameters)
            {
                message = message.Replace("{" + name + "}", value, StringComparison.Ordinal);
            }
        }

        return new ImportRowError(line, code, message, parameters);
    }
}

public class StudentImportResult
{
    public int Created { get; set; }
    public IReadOnlyList<SkippedImportRow> Skipped { get; set; } = [];
}
```

In `Services/StudentImportService.cs` replace each `new ImportRowError(...)` call:

| Current | Replacement |
|---|---|
| `new ImportRowError(row.Line, "Email belongs to a teacher or an administrator.")` | `ImportRowError.Create(row.Line, OnboardingErrors.RowStaffEmail)` |
| `new ImportRowError(row.Line, "Email belongs to an existing student with a different student number.")` | `ImportRowError.Create(row.Line, OnboardingErrors.RowEmailNumberMismatch)` |
| `new ImportRowError(row.Line, "Student number belongs to an existing student with a different email.")` | `ImportRowError.Create(row.Line, OnboardingErrors.RowNumberEmailMismatch)` |
| `new ImportRowError(record.LineNumber, "lastName, firstName, email and studentNumber are required.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowRequired)` |
| `new ImportRowError(record.LineNumber, "Names must be at most 100 characters.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowNameTooLong)` |
| `new ImportRowError(record.LineNumber, $"\"{email}\" is not a valid email address.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowInvalidEmail, new Dictionary<string, string> { ["email"] = email })` |
| `new ImportRowError(record.LineNumber, "Student number must be at most 32 characters.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowNumberTooLong)` |
| `new ImportRowError(record.LineNumber, $"Email {email} already appears on line {firstEmailLine}.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowDuplicateEmail, new Dictionary<string, string> { ["email"] = email, ["line"] = firstEmailLine.ToString() })` |
| `new ImportRowError(record.LineNumber, $"Student number {studentNumber} already appears on line {firstNumberLine}.")` | `ImportRowError.Create(record.LineNumber, OnboardingErrors.RowDuplicateNumber, new Dictionary<string, string> { ["number"] = studentNumber, ["line"] = firstNumberLine.ToString() })` |

- [ ] **Step 6: Register all catalogues in `Errors/ErrorCatalog.cs`**

Replace the `areas` array with:

```csharp
        ErrorDefinition[][] areas =
        [
            CommonErrors.All,
            AcademicStructureErrors.All,
            GroupErrors.All,
            TaskErrors.All,
            OnboardingErrors.All
        ];
```

- [ ] **Step 7: Verify no English error text remains in services**

```bash
cd backend/DiplomaTracker.Api
grep -rn 'return (null, "\|return (false, "' Services/ ; echo "exit=$?"
dotnet build --nologo -v q
```

Expected: no grep output and `exit=1`; build `0 Error(s)`. Build errors at this point come only from controllers comparing removed strings or constants that changed meaning; Task 3 rewrites them — if the build fails only in `Controllers/`, continue to Task 3 and build there.

---

### Task 3: Controllers emit the contract

**Files:**
- Modify: every controller in `backend/DiplomaTracker.Api/Controllers/` except `HealthController.cs` and `DashboardController.cs`

**Interfaces:**
- Consumes: `ApiControllerBase.ErrorResult`, `TryGetUserContext`; every catalogue.
- Produces: every non-2xx response from these controllers has the `{ code, message }` body with the status from the catalogue.

Apply these rules to `AuthController`, `RegistrationController`, `StudentsController`, `TeachersController`, `StudentImportController`, `FacultiesController`, `DepartmentsController`, `GroupsController`, `GroupTasksController`, `StudentTasksController`, `TaskTemplatesController`:

1. Change the base class from `ControllerBase` to `ApiControllerBase`. Keep the existing `[ApiController]`, `[Route]` and `[Authorize]` attributes.
2. Delete every private `ToErrorResult` method and every `if (error == "...")` chain; the failure branch of each action becomes `return ErrorResult(error);`. Success branches are unchanged.
3. Replace every `return Forbid();` with `return ErrorResult(CommonErrors.Forbidden);`.
4. Replace private user-context helpers (`GetUserContext`, the inline `ClaimTypes.Role` / `NameIdentifier` parsing, `TryGetUserId`) with `TryGetUserContext(out var role, out var userId)`; when it returns `false`, `return ErrorResult(CommonErrors.Forbidden);`. `AuthController` returns `ErrorResult(OnboardingErrors.UserNotFound)` in that case.
5. Replace bare `NotFound()` results with the area code:

| Controller action | Code |
|---|---|
| `FacultiesController.GetById`, `GetDepartments` (null from service) | `AcademicStructureErrors.FacultyNotFound` |
| `DepartmentsController.GetById` | `AcademicStructureErrors.DepartmentNotFound` |
| `DepartmentsController.GetAll` (null from service) | `AcademicStructureErrors.FacultyNotFound` |
| `GroupsController.GetById`, `GetReviewers` (null) | `GroupErrors.NotFound` |
| `StudentsController.GetById` | `OnboardingErrors.StudentNotFound` |
| `TeachersController.GetById` | `OnboardingErrors.TeacherNotFound` |
| `TaskTemplatesController.GetById` | `TaskErrors.TemplateNotFound` |

6. `AuthController.Login` returns `ErrorResult(OnboardingErrors.InvalidCredentials)` instead of `Unauthorized()`. `AuthController.Claim` and `ChangePassword` return `ErrorResult(error)` on failure.
7. `StudentImportController.Import` failure branch becomes `return ErrorResult(outcome.Error, outcome.RowErrors.Count > 0 ? outcome.RowErrors : null);`.
8. Add `using DiplomaTracker.Api.Errors;` and `using DiplomaTracker.Api.Services;` where the constants are used.

- [ ] **Step 1: Apply the rules to each controller listed above**

- [ ] **Step 2: Confirm no message comparison or bare framework result remains**

```bash
cd backend/DiplomaTracker.Api
grep -rn 'error == "\|Forbid()\|NotFound()\|Unauthorized()\|new { message' Controllers/ | grep -v "DashboardController\|HealthController"; echo "exit=$?"
dotnet build --nologo -v q
dotnet build ../DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project .
```

Expected: no grep output and `exit=1`; both builds `0 Error(s)`; no pending model changes. If the test project fails to compile because a test asserts a removed English string, change only that assertion to the new constant.

---

### Task 4: Frontend toolchain, tokens and languages

**Files:**
- Modify: `frontend/diploma-tracker-web/package.json` (via npm)
- Modify: `frontend/diploma-tracker-web/vite.config.ts`
- Modify: `frontend/diploma-tracker-web/tsconfig.app.json`
- Replace: `frontend/diploma-tracker-web/src/index.css`
- Delete: `frontend/diploma-tracker-web/src/App.css`
- Create: `frontend/diploma-tracker-web/src/i18n/index.ts`, `uk.json`, `en.json`, `i18next.d.ts`
- Modify: `frontend/diploma-tracker-web/src/main.tsx`

**Interfaces:**
- Produces: Tailwind utilities for every token (`bg-surface`, `text-heading`, `border-border-subtle`, `rounded-card`, `rounded-control`, `rounded-pill`, `shadow-subtle`, `shadow-inset`, …); `i18n` default export; `LANGUAGE_STORAGE_KEY = 'dt.language'`; `type Language = 'uk' | 'en'`; typed `t()` keys derived from `uk.json`.

- [ ] **Step 1: Install dependencies**

```bash
cd frontend/diploma-tracker-web
npm install tailwindcss@^4 @tailwindcss/vite@^4 @headlessui/react@^2 lucide-react i18next react-i18next @fontsource/exo-2
```

Expected: `added N packages` and no `ERESOLVE` error. Record the installed versions in the task report.

- [ ] **Step 2: Replace `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

- [ ] **Step 3: Allow JSON imports**

In `tsconfig.app.json`, add inside `compilerOptions` after `"jsx": "react-jsx",`:

```json
    "resolveJsonModule": true,
```

- [ ] **Step 4: Replace `src/index.css`**

```css
@import "tailwindcss";

@theme {
  --font-sans: "Exo 2", system-ui, -apple-system, "Segoe UI", sans-serif;

  --color-background: #ffffff;
  --color-surface: #eff0f8;
  --color-surface-subtle: #eeeef7;
  --color-border: #afb0be;
  --color-border-subtle: #c7c8d5;
  --color-text: #000000;
  --color-text-strong: #141518;
  --color-text-muted: #808191;
  --color-heading: #14366c;
  --color-accent: #006db3;
  --color-accent-strong: #004571;
  --color-accent-soft: #949dff;
  --color-accent-contrast: #ffffff;
  --color-success: #1e7e34;
  --color-success-soft: #e6f4ea;
  --color-warning: #a15c00;
  --color-warning-soft: #fff4e0;
  --color-danger: #c5221f;
  --color-danger-soft: #fce8e6;

  --radius-card: 20px;
  --radius-control: 8px;
  --radius-pill: 9999px;

  --shadow-subtle: 0 0 2px 0 rgba(0, 0, 0, 0.12);
  --shadow-inset: inset 0 0 8px 0 rgba(136, 136, 136, 0.08);
}

@layer base {
  html,
  body {
    background-color: var(--color-background);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 14px;
  }

  body {
    margin: 0;
    min-width: 1024px;
  }

  #root {
    min-height: 100vh;
  }
}
```

Delete `src/App.css` and remove any import of it.

- [ ] **Step 5: Create `src/i18n/uk.json`**

This is the base resource; later tasks add page blocks to both language files.

```json
{
  "app": {
    "name": "Diploma Tracker"
  },
  "common": {
    "save": "Зберегти",
    "saving": "Збереження…",
    "cancel": "Скасувати",
    "close": "Закрити",
    "create": "Створити",
    "creating": "Створення…",
    "edit": "Редагувати",
    "delete": "Видалити",
    "deleting": "Видалення…",
    "remove": "Прибрати",
    "confirm": "Підтвердити",
    "back": "Назад",
    "loading": "Завантаження…",
    "active": "Активний",
    "inactive": "Неактивний",
    "yes": "Так",
    "no": "Ні",
    "notSet": "Не вказано",
    "notAssigned": "Не призначено",
    "noDescription": "Без опису",
    "actions": "Дії",
    "status": "Статус",
    "details": "Деталі",
    "optional": "необов'язково",
    "select": "Оберіть…",
    "savedToast": "Зміни збережено",
    "deletedToast": "Видалено"
  },
  "nav": {
    "dashboard": "Головна",
    "faculties": "Факультети",
    "groups": "Групи",
    "students": "Студенти",
    "teachers": "Викладачі",
    "taskTemplates": "Етапи",
    "myTasks": "Мої етапи",
    "account": "Обліковий запис",
    "signOut": "Вийти",
    "language": "Мова"
  },
  "roles": {
    "Admin": "Адміністратор",
    "Teacher": "Викладач",
    "Student": "Студент"
  },
  "validation": {
    "required": "Заповніть це поле.",
    "passwordLength": "Пароль має містити від 8 до 128 символів.",
    "passwordMismatch": "Паролі не збігаються."
  },
  "errors": {
    "network": "Немає з'єднання із сервером. Спробуйте ще раз.",
    "validation": {
      "failed": "Деякі поля заповнено неправильно."
    },
    "access": {
      "forbidden": "У вас немає доступу до цього ресурсу."
    },
    "request": {
      "tooMany": "Забагато спроб. Зачекайте хвилину й спробуйте знову."
    },
    "server": {
      "unexpected": "Сталася неочікувана помилка."
    },
    "auth": {
      "unauthorized": "Сесія завершилася. Увійдіть знову.",
      "invalidCredentials": "Неправильна електронна пошта або пароль.",
      "claimMismatch": "Ці дані не відповідають обліковому запису, що очікує активації.",
      "currentPasswordIncorrect": "Поточний пароль неправильний.",
      "userNotFound": "Користувача не знайдено."
    },
    "registration": {
      "closed": "Реєстрацію закрито."
    },
    "password": {
      "policy": "Пароль має містити від 8 до 128 символів."
    },
    "user": {
      "emailTaken": "Користувач із такою електронною поштою вже існує."
    },
    "student": {
      "notFound": "Студента не знайдено.",
      "groupNotFound": "Обраної групи не існує.",
      "supervisorNotFound": "Обраного керівника не існує.",
      "supervisorInvalid": "Керівником може бути лише активний викладач.",
      "numberTaken": "Студент із таким номером студентського квитка вже існує.",
      "profileNotFound": "Профіль студента не знайдено."
    },
    "teacher": {
      "notFound": "Викладача не знайдено."
    },
    "faculty": {
      "notFound": "Факультет не знайдено.",
      "nameTaken": "Факультет із такою назвою вже існує.",
      "shortNameTaken": "Факультет із такою скороченою назвою вже існує.",
      "hasDepartments": "Неможливо видалити факультет, бо до нього належать кафедри."
    },
    "department": {
      "notFound": "Кафедру не знайдено.",
      "nameTaken": "Кафедра з такою назвою вже існує на цьому факультеті.",
      "shortNameTaken": "Кафедра з такою скороченою назвою вже існує на цьому факультеті.",
      "hasGroups": "Неможливо видалити кафедру, бо до неї належать групи.",
      "facultyNotFound": "Обраного факультету не існує."
    },
    "group": {
      "notFound": "Групу не знайдено.",
      "duplicate": "Група з такою назвою та навчальним роком уже існує.",
      "hasStudents": "Неможливо видалити групу, бо в ній є студенти.",
      "departmentNotFound": "Обраної кафедри не існує."
    },
    "reviewer": {
      "notFound": "Обраного рецензента не існує.",
      "mustBeActiveTeacher": "Рецензентом може бути лише активний викладач.",
      "alreadyAssigned": "Цього рецензента вже призначено до групи.",
      "assignmentNotFound": "Призначення рецензента не знайдено."
    },
    "taskTemplate": {
      "notFound": "Етап не знайдено.",
      "orderInvalid": "Порядковий номер має бути більшим за 0.",
      "titleRequired": "Вкажіть назву.",
      "titleTaken": "Активний етап із такою назвою вже існує."
    },
    "groupTask": {
      "notFound": "Етап групи не знайдено.",
      "groupNotFound": "Обраної групи не існує.",
      "templateNotFound": "Одного чи кількох обраних етапів не існує.",
      "templateInactive": "Обрані етапи мають бути активними.",
      "alreadyAssigned": "Цей етап уже призначено групі.",
      "noTemplates": "Оберіть щонайменше один етап.",
      "duplicateTemplates": "Етапи в запиті повторюються.",
      "hasProgress": "Неможливо видалити етап, бо студенти вже почали його виконувати."
    },
    "studentTask": {
      "notFound": "Етап не знайдено."
    },
    "import": {
      "groupNotFound": "Групу не знайдено.",
      "fileMissing": "Оберіть CSV-файл.",
      "notCsv": "Можна імпортувати лише файли .csv.",
      "tooLarge": "Файл більший за 1 МБ.",
      "notUtf8": "Збережіть файл у форматі «CSV UTF-8» і завантажте знову.",
      "tooManyRows": "Файл містить понад 500 студентів.",
      "headerInvalid": "Перший рядок має містити стовпці lastName, firstName, email і studentNumber.",
      "rowErrors": "Файл містить помилки. Нічого не імпортовано.",
      "conflict": "Список студентів змінився під час імпорту; завантажте файл знову.",
      "row": {
        "required": "lastName, firstName, email і studentNumber обов'язкові.",
        "nameTooLong": "Імена мають бути не довші за 100 символів.",
        "invalidEmail": "«{{email}}» не є правильною адресою електронної пошти.",
        "numberTooLong": "Номер студентського квитка має бути не довшим за 32 символи.",
        "duplicateEmail": "Пошта {{email}} уже є в рядку {{line}}.",
        "duplicateNumber": "Номер {{number}} уже є в рядку {{line}}.",
        "staffEmail": "Ця пошта належить викладачу або адміністратору.",
        "emailNumberMismatch": "Ця пошта належить студенту з іншим номером студентського квитка.",
        "numberEmailMismatch": "Цей номер належить студенту з іншою поштою."
      }
    }
  }
}
```

- [ ] **Step 6: Create `src/i18n/en.json`**

```json
{
  "app": {
    "name": "Diploma Tracker"
  },
  "common": {
    "save": "Save",
    "saving": "Saving…",
    "cancel": "Cancel",
    "close": "Close",
    "create": "Create",
    "creating": "Creating…",
    "edit": "Edit",
    "delete": "Delete",
    "deleting": "Deleting…",
    "remove": "Remove",
    "confirm": "Confirm",
    "back": "Back",
    "loading": "Loading…",
    "active": "Active",
    "inactive": "Inactive",
    "yes": "Yes",
    "no": "No",
    "notSet": "Not set",
    "notAssigned": "Not assigned",
    "noDescription": "No description",
    "actions": "Actions",
    "status": "Status",
    "details": "Details",
    "optional": "optional",
    "select": "Select…",
    "savedToast": "Changes saved",
    "deletedToast": "Deleted"
  },
  "nav": {
    "dashboard": "Dashboard",
    "faculties": "Faculties",
    "groups": "Groups",
    "students": "Students",
    "teachers": "Teachers",
    "taskTemplates": "Steps",
    "myTasks": "My steps",
    "account": "Account",
    "signOut": "Sign out",
    "language": "Language"
  },
  "roles": {
    "Admin": "Administrator",
    "Teacher": "Teacher",
    "Student": "Student"
  },
  "validation": {
    "required": "Fill in this field.",
    "passwordLength": "Password must be between 8 and 128 characters.",
    "passwordMismatch": "Passwords do not match."
  },
  "errors": {
    "network": "Cannot reach the server. Try again.",
    "validation": {
      "failed": "Some fields are invalid."
    },
    "access": {
      "forbidden": "You do not have access to this resource."
    },
    "request": {
      "tooMany": "Too many attempts. Wait a minute and try again."
    },
    "server": {
      "unexpected": "An unexpected error occurred."
    },
    "auth": {
      "unauthorized": "Your session has ended. Sign in again.",
      "invalidCredentials": "Invalid email or password.",
      "claimMismatch": "These details don't match an account waiting to be claimed.",
      "currentPasswordIncorrect": "Current password is incorrect.",
      "userNotFound": "User not found."
    },
    "registration": {
      "closed": "Registration is closed."
    },
    "password": {
      "policy": "Password must be between 8 and 128 characters."
    },
    "user": {
      "emailTaken": "A user with this email already exists."
    },
    "student": {
      "notFound": "Student not found.",
      "groupNotFound": "The selected group does not exist.",
      "supervisorNotFound": "The selected supervisor does not exist.",
      "supervisorInvalid": "Supervisor must be an active teacher.",
      "numberTaken": "A student with this student ID number already exists.",
      "profileNotFound": "Student profile not found."
    },
    "teacher": {
      "notFound": "Teacher not found."
    },
    "faculty": {
      "notFound": "Faculty not found.",
      "nameTaken": "A faculty with this name already exists.",
      "shortNameTaken": "A faculty with this short name already exists.",
      "hasDepartments": "Cannot delete the faculty because departments belong to it."
    },
    "department": {
      "notFound": "Department not found.",
      "nameTaken": "A department with this name already exists in this faculty.",
      "shortNameTaken": "A department with this short name already exists in this faculty.",
      "hasGroups": "Cannot delete the department because groups belong to it.",
      "facultyNotFound": "The selected faculty does not exist."
    },
    "group": {
      "notFound": "Group not found.",
      "duplicate": "A group with this name and academic year already exists.",
      "hasStudents": "Cannot delete the group because it has students.",
      "departmentNotFound": "The selected department does not exist."
    },
    "reviewer": {
      "notFound": "The selected reviewer does not exist.",
      "mustBeActiveTeacher": "Reviewer must be an active teacher.",
      "alreadyAssigned": "This reviewer is already assigned to the group.",
      "assignmentNotFound": "Reviewer assignment not found."
    },
    "taskTemplate": {
      "notFound": "Step not found.",
      "orderInvalid": "Order must be greater than 0.",
      "titleRequired": "Enter a title.",
      "titleTaken": "An active step with this title already exists."
    },
    "groupTask": {
      "notFound": "Group step not found.",
      "groupNotFound": "The selected group does not exist.",
      "templateNotFound": "One or more selected steps do not exist.",
      "templateInactive": "Selected steps must be active.",
      "alreadyAssigned": "This step is already assigned to the group.",
      "noTemplates": "Select at least one step.",
      "duplicateTemplates": "The request lists a step more than once.",
      "hasProgress": "Cannot delete the step because students have already started it."
    },
    "studentTask": {
      "notFound": "Step not found."
    },
    "import": {
      "groupNotFound": "Group not found.",
      "fileMissing": "Choose a CSV file.",
      "notCsv": "Only .csv files can be imported.",
      "tooLarge": "The file is larger than 1 MB.",
      "notUtf8": "Save the file as \"CSV UTF-8\" and upload it again.",
      "tooManyRows": "The file contains more than 500 students.",
      "headerInvalid": "The first line must name the columns lastName, firstName, email and studentNumber.",
      "rowErrors": "The file contains errors. Nothing was imported.",
      "conflict": "The student list changed during import; upload the file again.",
      "row": {
        "required": "lastName, firstName, email and studentNumber are required.",
        "nameTooLong": "Names must be at most 100 characters.",
        "invalidEmail": "\"{{email}}\" is not a valid email address.",
        "numberTooLong": "Student ID number must be at most 32 characters.",
        "duplicateEmail": "Email {{email}} already appears on line {{line}}.",
        "duplicateNumber": "Number {{number}} already appears on line {{line}}.",
        "staffEmail": "This email belongs to a teacher or an administrator.",
        "emailNumberMismatch": "This email belongs to a student with a different ID number.",
        "numberEmailMismatch": "This number belongs to a student with a different email."
      }
    }
  }
}
```

- [ ] **Step 7: Create `src/i18n/index.ts`**

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import uk from './uk.json'

export const LANGUAGE_STORAGE_KEY = 'dt.language'
export const supportedLanguages = ['uk', 'en'] as const
export type Language = (typeof supportedLanguages)[number]

function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'uk'
  } catch {
    return 'uk'
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    uk: { translation: uk },
    en: { translation: en }
  },
  lng: readStoredLanguage(),
  fallbackLng: 'uk',
  interpolation: { escapeValue: false }
})

document.documentElement.lang = i18n.language

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for the session only.
  }
})

export default i18n
```

- [ ] **Step 8: Create `src/i18n/i18next.d.ts`**

```typescript
import 'i18next'
import type uk from './uk.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof uk
    }
  }
}
```

- [ ] **Step 9: Load fonts and languages in `src/main.tsx`**

Replace the file:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/exo-2/400.css'
import '@fontsource/exo-2/500.css'
import '@fontsource/exo-2/600.css'
import '@fontsource/exo-2/700.css'
import './i18n'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import { ToastProvider } from './components/ui/ToastProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
```

(`ToastProvider` is created in Task 6; the type-check in Task 8 covers this file.)

- [ ] **Step 10: Add a translation key parity check**

Create `frontend/diploma-tracker-web/scripts/check-i18n.mjs`:

```javascript
import { readFileSync } from 'node:fs'

const load = (name) => JSON.parse(readFileSync(new URL(`../src/i18n/${name}.json`, import.meta.url), 'utf8'))

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`])
}

const uk = new Set(keys(load('uk')))
const en = new Set(keys(load('en')))
const missingInEn = [...uk].filter((key) => !en.has(key))
const missingInUk = [...en].filter((key) => !uk.has(key))

if (missingInEn.length || missingInUk.length) {
  console.error('Missing in en.json:', missingInEn)
  console.error('Missing in uk.json:', missingInUk)
  process.exit(1)
}

console.log(`i18n keys match (${uk.size} keys)`)
```

Add to `package.json` `scripts`: `"i18n:check": "node scripts/check-i18n.mjs"`.

```bash
npm run i18n:check
```

Expected: `i18n keys match (N keys)`.

---

### Task 5: Form, content and feedback components

**Files:**
- Create in `frontend/diploma-tracker-web/src/components/ui/`: `cn.ts`, `styles.ts`, `Spinner.tsx`, `Button.tsx`, `Card.tsx`, `PageHeader.tsx`, `FieldShell.tsx`, `TextField.tsx`, `Textarea.tsx`, `Select.tsx`, `FileInput.tsx`, `Checkbox.tsx`, `Switch.tsx`, `SegmentedControl.tsx`, `Badge.tsx`, `EmptyState.tsx`, `DataTable.tsx`

**Interfaces (exact exports, used by every later page):**
- `cn(...values: Array<string | false | null | undefined>): string`
- `controlClasses: string`
- `Spinner({ className? })`
- `Button(props: ButtonHTMLAttributes & { variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'; icon?: LucideIcon; loading?: boolean })` — default `type="button"`
- `Card({ title?: ReactNode; actions?: ReactNode; className?: string; children })`
- `PageHeader({ title: ReactNode; description?: ReactNode; actions?: ReactNode })`
- `TextField(props: InputHTMLAttributes & { label: ReactNode; hint?: ReactNode; error?: ReactNode })`
- `Textarea(props: TextareaHTMLAttributes & { label: ReactNode; hint?: ReactNode; error?: ReactNode })`
- `type SelectOption = { value: string; label: string }`; `Select({ label, value: string, onChange: (value: string) => void, options: SelectOption[], placeholder?, hint?, error?, disabled? })`
- `FileInput({ label, accept?, multiple?, onChange: (files: File[]) => void, resetKey?: number, hint?, error?, disabled? })`
- `Checkbox({ label, checked, onChange: (checked: boolean) => void, disabled? })`
- `Switch({ label, checked, onChange: (checked: boolean) => void, disabled? })`
- `type SegmentedOption = { value: string; label: string }`; `SegmentedControl({ options, value, onChange: (value: string) => void, ariaLabel: string, size?: 'sm'|'md' })`
- `type BadgeTone = 'neutral'|'info'|'success'|'warning'|'danger'`; `Badge({ tone?: BadgeTone; children })`
- `EmptyState({ icon?: LucideIcon; message: ReactNode; action?: ReactNode })`
- `type DataTableColumn<T> = { key: string; header: ReactNode; render: (row: T) => ReactNode; className?: string }`; `DataTable<T>({ columns, rows, getRowKey: (row: T) => string, loading?: boolean, emptyState?: ReactNode, onRowClick?: (row: T) => void })`

- [ ] **Step 1: Create `cn.ts` and `styles.ts`**

`cn.ts`:

```typescript
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}
```

`styles.ts`:

```typescript
export const controlClasses =
  'h-10 w-full rounded-control border border-border-subtle bg-background px-3 text-sm text-text-strong ' +
  'placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted'
```

- [ ] **Step 2: Create `Spinner.tsx`**

```tsx
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-accent', className)} aria-hidden />
}
```

- [ ] **Step 3: Create `Button.tsx`**

```tsx
import { Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-strong',
  secondary: 'border border-border-subtle bg-background text-text-strong hover:bg-surface',
  ghost: 'bg-transparent text-accent hover:bg-surface',
  danger: 'bg-danger text-white hover:opacity-90'
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm'
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Create `Card.tsx` and `PageHeader.tsx`**

`Card.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

type CardProps = {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, actions, className, children }: CardProps) {
  return (
    <section className={cn('rounded-card border border-border-subtle bg-background p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-lg font-semibold text-heading">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
```

`PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Create `FieldShell.tsx`, `TextField.tsx`, `Textarea.tsx`**

`FieldShell.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

type FieldShellProps = {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}

export function FieldShell({ label, htmlFor, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-strong">{label}</label>
      {children}
      {(error || hint) && (
        <p id={`${htmlFor}-description`} className={cn('text-xs', error ? 'text-danger' : 'text-text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
```

`TextField.tsx`:

```tsx
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function TextField({ label, hint, error, id, className, ...rest }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <FieldShell label={label} htmlFor={inputId} hint={hint} error={error}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-description` : undefined}
        className={cn(controlClasses, Boolean(error) && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  )
}
```

`Textarea.tsx`:

```tsx
import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function Textarea({ label, hint, error, id, className, rows = 4, ...rest }: TextareaProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <FieldShell label={label} htmlFor={inputId} hint={hint} error={error}>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-description` : undefined}
        className={cn(controlClasses, 'h-auto py-2', Boolean(error) && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  )
}
```

- [ ] **Step 6: Create `Select.tsx`**

```tsx
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'

export type SelectOption = {
  value: string
  label: string
}

type SelectProps = {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function Select({ label, value, onChange, options, placeholder, hint, error, disabled }: SelectProps) {
  const id = useId()
  const selected = options.find((option) => option.value === value)

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <ListboxButton
          id={id}
          className={cn(controlClasses, 'flex items-center justify-between text-left', Boolean(error) && 'border-danger')}
        >
          <span className={cn('truncate', !selected && 'text-text-muted')}>{selected?.label ?? placeholder ?? ''}</span>
          <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-50 mt-1 max-h-64 w-(--button-width) overflow-auto rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="group flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-strong data-focus:bg-surface data-selected:font-semibold"
            >
              <span className="truncate">{option.label}</span>
              <Check className="invisible size-4 text-accent group-data-selected:visible" aria-hidden />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </FieldShell>
  )
}
```

- [ ] **Step 7: Create `FileInput.tsx`, `Checkbox.tsx`, `Switch.tsx`**

`FileInput.tsx`:

```tsx
import { useId, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'

type FileInputProps = {
  label: ReactNode
  accept?: string
  multiple?: boolean
  onChange: (files: File[]) => void
  resetKey?: number
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function FileInput({ label, accept, multiple, onChange, resetKey, hint, error, disabled }: FileInputProps) {
  const id = useId()

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <input
        key={resetKey}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        className={cn(
          'block w-full text-sm text-text-strong',
          'file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-strong hover:file:bg-surface-subtle',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
    </FieldShell>
  )
}
```

`Checkbox.tsx`:

```tsx
import { useId, type ReactNode } from 'react'

type CheckboxProps = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className="text-sm text-text-strong">{label}</label>
    </div>
  )
}
```

`Switch.tsx`:

```tsx
import { Field, Label, Switch as HeadlessSwitch } from '@headlessui/react'
import type { ReactNode } from 'react'

type SwitchProps = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ label, checked, onChange, disabled }: SwitchProps) {
  return (
    <Field className="flex items-center gap-3" disabled={disabled}>
      <HeadlessSwitch
        checked={checked}
        onChange={onChange}
        className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill bg-border-subtle transition-colors data-checked:bg-accent data-disabled:cursor-not-allowed data-disabled:opacity-50"
      >
        <span className="size-5 translate-x-0.5 rounded-pill bg-white shadow-subtle transition-transform group-data-checked:translate-x-5.5" />
      </HeadlessSwitch>
      <Label className="text-sm text-text-strong">{label}</Label>
    </Field>
  )
}
```

- [ ] **Step 8: Create `SegmentedControl.tsx`, `Badge.tsx`, `EmptyState.tsx`**

`SegmentedControl.tsx`:

```tsx
import { cn } from './cn'

export type SegmentedOption = {
  value: string
  label: string
}

type SegmentedControlProps = {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}

export function SegmentedControl({ options, value, onChange, ariaLabel, size = 'md' }: SegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-pill bg-surface p-1 shadow-inset">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-control font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-xs',
              selected ? 'bg-background text-text-strong shadow-subtle' : 'text-text-muted hover:text-text-strong'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
```

`Badge.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface text-text-strong',
  info: 'bg-accent text-accent-contrast',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger'
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-xs font-semibold', toneClasses[tone])}>
      {children}
    </span>
  )
}
```

`EmptyState.tsx`:

```tsx
import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: LucideIcon
  message: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon = Inbox, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center">
      <Icon className="size-8 text-text-muted" aria-hidden />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 9: Create `DataTable.tsx`**

```tsx
import type { ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './Spinner'

export type DataTableColumn<T> = {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  loading?: boolean
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
}

export function DataTable<T>({ columns, rows, getRowKey, loading = false, emptyState, onRowClick }: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (rows.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cn('px-3 py-2 text-left text-xs font-semibold text-heading', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('border-b border-border-subtle/60 last:border-0', onRowClick && 'cursor-pointer hover:bg-surface')}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('px-3 py-2.5 align-middle text-text-strong', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

### Task 6: Dialogs and notifications

**Files:**
- Create in `frontend/diploma-tracker-web/src/components/ui/`: `Modal.tsx`, `ConfirmDialog.tsx`, `toastContext.ts`, `ToastProvider.tsx`, `useToast.ts`

**Interfaces:**
- `Modal({ open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' })`
- `ConfirmDialog({ open; title: ReactNode; message: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; loading?: boolean; onConfirm: () => void; onCancel: () => void })`
- `useToast(): { success(message: string): void; error(message: string): void; info(message: string): void }`

- [ ] **Step 1: Create `Modal.tsx`**

```tsx
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={cn('w-full rounded-card bg-background p-6 shadow-xl', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <DialogTitle className="text-lg font-semibold text-heading">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-control p-1 text-text-muted hover:bg-surface hover:text-text-strong"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `ConfirmDialog.tsx`**

```tsx
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'

type ConfirmDialogProps = {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'danger', loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-strong">{message}</p>
    </Modal>
  )
}
```

- [ ] **Step 3: Create `toastContext.ts`**

```typescript
import { createContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

export const ToastContext = createContext<ToastApi | undefined>(undefined)
```

- [ ] **Step 4: Create `ToastProvider.tsx`**

```tsx
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from './cn'
import { ToastContext, type ToastApi, type ToastTone } from './toastContext'

type ToastItem = {
  id: number
  tone: ToastTone
  message: string
}

const DISMISS_AFTER_MS = 4000

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: XCircle, className: 'text-danger' },
  info: { icon: Info, className: 'text-accent' }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const show = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, tone, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, DISMISS_AFTER_MS)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (message) => show('success', message),
    error: (message) => show('error', message),
    info: (message) => show('info', message)
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, className } = toneStyles[toast.tone]
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-control border border-border-subtle bg-background px-4 py-3 text-sm text-text-strong shadow-lg"
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden />
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 5: Create `useToast.ts`**

```typescript
import { useContext } from 'react'
import { ToastContext, type ToastApi } from './toastContext'

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.')
  }

  return context
}
```

---

### Task 7: Application shell, error messages and routes

**Files:**
- Create: `frontend/diploma-tracker-web/src/components/layout/navigation.ts`
- Create: `frontend/diploma-tracker-web/src/components/layout/TabNav.tsx`
- Create: `frontend/diploma-tracker-web/src/components/layout/LanguageSwitch.tsx`
- Create: `frontend/diploma-tracker-web/src/components/layout/UserMenu.tsx`
- Create: `frontend/diploma-tracker-web/src/components/layout/AppShell.tsx`
- Create: `frontend/diploma-tracker-web/src/components/layout/AuthLayout.tsx`
- Replace: `frontend/diploma-tracker-web/src/api/apiClient.ts`
- Create: `frontend/diploma-tracker-web/src/api/useErrorMessage.ts`
- Modify: `frontend/diploma-tracker-web/src/App.tsx`
- Delete: `frontend/diploma-tracker-web/src/components/LayoutShell.tsx`, `src/components/ErrorModal.tsx`

**Interfaces:**
- Produces:
  - `type NavItem = { to: string; labelKey: NavLabelKey }`, `navigationByRole: Record<Role, NavItem[]>` — later phases append items here.
  - `ApiError { status: number; code: string | null; message: string; fields: Record<string, string[]> | null; payload: unknown }`.
  - `useErrorMessage(): (error: unknown) => string` and `useCodeMessage(): (code: string, params?: Record<string, string | number>, fallback?: string) => string`.
  - `AppShell` (route layout with `<Outlet />`), `AuthLayout({ title, children })`.

- [ ] **Step 1: Create `components/layout/navigation.ts`**

```typescript
import type { CurrentUser } from '../../api/types'
import type uk from '../../i18n/uk.json'

export type NavLabelKey = `nav.${keyof typeof uk.nav}`
export type Role = CurrentUser['role']

export type NavItem = {
  to: string
  labelKey: NavLabelKey
}

export const dashboardRouteByRole: Record<Role, string> = {
  Admin: '/admin/dashboard',
  Teacher: '/teacher/dashboard',
  Student: '/student/dashboard'
}

export const navigationByRole: Record<Role, NavItem[]> = {
  Admin: [
    { to: '/admin/dashboard', labelKey: 'nav.dashboard' },
    { to: '/admin/faculties', labelKey: 'nav.faculties' },
    { to: '/admin/groups', labelKey: 'nav.groups' },
    { to: '/admin/students', labelKey: 'nav.students' },
    { to: '/admin/teachers', labelKey: 'nav.teachers' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  Teacher: [
    { to: '/teacher/dashboard', labelKey: 'nav.dashboard' },
    { to: '/task-templates', labelKey: 'nav.taskTemplates' }
  ],
  Student: [
    { to: '/student/dashboard', labelKey: 'nav.dashboard' },
    { to: '/student/tasks', labelKey: 'nav.myTasks' }
  ]
}
```

- [ ] **Step 2: Create `components/layout/TabNav.tsx`**

```tsx
import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

export type TabItem = {
  to: string
  label: string
}

export function TabNav({ items }: { items: TabItem[] }) {
  return (
    <nav className="flex items-center justify-center gap-8">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'border-b-2 py-1 text-sm text-text-strong transition-colors',
              isActive ? 'border-text-strong font-bold' : 'border-transparent font-medium hover:text-accent'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Create `components/layout/LanguageSwitch.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../ui/SegmentedControl'

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()

  return (
    <SegmentedControl
      size="sm"
      ariaLabel={t('nav.language')}
      value={i18n.language === 'en' ? 'en' : 'uk'}
      onChange={(language) => void i18n.changeLanguage(language)}
      options={[
        { value: 'uk', label: 'UK' },
        { value: 'en', label: 'EN' }
      ]}
    />
  )
}
```

- [ ] **Step 4: Create `components/layout/UserMenu.tsx`**

```tsx
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'

export function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) {
    return null
  }

  const signOut = () => {
    logout()
    navigate('/login', { replace: true })
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
        className="z-50 mt-2 w-52 rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
      >
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

- [ ] **Step 5: Create `components/layout/AppShell.tsx` and `AuthLayout.tsx`**

`AppShell.tsx`:

```tsx
import { GraduationCap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { LanguageSwitch } from './LanguageSwitch'
import { navigationByRole } from './navigation'
import { TabNav } from './TabNav'
import { UserMenu } from './UserMenu'

export function AppShell() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const items = user ? navigationByRole[user.role].map((item) => ({ to: item.to, label: t(item.labelKey) })) : []

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border-subtle">
        <div className="mx-auto grid h-16 max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-8 px-8">
          <Link to="/" className="flex items-center gap-2 text-heading">
            <GraduationCap className="size-6 text-accent" aria-hidden />
            <span className="text-base font-bold">{t('app.name')}</span>
          </Link>
          <TabNav items={items} />
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

`AuthLayout.tsx`:

```tsx
import { GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from './LanguageSwitch'

export function AuthLayout({ title, children }: { title: ReactNode; children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex justify-end px-8 py-4">
        <LanguageSwitch />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-12">
        <section className="w-full max-w-md rounded-card border border-border-subtle bg-background p-8">
          <div className="mb-6 flex items-center gap-2 text-heading">
            <GraduationCap className="size-7 text-accent" aria-hidden />
            <span className="text-lg font-bold">{t('app.name')}</span>
          </div>
          <h1 className="mb-6 text-xl font-semibold text-heading">{title}</h1>
          {children}
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Replace `src/api/apiClient.ts`**

```typescript
export class ApiError extends Error {
  status: number
  code: string | null
  fields: Record<string, string[]> | null
  payload: unknown

  constructor(status: number, message: string, code: string | null, fields: Record<string, string[]> | null, payload: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
    this.payload = payload
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not configured.')
}

const TOKEN_STORAGE_KEY = 'diploma_tracker_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

type ErrorPayload = {
  code?: string
  message?: string
  fields?: Record<string, string[]>
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (init?.body !== undefined && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ErrorPayload | null
    throw new ApiError(
      response.status,
      payload?.message ?? `Request failed with status ${response.status}`,
      payload?.code ?? null,
      payload?.fields ?? null,
      payload
    )
  }

  return response
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await send(path, init)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export async function apiDownload(path: string, init?: RequestInit): Promise<{ blob: Blob; fileName: string | null }> {
  const response = await send(path, init)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
  return {
    blob: await response.blob(),
    fileName: encoded ? decodeURIComponent(encoded) : plain ?? null
  }
}
```

`apiDownload` is used from phase 5 on; `Content-Disposition` must be exposed by CORS — Task 8 Step 2 adds that.

- [ ] **Step 7: Create `src/api/useErrorMessage.ts`**

```typescript
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from './apiClient'

export function useCodeMessage() {
  const { t, i18n } = useTranslation()

  return useCallback((code: string, params?: Record<string, string | number>, fallback?: string): string => {
    const key = `errors.${code}`
    if (i18n.exists(key)) {
      return String(t(key as never, params as never))
    }

    return fallback ?? String(t('errors.server.unexpected'))
  }, [t, i18n])
}

export function useErrorMessage() {
  const { t } = useTranslation()
  const codeMessage = useCodeMessage()

  return useCallback((error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.code) {
        return codeMessage(error.code, undefined, error.message)
      }

      if (error.status === 401) return t('errors.auth.unauthorized')
      if (error.status === 403) return t('errors.access.forbidden')
      if (error.status === 429) return t('errors.request.tooMany')
      return error.message
    }

    if (error instanceof TypeError) {
      return t('errors.network')
    }

    return t('errors.server.unexpected')
  }, [t, codeMessage])
}
```

- [ ] **Step 8: Use the shell in `src/App.tsx`**

Replace the `LayoutShell` import with `import { AppShell } from './components/layout/AppShell'` and the element `<LayoutShell />` with `<AppShell />`. Remove the `health` route's navigation dependency (the route itself stays). Delete `src/components/LayoutShell.tsx` and `src/components/ErrorModal.tsx`; their remaining imports are removed as each page migrates in Tasks 9–12.

- [ ] **Step 9: Replace `isApiConflict` usages**

`isApiConflict` no longer exists. Pages still importing it are migrated in Tasks 9–12; do not re-add it.

---

### Task 8: Backend CORS header and contract check

**Files:**
- Modify: `backend/DiplomaTracker.Api/Program.cs`
- Create: `.superpowers/checks/design-system-check.mjs` (git-ignored)

- [ ] **Step 1: Expose `Content-Disposition` to the client**

In `Program.cs`, change the CORS policy builder chain to:

```csharp
        options.AddPolicy(CorsPolicyName, policy => policy
            .WithOrigins(corsSettings.Value.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .WithExposedHeaders("Content-Disposition")));
```

- [ ] **Step 2: Create `.superpowers/checks/design-system-check.mjs`**

```javascript
const API = 'http://localhost:5000'
const results = []

function check(name, ok, detail) {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: ${detail}`}`)
}

async function call(method, path, { token, json, raw } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: raw ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const text = await response.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: response.status, body }
}

function expectContract(name, response, status, code) {
  const ok = response.status === status
    && response.body && response.body.code === code && typeof response.body.message === 'string'
  check(name, ok, JSON.stringify(response))
}

const badLogin = await call('POST', '/api/auth/login', { json: { email: 'nobody@x.local', password: 'Wrong123!' } })
expectContract('01 invalid credentials', badLogin, 401, 'auth.invalidCredentials')

const admin = (await call('POST', '/api/auth/login', { json: { email: 'admin@diploma.local', password: 'Admin123!' } })).body.token
const student = (await call('POST', '/api/auth/login', { json: { email: 'student@diploma.local', password: 'Student123!' } })).body.token

expectContract('02 unknown faculty (URL)', await call('GET', '/api/faculties/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'faculty.notFound')
expectContract('03 unknown faculty (body)', await call('POST', '/api/departments', { token: admin, json: { facultyId: '00000000-0000-0000-0000-000000000001', name: 'X', shortName: 'X' } }), 400, 'department.facultyNotFound')

const faculties = (await call('GET', '/api/faculties', { token: admin })).body
expectContract('04 duplicate faculty', await call('POST', '/api/faculties', { token: admin, json: { name: faculties[0].name, shortName: `Z${Date.now() % 10000}` } }), 409, 'faculty.nameTaken')
expectContract('05 faculty with departments', await call('DELETE', `/api/faculties/${faculties[0].id}`, { token: admin }), 409, 'faculty.hasDepartments')

const validation = await call('POST', '/api/faculties', { token: admin, json: { name: '', shortName: '' } })
check('06 validation contract', validation.status === 400 && validation.body.code === 'validation.failed' && Array.isArray(validation.body.fields?.name), JSON.stringify(validation))

expectContract('07 unknown group', await call('GET', '/api/groups/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'group.notFound')
expectContract('08 unknown task template', await call('GET', '/api/task-templates/00000000-0000-0000-0000-000000000001', { token: admin }), 404, 'taskTemplate.notFound')
expectContract('09 closed registration claim', await call('POST', '/api/auth/claim', { json: { email: 'x@x.local', studentNumber: 'X', password: 'Password1!' } }), 403, 'registration.closed')

const forbidden = await call('GET', '/api/students', { token: student })
check('10 role-forbidden has no body requirement', forbidden.status === 403, JSON.stringify(forbidden))

const malformed = await call('POST', '/api/faculties', { token: admin, raw: '{"name":' })
check('11 malformed JSON uses validation contract', malformed.status === 400 && malformed.body.code === 'validation.failed', JSON.stringify(malformed))

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

Registration must be closed for check 09 (the onboarding check closes it at the end; if not, close it via `PUT /api/registration` first).

- [ ] **Step 3: Run the check**

Start the API in the background (`dotnet run --project backend/DiplomaTracker.Api --launch-profile http`), wait for `http://localhost:5000/api/registration`, then:

```bash
node .superpowers/checks/design-system-check.mjs
taskkill //F //IM DiplomaTracker.Api.exe
```

Expected: `11/11 checks passed`.

---

### Tasks 9–12: Page migrations — shared rules

Every page migrated in Tasks 9–12 follows these rules; the task lists only what is specific to the page.

1. **Structure:** the page returns a fragment starting with `PageHeader` (title from translations, actions on the right), followed by `Card`s stacked with `className="mb-6"` or placed in a CSS grid (`grid grid-cols-[320px_1fr] gap-6` for master–detail). No legacy class names (`page-card`, `entity-card`, `field-input`, `primary-button`, …) remain.
2. **Controls:** text inputs `TextField`, multi-line `Textarea`, choices `Select`, booleans `Switch` or `Checkbox`, files `FileInput`, buttons `Button` (primary for the main action of a form, `secondary` for Cancel/Edit, `danger` only inside confirmation dialogs, `ghost` with an icon for row actions: `Pencil` edit, `Trash2` delete, `KeyRound` password, `RotateCcw` reset).
3. **Lists:** tabular data uses `DataTable` with an `EmptyState` for empty lists and `loading` while fetching. Card grids are allowed only where the task says so.
4. **Forms in dialogs:** create and edit forms open in `Modal` (size `lg` when there are more than four fields) with Save/Cancel in the `footer`; the form element wraps fields and the footer's submit button uses `form="<form id>"` and `type="submit"`.
5. **Confirmation:** `window.confirm` is replaced by `ConfirmDialog`.
6. **Feedback:** successful create/update/delete shows `toast.success(t('common.savedToast'))` or `t('common.deletedToast')`; failures show `toast.error(errorMessage(err))` using `useErrorMessage()`. Form validation errors stay inline under the field (`error` prop). Load failures render inside the card as `<p className="text-sm text-danger">`.
7. **Text:** every visible string comes from `t(...)`. Add the task's translation block to **both** `uk.json` and `en.json` as a new top-level key; do not change existing keys. User-entered data (names, titles) is shown as stored.
8. **Dates:** format with `new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' })` (add `timeStyle: 'short'` where a time is shown).
9. **Behaviour:** API calls, route params, redirects and role checks stay as they are; only presentation, confirmation and error display change.
10. **Gates after each task:** `npx tsc -b`, `npm run lint`, `npm run i18n:check`.

---

### Task 9: Sign-in, claim, account, dashboards and health pages

**Files:**
- Modify: `src/pages/LoginPage.tsx`, `ClaimAccountPage.tsx`, `AccountPage.tsx`, `AdminDashboardPage.tsx`, `TeacherDashboardPage.tsx`, `StudentDashboardPage.tsx`, `DashboardPage.tsx`, `HealthPage.tsx`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Page specifics:**
- `LoginPage`: `AuthLayout` titled `auth.signInTitle`; `TextField` email and password; primary full-width submit (`className="w-full"`); error text under the form from `useErrorMessage()` (401 now carries `auth.invalidCredentials`); claim link shown while registration is open: `auth.firstTime` + link `auth.claimLink` (link styled `text-accent font-medium hover:underline`).
- `ClaimAccountPage`: `AuthLayout` titled `claim.title`; hint `claim.hint`; closed state shows `claim.closed` inside an `EmptyState` with icon `Lock`; client-side length/mismatch messages use `validation.passwordLength` / `validation.passwordMismatch`; back link `claim.backToSignIn`.
- `AccountPage`: `PageHeader` `account.title` with description `{name} · {email}`; one `Card` titled `account.changePassword` holding the three fields in a single column with max width `max-w-md`; success shows `toast.success(t('account.passwordChanged'))`.
- Dashboards: `PageHeader` with `dashboard.adminTitle` / `dashboard.teacherTitle` / `dashboard.studentTitle`; student dashboard keeps its link to *My steps* as a `Card` with a primary `Button` (`dashboard.goToMyTasks`) using `useNavigate`. `DashboardPage` shows `dashboard.welcome`.
- `HealthPage`: `PageHeader` `health.title`; `Card` with status `Badge` (`success` when status is `Healthy`, otherwise `danger`) and the application name.

**Translation blocks** — add to `uk.json`:

```json
  "auth": {
    "signInTitle": "Вхід",
    "email": "Електронна пошта",
    "password": "Пароль",
    "signIn": "Увійти",
    "signingIn": "Вхід…",
    "firstTime": "Уперше тут?",
    "claimLink": "Активуйте обліковий запис"
  },
  "claim": {
    "title": "Активація облікового запису",
    "hint": "Використайте електронну пошту та номер студентського квитка зі списку вашої кафедри.",
    "studentNumber": "Номер студентського квитка",
    "newPassword": "Новий пароль",
    "confirmPassword": "Повторіть пароль",
    "submit": "Активувати",
    "submitting": "Активація…",
    "closed": "Реєстрацію закрито. Зверніться до адміністратора кафедри.",
    "backToSignIn": "Повернутися до входу"
  },
  "account": {
    "title": "Обліковий запис",
    "changePassword": "Зміна пароля",
    "currentPassword": "Поточний пароль",
    "newPassword": "Новий пароль",
    "confirmPassword": "Повторіть новий пароль",
    "submit": "Змінити пароль",
    "passwordChanged": "Пароль змінено"
  },
  "dashboard": {
    "welcome": "Система відстеження дипломних робіт",
    "adminTitle": "Панель адміністратора",
    "teacherTitle": "Панель викладача",
    "studentTitle": "Панель студента",
    "goToMyTasks": "Перейти до моїх етапів"
  },
  "health": {
    "title": "Стан сервера",
    "application": "Застосунок"
  }
```

Add to `en.json`:

```json
  "auth": {
    "signInTitle": "Sign in",
    "email": "Email",
    "password": "Password",
    "signIn": "Sign in",
    "signingIn": "Signing in…",
    "firstTime": "First time here?",
    "claimLink": "Claim your account"
  },
  "claim": {
    "title": "Claim your account",
    "hint": "Use the email and student ID number from your department's list.",
    "studentNumber": "Student ID number",
    "newPassword": "New password",
    "confirmPassword": "Confirm password",
    "submit": "Claim account",
    "submitting": "Claiming…",
    "closed": "Registration is closed. Contact your department administrator.",
    "backToSignIn": "Back to sign in"
  },
  "account": {
    "title": "Account",
    "changePassword": "Change password",
    "currentPassword": "Current password",
    "newPassword": "New password",
    "confirmPassword": "Confirm new password",
    "submit": "Change password",
    "passwordChanged": "Password changed"
  },
  "dashboard": {
    "welcome": "Diploma work tracking system",
    "adminTitle": "Administrator dashboard",
    "teacherTitle": "Teacher dashboard",
    "studentTitle": "Student dashboard",
    "goToMyTasks": "Go to my steps"
  },
  "health": {
    "title": "Server health",
    "application": "Application"
  }
```

- [ ] **Step 1: Add the translation blocks**
- [ ] **Step 2: Migrate the eight pages**
- [ ] **Step 3: Run `npx tsc -b`, `npm run lint`, `npm run i18n:check`** — expected: clean, `0 errors`, keys match.

---

### Task 10: Faculties, groups and group details pages

**Files:**
- Modify: `src/pages/FacultiesPage.tsx`, `GroupsPage.tsx`, `GroupDetailsPage.tsx`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Page specifics:**
- `FacultiesPage`: `PageHeader` `faculties.title` with primary action `faculties.addFaculty` (opens create modal). Master–detail grid: left `Card` `faculties.listTitle` holds the faculty list as selectable rows (`button` rows, selected row `bg-surface font-semibold`, short name as `Badge` neutral, row actions edit/delete as ghost icon buttons); right `Card` titled `faculties.departmentsOf` (`{{shortName}}`) with action `faculties.addDepartment`, and a `DataTable` of departments (columns: name, short name, actions). Faculty and department forms (name, short name with `maxLength` 200/50) open in `Modal`; deletes use `ConfirmDialog`. The stale-response and edited-department-faculty rules from the phase 2 review stay exactly as implemented. Empty states: `faculties.noFaculties`, `faculties.noDepartments`, `faculties.selectFaculty`.
- `GroupsPage`: `PageHeader` `groups.title` with action `groups.addGroup`. `DataTable` columns: name, academic year, department (`departmentName` with faculty short name muted below), reviewers count is not shown; actions: details (`ghost` icon `ArrowRight`, navigates to `/admin/groups/:id`), edit, delete. Create/edit `Modal` fields: department `Select` (options label `{{departmentName}} · {{facultyName}}`), name, academic year, description (`Textarea`). The reviewers card below the table keeps its current behaviour: group `Select`, reviewer `Select` of active teachers, `groups.assignReviewer` button, reviewer `DataTable` (name, email, remove action with `ConfirmDialog`).
- `GroupDetailsPage`: back `Button` ghost with `ArrowLeft` → `groups.backToGroups`; `PageHeader` with group name and description `{{academicYear}} · {{departmentName}}`. Three cards:
  1. `groupDetails.reviewers` — reviewer select + assign button, `DataTable` (name, email, remove).
  2. `groupDetails.tasks` — single assign row (template `Select`, deadline `TextField type="datetime-local"`, `groupDetails.assignTask`); bulk assign section as a `DataTable` of unassigned active templates with a `Checkbox` and a deadline input per row and `groupDetails.assignSelected`; assigned tasks `DataTable` (order, title, deadline formatted, student task count, actions: edit deadline in `Modal`, delete with `ConfirmDialog` message `groupDetails.deleteTaskConfirm`).
  3. `groupDetails.students` — `DataTable` (name, email, topic or `common.notSet`, supervisor or `common.notAssigned`, status `Badge` success/neutral with `common.active`/`common.inactive`).

**Translation blocks** — add to `uk.json`:

```json
  "faculties": {
    "title": "Факультети та кафедри",
    "listTitle": "Факультети",
    "addFaculty": "Додати факультет",
    "editFaculty": "Редагувати факультет",
    "deleteFacultyConfirm": "Видалити факультет «{{name}}»?",
    "departmentsOf": "Кафедри {{shortName}}",
    "addDepartment": "Додати кафедру",
    "editDepartment": "Редагувати кафедру",
    "deleteDepartmentConfirm": "Видалити кафедру «{{name}}»?",
    "name": "Назва",
    "shortName": "Скорочена назва",
    "noFaculties": "Факультетів ще немає.",
    "noDepartments": "На цьому факультеті ще немає кафедр.",
    "selectFaculty": "Оберіть або створіть факультет, щоб керувати його кафедрами."
  },
  "groups": {
    "title": "Групи",
    "addGroup": "Додати групу",
    "editGroup": "Редагувати групу",
    "deleteConfirm": "Видалити групу «{{name}}»?",
    "name": "Назва групи",
    "academicYear": "Навчальний рік",
    "department": "Кафедра",
    "description": "Опис",
    "noGroups": "Груп ще немає.",
    "reviewersTitle": "Рецензенти груп",
    "group": "Група",
    "reviewer": "Рецензент",
    "assignReviewer": "Призначити рецензента",
    "removeReviewerConfirm": "Прибрати рецензента з групи?",
    "noReviewers": "Рецензентів не призначено.",
    "backToGroups": "До списку груп",
    "openDetails": "Відкрити"
  },
  "groupDetails": {
    "reviewers": "Рецензенти",
    "tasks": "Етапи групи",
    "template": "Етап",
    "deadline": "Термін",
    "assignTask": "Призначити етап",
    "bulkTitle": "Призначити кілька активних етапів",
    "assignSelected": "Призначити обрані",
    "allAssigned": "Усі активні етапи вже призначено.",
    "selectAtLeastOne": "Оберіть щонайменше один етап і термін.",
    "order": "№",
    "studentTaskCount": "Студентів",
    "editDeadline": "Змінити термін",
    "deleteTaskConfirm": "Видалити етап групи та всі невиконані етапи студентів?",
    "noTasks": "Групі ще не призначено етапів.",
    "students": "Студенти групи",
    "topic": "Тема",
    "supervisor": "Керівник",
    "noStudents": "У групі немає студентів.",
    "notFound": "Групу не знайдено."
  }
```

Add to `en.json`:

```json
  "faculties": {
    "title": "Faculties and departments",
    "listTitle": "Faculties",
    "addFaculty": "Add faculty",
    "editFaculty": "Edit faculty",
    "deleteFacultyConfirm": "Delete faculty \"{{name}}\"?",
    "departmentsOf": "Departments of {{shortName}}",
    "addDepartment": "Add department",
    "editDepartment": "Edit department",
    "deleteDepartmentConfirm": "Delete department \"{{name}}\"?",
    "name": "Name",
    "shortName": "Short name",
    "noFaculties": "No faculties yet.",
    "noDepartments": "No departments in this faculty yet.",
    "selectFaculty": "Select or create a faculty to manage its departments."
  },
  "groups": {
    "title": "Groups",
    "addGroup": "Add group",
    "editGroup": "Edit group",
    "deleteConfirm": "Delete group \"{{name}}\"?",
    "name": "Group name",
    "academicYear": "Academic year",
    "department": "Department",
    "description": "Description",
    "noGroups": "No groups yet.",
    "reviewersTitle": "Group reviewers",
    "group": "Group",
    "reviewer": "Reviewer",
    "assignReviewer": "Assign reviewer",
    "removeReviewerConfirm": "Remove this reviewer from the group?",
    "noReviewers": "No reviewers assigned.",
    "backToGroups": "Back to groups",
    "openDetails": "Open"
  },
  "groupDetails": {
    "reviewers": "Reviewers",
    "tasks": "Group steps",
    "template": "Step",
    "deadline": "Deadline",
    "assignTask": "Assign step",
    "bulkTitle": "Assign several active steps",
    "assignSelected": "Assign selected",
    "allAssigned": "All active steps are already assigned.",
    "selectAtLeastOne": "Select at least one step and deadline.",
    "order": "#",
    "studentTaskCount": "Students",
    "editDeadline": "Change deadline",
    "deleteTaskConfirm": "Delete this group step and all pending student steps?",
    "noTasks": "No steps assigned to this group.",
    "students": "Students in group",
    "topic": "Topic",
    "supervisor": "Supervisor",
    "noStudents": "No students in this group.",
    "notFound": "Group not found."
  }
```

- [ ] **Step 1: Add the translation blocks**
- [ ] **Step 2: Migrate the three pages**
- [ ] **Step 3: Run the gates** — expected: clean.

---

### Task 11: Students and teachers pages

**Files:**
- Modify: `src/pages/StudentsPage.tsx`, `TeachersPage.tsx`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Page specifics:**
- `StudentsPage`: `PageHeader` `students.title` with actions `students.addStudent` (primary, opens `Modal` size `lg`) and `students.importTitle` (secondary with `Upload`, opens import `Modal`). Top `Card` holds the registration `Switch` labelled `students.registrationOpen` with hint `students.registrationHint`; toggling shows a toast. Import `Modal`: group `Select`, `FileInput` (`accept=".csv"`, `resetKey`), hint `students.importHint`, footer buttons `students.downloadTemplate` (secondary) and `students.import` (primary). Result area in the modal: success summary `students.importCreated` (`{{count}}`) plus skipped list `students.importSkipped` with `students.lineEmail` rows; row errors list each `students.lineMessage` where the message is `useCodeMessage()(row.code, row.params, row.message)`. Students `DataTable` columns: name (`lastName firstName patronymic`), email, student number, group, claim `Badge` (`success` `students.claimed` / `warning` `students.notClaimed`), status `Badge`, actions (edit, reset access — disabled when not claimed — with `ConfirmDialog` `students.resetConfirm`, deactivate with `ConfirmDialog` `students.deactivateConfirm`). Create/edit `Modal` fields in a two-column grid (`grid grid-cols-2 gap-4`): last name, first name, patronymic, email, student number, password (create only, hint `students.passwordHint`), group `Select` (required, inline error `validation.required` when empty on submit), supervisor `Select` with first option `{ value: '', label: t('students.noSupervisor') }`, topic `TextField` spanning both columns.
- `TeachersPage`: `PageHeader` `teachers.title` with action `teachers.addTeacher`. `DataTable` columns: name with patronymic, email, status `Badge`, actions (edit, set password `KeyRound`, deactivate with `ConfirmDialog`). Create/edit `Modal` with last name, first name, patronymic, email, password (create only). Set-password `Modal` titled `teachers.setPasswordFor` (`{{name}}`) with one password field and inline policy error.

**Translation blocks** — add to `uk.json`:

```json
  "students": {
    "title": "Студенти",
    "addStudent": "Додати студента",
    "editStudent": "Редагувати студента",
    "registrationOpen": "Реєстрацію відкрито",
    "registrationHint": "Поки перемикач увімкнено, імпортовані студенти можуть активувати свої облікові записи.",
    "registrationOpened": "Реєстрацію відкрито",
    "registrationClosed": "Реєстрацію закрито",
    "importTitle": "Імпорт студентів",
    "importHint": "CSV UTF-8 зі стовпцями lastName, firstName, patronymic (необов'язково), email, studentNumber.",
    "import": "Імпортувати",
    "importing": "Імпорт…",
    "downloadTemplate": "Завантажити шаблон",
    "importCreated": "Створено студентів: {{count}}.",
    "importSkipped": "Уже є в системі (пропущено):",
    "lineEmail": "Рядок {{line}}: {{email}}",
    "lineMessage": "Рядок {{line}}: {{message}}",
    "file": "Файл",
    "lastName": "Прізвище",
    "firstName": "Ім'я",
    "patronymic": "По батькові",
    "email": "Електронна пошта",
    "studentNumber": "Номер студентського квитка",
    "password": "Пароль",
    "passwordHint": "Залиште порожнім, щоб студент активував обліковий запис самостійно.",
    "group": "Група",
    "supervisor": "Керівник",
    "noSupervisor": "Без керівника",
    "topic": "Тема дипломної роботи",
    "claimed": "Активовано",
    "notClaimed": "Не активовано",
    "resetAccess": "Скинути доступ",
    "resetConfirm": "Скинути доступ для {{name}}? Студенту доведеться активувати обліковий запис знову.",
    "deactivate": "Деактивувати",
    "deactivateConfirm": "Деактивувати студента {{name}}?",
    "noStudents": "Студентів ще немає."
  },
  "teachers": {
    "title": "Викладачі",
    "addTeacher": "Додати викладача",
    "editTeacher": "Редагувати викладача",
    "lastName": "Прізвище",
    "firstName": "Ім'я",
    "patronymic": "По батькові",
    "email": "Електронна пошта",
    "password": "Пароль",
    "setPassword": "Встановити пароль",
    "setPasswordFor": "Новий пароль для {{name}}",
    "passwordSet": "Пароль встановлено",
    "deactivate": "Деактивувати",
    "deactivateConfirm": "Деактивувати викладача {{name}}?",
    "noTeachers": "Викладачів ще немає."
  }
```

Add to `en.json`:

```json
  "students": {
    "title": "Students",
    "addStudent": "Add student",
    "editStudent": "Edit student",
    "registrationOpen": "Registration open",
    "registrationHint": "While this is on, imported students can claim their accounts.",
    "registrationOpened": "Registration opened",
    "registrationClosed": "Registration closed",
    "importTitle": "Import students",
    "importHint": "CSV UTF-8 with columns lastName, firstName, patronymic (optional), email, studentNumber.",
    "import": "Import",
    "importing": "Importing…",
    "downloadTemplate": "Download template",
    "importCreated": "Students created: {{count}}.",
    "importSkipped": "Already in the system (skipped):",
    "lineEmail": "Line {{line}}: {{email}}",
    "lineMessage": "Line {{line}}: {{message}}",
    "file": "File",
    "lastName": "Last name",
    "firstName": "First name",
    "patronymic": "Patronymic",
    "email": "Email",
    "studentNumber": "Student ID number",
    "password": "Password",
    "passwordHint": "Leave empty to let the student claim the account.",
    "group": "Group",
    "supervisor": "Supervisor",
    "noSupervisor": "No supervisor",
    "topic": "Diploma topic",
    "claimed": "Claimed",
    "notClaimed": "Not claimed",
    "resetAccess": "Reset access",
    "resetConfirm": "Reset access for {{name}}? The student will need to claim the account again.",
    "deactivate": "Deactivate",
    "deactivateConfirm": "Deactivate student {{name}}?",
    "noStudents": "No students yet."
  },
  "teachers": {
    "title": "Teachers",
    "addTeacher": "Add teacher",
    "editTeacher": "Edit teacher",
    "lastName": "Last name",
    "firstName": "First name",
    "patronymic": "Patronymic",
    "email": "Email",
    "password": "Password",
    "setPassword": "Set password",
    "setPasswordFor": "New password for {{name}}",
    "passwordSet": "Password set",
    "deactivate": "Deactivate",
    "deactivateConfirm": "Deactivate teacher {{name}}?",
    "noTeachers": "No teachers yet."
  }
```

Update the import types in `src/api/types.ts` to carry codes:

```typescript
export type ImportRowError = {
  line: number
  code: string
  message: string
  params: Record<string, string> | null
}
```

- [ ] **Step 1: Update `ImportRowError` and add the translation blocks**
- [ ] **Step 2: Migrate the two pages**
- [ ] **Step 3: Run the gates** — expected: clean.

---

### Task 12: Task template and student step pages

**Files:**
- Modify: `src/pages/TaskTemplatesPage.tsx`, `StudentMyTasksPage.tsx`, `StudentTaskDetailsPage.tsx`
- Create: `src/components/ui/statusTones.ts`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Page specifics:**
- `statusTones.ts` exports `displayStatusTone: Record<string, BadgeTone>` = `{ Pending: 'neutral', Submitted: 'info', SubmittedLate: 'warning', NeedsRevision: 'warning', Completed: 'success', MissedDeadline: 'danger' }` (phase 5 replaces the student-step statuses).
- `TaskTemplatesPage`: `PageHeader` `taskTemplates.title` with action `taskTemplates.add`. `DataTable` columns: order, title with description muted below (or `common.noDescription`), status `Badge`, actions (edit, activate/deactivate — deactivate asks `ConfirmDialog` `taskTemplates.deactivateConfirm`). Create/edit `Modal`: title, description (`Textarea`), order (`TextField type="number" min=1`), and on edit an `active` `Checkbox`.
- `StudentMyTasksPage`: `PageHeader` `myTasks.title`. `DataTable` columns: order, title, deadline, status `Badge` (tone from `displayStatusTone`, label `myTasks.status.<displayStatus>`), mark (or `—`), and a ghost `ArrowRight` action opening `/student/tasks/:id`; `onRowClick` also opens it.
- `StudentTaskDetailsPage`: back ghost button `myTasks.back`; `PageHeader` with task title and description; summary `Card` as a definition grid (`grid grid-cols-3 gap-4`: deadline, status badge, current mark, completed at); `Card` `myTasks.submissions` with `DataTable` (file, submitted at, late `Badge` warning, comment) and `Card` `myTasks.reviews` with `DataTable` (reviewer, decision, mark, comment, date); empty states `myTasks.noSubmissions`, `myTasks.noReviews`.

**Translation blocks** — add to `uk.json`:

```json
  "taskTemplates": {
    "title": "Етапи дипломної роботи",
    "add": "Додати етап",
    "edit": "Редагувати етап",
    "titleField": "Назва",
    "description": "Опис",
    "order": "Порядок",
    "active": "Активний",
    "activate": "Активувати",
    "deactivate": "Деактивувати",
    "deactivateConfirm": "Деактивувати етап «{{title}}»?",
    "noTemplates": "Етапів ще немає."
  },
  "myTasks": {
    "title": "Мої етапи",
    "order": "№",
    "step": "Етап",
    "deadline": "Термін",
    "status": {
      "label": "Статус",
      "Pending": "Очікує",
      "Submitted": "Надіслано",
      "SubmittedLate": "Надіслано із запізненням",
      "NeedsRevision": "Потребує доопрацювання",
      "Completed": "Виконано",
      "MissedDeadline": "Термін минув"
    },
    "mark": "Оцінка",
    "open": "Відкрити",
    "noTasks": "Етапів ще немає.",
    "back": "До моїх етапів",
    "currentMark": "Поточна оцінка",
    "completedAt": "Виконано",
    "notCompleted": "Не виконано",
    "submissions": "Надіслані роботи",
    "file": "Файл",
    "submittedAt": "Надіслано",
    "late": "Із запізненням",
    "comment": "Коментар",
    "reviews": "Рецензії",
    "reviewer": "Рецензент",
    "decision": "Рішення",
    "date": "Дата",
    "noSubmissions": "Робіт ще не надіслано.",
    "noReviews": "Рецензій ще немає."
  }
```

Add to `en.json`:

```json
  "taskTemplates": {
    "title": "Diploma work steps",
    "add": "Add step",
    "edit": "Edit step",
    "titleField": "Title",
    "description": "Description",
    "order": "Order",
    "active": "Active",
    "activate": "Activate",
    "deactivate": "Deactivate",
    "deactivateConfirm": "Deactivate step \"{{title}}\"?",
    "noTemplates": "No steps yet."
  },
  "myTasks": {
    "title": "My steps",
    "order": "#",
    "step": "Step",
    "deadline": "Deadline",
    "status": {
      "label": "Status",
      "Pending": "Pending",
      "Submitted": "Submitted",
      "SubmittedLate": "Submitted late",
      "NeedsRevision": "Needs revision",
      "Completed": "Completed",
      "MissedDeadline": "Deadline missed"
    },
    "mark": "Mark",
    "open": "Open",
    "noTasks": "No steps yet.",
    "back": "Back to my steps",
    "currentMark": "Current mark",
    "completedAt": "Completed",
    "notCompleted": "Not completed",
    "submissions": "Submissions",
    "file": "File",
    "submittedAt": "Submitted",
    "late": "Late",
    "comment": "Comment",
    "reviews": "Reviews",
    "reviewer": "Reviewer",
    "decision": "Decision",
    "date": "Date",
    "noSubmissions": "No submissions yet.",
    "noReviews": "No reviews yet."
  }
```

- [ ] **Step 1: Create `statusTones.ts` and add the translation blocks**
- [ ] **Step 2: Migrate the three pages**
- [ ] **Step 3: Run the gates** — expected: clean.

---

### Task 13: Design system verification and commit

**Files:**
- Modify: `docs/superpowers/test-backlog.md`, `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: No legacy styling or strings remain**

```bash
cd frontend/diploma-tracker-web
grep -rn "className=\"\(page-card\|entity-card\|field-input\|primary-button\|secondary-button\|login-card\|actions-row\)" src/ ; echo "legacy-classes exit=$?"
grep -rn "window.confirm\|ErrorModal\|LayoutShell\|isApiConflict" src/ ; echo "legacy-components exit=$?"
test -f src/App.css && echo "App.css still present" || echo "App.css removed"
```

Expected: both greps print nothing with `exit=1`; `App.css removed`.

- [ ] **Step 2: Frontend gates**

```bash
npx tsc -b
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean; `0 errors`; keys match; `✓ built in`.

- [ ] **Step 3: Backend gates**

```bash
cd ../../backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `0 Error(s)` twice; no pending model changes.

- [ ] **Step 4: Append the design system section to `docs/superpowers/test-backlog.md`**

```markdown

## Design system

### Backend
- `ErrorCatalog`: every code unique (construction throws on duplicates); unknown code resolves to `server.unexpected`.
- Every service error code is present in the catalogue (reflection over the area classes' `const string` fields).
- `ValidationErrorResponseFactory`: field names camel-cased and `$.` stripped; rule classification for required, max length, min length, e-mail and other messages.
- `ImportRowError.Create`: placeholder substitution and params carried through.
- HTTP: representative 400/401/403/404/409/429/500 responses carry `{ code, message }`; malformed JSON returns `validation.failed`; `Content-Disposition` exposed via CORS.

### Frontend
- `useErrorMessage`: code with translation, code without translation (falls back to server message), 401/403/429 without code, network `TypeError`, unknown error.
- `i18n`: stored language restored, default `uk`, `<html lang>` updated on change; `check-i18n` script detects missing keys.
- Components: `Button` loading disables; `Select` renders placeholder and selected label; `Modal` closes on Escape and backdrop; `ConfirmDialog` ignores close while loading; `ToastProvider` auto-dismisses; `DataTable` loading, empty and row-click states; `TabNav` active styling.
```

- [ ] **Step 5: Update `docs/superpowers/PROJECT_MEMORY.md`**

- Status row: `| 3 Design system | Done — commit \`Implement design system\` | \`2026-09-17-design-system-design.md\` |`.
- In `## Gotchas`, delete the item about `GroupsController` comparing the duplicate-group literal, and add:
  - `**Errors are codes.** Services return codes from area catalogues (\`AcademicStructureErrors\`, \`GroupErrors\`, \`TaskErrors\`, \`OnboardingErrors\`, …); a new code must be added to its catalogue's \`All\` array, to \`ErrorCatalog\` if the area is new, and to both \`uk.json\` and \`en.json\` under \`errors\`.`
  - `**Translations:** every visible string is a key in both \`uk.json\` and \`en.json\`; run \`npm run i18n:check\`.`
  - `**UI building blocks** live in \`src/components/ui\`; pages never use raw \`<input>\`/\`<button>\` styling.`
- In `## Decisions`, add: `API errors are \`{ code, message }\`; a body reference that does not exist has its own 400 code, a URL resource that does not exist a 404 code.`
- Append to `## Log` a line with today's date: `Design system implemented: Tailwind tokens from schedule.kpi.ua, shared components, Ukrainian/English, error codes.`

- [ ] **Step 6: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src frontend/diploma-tracker-web/scripts frontend/diploma-tracker-web/package.json frontend/diploma-tracker-web/package-lock.json frontend/diploma-tracker-web/vite.config.ts frontend/diploma-tracker-web/tsconfig.app.json docs/superpowers/test-backlog.md docs/superpowers/PROJECT_MEMORY.md
git status --short | grep "App.css\|LayoutShell\|ErrorModal"
git diff --cached --name-only | grep -E '/bin/|/obj/|node_modules|PROJECT_PAPER|README|appsettings'; echo "exit=$?"
git commit -m "Implement design system"
git log --oneline -1
```

Expected: the deleted files appear as `D`; the second grep prints nothing and `exit=1`; the log's first line ends with `Implement design system`. If a deleted file is not staged, stage it with `git add -A frontend/diploma-tracker-web/src`.
