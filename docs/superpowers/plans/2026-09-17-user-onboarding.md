# User Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students reach the system through imported group lists and claim their own accounts with email and student ID number while registration is open; signed-in users change their password, and administrators reset student access and set teacher passwords.

**Architecture:** Extends the layered ASP.NET Core API (controllers → services behind interfaces → EF Core → SQL Server) and the React client. An account without a password hash is *unclaimed*. A single-row `PlatformSettings` table holds the registration switch. CSV import is a dedicated service with a small parser; claim and login are protected by ASP.NET Core's built-in rate limiter. Services keep the `(T? result, string? error)` pattern with messages in `OnboardingErrors`.

**Tech Stack:** .NET 8 (`net8.0`), EF Core 8.0.8 (SQL Server), `Microsoft.AspNetCore.RateLimiting` (in the shared framework), `dotnet-ef` 8.0.8 local tool, React 18.3, React Router 6, TypeScript 5.8, Vite 5.4.

**Spec:** `docs/superpowers/specs/2026-09-16-user-onboarding-design.md`

## Global Constraints

- Backend target framework stays `net8.0`; every `Microsoft.EntityFrameworkCore.*` package stays `8.0.8`. No new NuGet or npm packages in this plan.
- All entity keys are `Guid`, except `PlatformSettings.Id`, which is the integer `1` (spec §3).
- Password policy: at least **8** and at most **128** characters, one shared constant (`PasswordPolicy`). The bootstrap administrator keeps its minimum of **12**.
- Student numbers are stored `Trim().ToUpperInvariant()`; emails `Trim().ToLowerInvariant()`.
- An unclaimed account (`PasswordHash == null`) signs in exactly like a wrong password: `401`, no body difference.
- Claim mismatch message, exactly: `These details don't match an account waiting to be claimed.`; closed registration, exactly: `Registration is closed.` (403).
- Rate limit on `POST /api/auth/login` and `POST /api/auth/claim`: fixed window, **10** requests per **1 minute** per client IP, rejection status **429**.
- CSV import: `.csv`, at most **1 MB** (1 048 576 bytes), at most **500** data rows, strict UTF-8 (BOM optional), separator `;` or `,` detected from the header line, required columns `lastName`, `firstName`, `email`, `studentNumber`, optional `patronymic`. Any row error rejects the whole file; nothing is written.
- Lengths: first/last name and patronymic 100, email 256, student number 32, diploma topic 500.
- **No unit tests** are written in this plan (owner decision: tests come in one pass at the end of the project). Existing test projects must still compile.
- Read-only queries use `AsNoTracking()`.
- **Commits: exactly one**, in the final task, title `Implement user onboarding`, no body, no trailer. No commits in any other task.
- Never stage `PROJECT_PAPER.md` or `frontend/diploma-tracker-web/README.md`.
- Backend commands run from `backend/`; frontend commands from `frontend/diploma-tracker-web/`. The repository path contains spaces and Cyrillic — always quote paths. The shell is Git Bash; Python is unavailable, use `node`.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/AppUser.cs` | Optional `Patronymic`, optional `PasswordHash` |
| `backend/DiplomaTracker.Api/Entities/StudentProfile.cs` | `StudentNumber`; optional supervisor and topic |
| `backend/DiplomaTracker.Api/Entities/PlatformSettings.cs` | Registration switch row |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs` | Mapping, unique student number, seeded settings row |
| `backend/DiplomaTracker.Api/Migrations/*` | Regenerated single `InitialCreate` |
| `backend/DiplomaTracker.Api/Services/OnboardingErrors.cs` | Error message constants |
| `backend/DiplomaTracker.Api/Services/PasswordPolicy.cs` | Shared password rule |
| `backend/DiplomaTracker.Api/Services/IdentityNormalizer.cs` | Email, student number and optional-text normalisation |
| `backend/DiplomaTracker.Api/Configuration/RateLimitPolicies.cs` | Rate-limit policy name |
| `backend/DiplomaTracker.Api/Interfaces/IRegistrationService.cs`, `Services/RegistrationService.cs` | Read and set the switch |
| `backend/DiplomaTracker.Api/Controllers/RegistrationController.cs`, `DTOs/Registration/*` | `GET/PUT /api/registration` |
| `backend/DiplomaTracker.Api/Models/ClaimAccountRequest.cs`, `ChangePasswordRequest.cs` | Auth request contracts |
| `backend/DiplomaTracker.Api/Services/AuthService.cs`, `Interfaces/IAuthService.cs`, `Controllers/AuthController.cs` | Claim, change password, unclaimed login refusal |
| `backend/DiplomaTracker.Api/Services/StudentService.cs`, `Interfaces/IStudentService.cs`, `Controllers/StudentsController.cs`, `DTOs/Students/*` | Student number, optional fields, reset access |
| `backend/DiplomaTracker.Api/Services/TeacherService.cs`, `Interfaces/ITeacherService.cs`, `Controllers/TeachersController.cs`, `DTOs/Teachers/*` | Patronymic, password policy, set password |
| `backend/DiplomaTracker.Api/Services/Import/SimpleCsv.cs` | CSV tokenizer |
| `backend/DiplomaTracker.Api/Services/StudentImportService.cs`, `Interfaces/IStudentImportService.cs`, `Controllers/StudentImportController.cs`, `DTOs/Students/StudentImport*.cs` | Import |
| `backend/DiplomaTracker.Api/Services/GroupService.cs`, `DTOs/Groups/GroupStudentResponse.cs` | Nullable topic in group student list |
| `backend/DiplomaTracker.Api/Services/DbSeeder.cs` | Demo student number |
| `backend/DiplomaTracker.Api/Program.cs` | Registrations, rate limiter |
| `backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs` | Constructor change only (compile) |
| `frontend/diploma-tracker-web/src/api/apiClient.ts` | `FormData` bodies, error payload on `ApiError` |
| `frontend/diploma-tracker-web/src/api/types.ts` | Updated and new contracts |
| `frontend/diploma-tracker-web/src/api/registrationApi.ts`, `authApi.ts`, `studentsApi.ts`, `teachersApi.ts` | Client calls |
| `frontend/diploma-tracker-web/src/auth/context.ts`, `AuthContext.tsx` | `completeSignIn` |
| `frontend/diploma-tracker-web/src/pages/ClaimAccountPage.tsx`, `AccountPage.tsx` | New pages |
| `frontend/diploma-tracker-web/src/pages/LoginPage.tsx`, `StudentsPage.tsx`, `TeachersPage.tsx`, `GroupDetailsPage.tsx` | Updated pages |
| `frontend/diploma-tracker-web/src/App.tsx`, `components/LayoutShell.tsx`, `index.css` | Routes, navigation, styles |
| `.superpowers/checks/onboarding-check.mjs` (git-ignored) | Scripted endpoint verification |

---

### Task 1: Onboarding domain model and schema

**Files:**
- Modify: `backend/DiplomaTracker.Api/Entities/AppUser.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/StudentProfile.cs`
- Create: `backend/DiplomaTracker.Api/Entities/PlatformSettings.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Groups/GroupStudentResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AuthService.cs` (login null-hash guard only)
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs`
- Replace: `backend/DiplomaTracker.Api/Migrations/*`

**Interfaces:**
- Produces: `AppUser.Patronymic : string?`, `AppUser.PasswordHash : string?`, `StudentProfile.StudentNumber : string`, `StudentProfile.SupervisorId : Guid?`, `StudentProfile.Supervisor : AppUser?`, `StudentProfile.DiplomaTopic : string?`, `PlatformSettings { int Id; bool RegistrationOpen }`, `AppDbContext.PlatformSettings : DbSet<PlatformSettings>`, constant `PlatformSettings.SingletonId = 1`.

- [ ] **Step 1: Replace `Entities/AppUser.cs`**

```csharp
namespace DiplomaTracker.Api.Entities;

public class AppUser
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public StudentProfile? StudentProfile { get; set; }
    public ICollection<StudentProfile> SupervisedStudents { get; set; } = new List<StudentProfile>();
    public ICollection<GroupReviewer> GroupReviews { get; set; } = new List<GroupReviewer>();
}
```

- [ ] **Step 2: Replace `Entities/StudentProfile.cs`**

```csharp
namespace DiplomaTracker.Api.Entities;

public class StudentProfile
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string StudentNumber { get; set; } = string.Empty;
    public string? DiplomaTopic { get; set; }
    public Guid GroupId { get; set; }
    public Guid? SupervisorId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public AppUser User { get; set; } = null!;
    public Group Group { get; set; } = null!;
    public AppUser? Supervisor { get; set; }
    public ICollection<StudentTask> StudentTasks { get; set; } = new List<StudentTask>();
}
```

- [ ] **Step 3: Create `Entities/PlatformSettings.cs`**

```csharp
namespace DiplomaTracker.Api.Entities;

public class PlatformSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; }
    public bool RegistrationOpen { get; set; }
}
```

- [ ] **Step 4: Update `Data/AppDbContext.cs`**

Add the set after `StudentTasks`:

```csharp
    public DbSet<PlatformSettings> PlatformSettings => Set<PlatformSettings>();
```

Replace the user block's password line and add the patronymic mapping — the user block becomes:

```csharp
        var user = modelBuilder.Entity<AppUser>();
        user.ToTable("Users");
        user.HasKey(x => x.Id);
        user.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        user.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        user.Property(x => x.Patronymic).HasMaxLength(100);
        user.Property(x => x.Email).HasMaxLength(256).IsRequired();
        user.HasIndex(x => x.Email).IsUnique();
        user.Property(x => x.PasswordHash);
        user.Property(x => x.Role).HasMaxLength(50).IsRequired();
        user.Property(x => x.IsActive).IsRequired();
        user.Property(x => x.CreatedAt).IsRequired();
        user.Property(x => x.UpdatedAt).IsRequired();
```

Replace the student profile block with:

```csharp
        var studentProfile = modelBuilder.Entity<StudentProfile>();
        studentProfile.ToTable("StudentProfiles");
        studentProfile.HasKey(x => x.Id);
        studentProfile.Property(x => x.StudentNumber).HasMaxLength(32).IsRequired();
        studentProfile.HasIndex(x => x.StudentNumber).IsUnique();
        studentProfile.Property(x => x.DiplomaTopic).HasMaxLength(500);
        studentProfile.Property(x => x.GroupId).IsRequired();
        studentProfile.Property(x => x.CreatedAt).IsRequired();
        studentProfile.Property(x => x.UpdatedAt).IsRequired();
        studentProfile.HasIndex(x => x.UserId).IsUnique();
        studentProfile.HasOne(x => x.User)
            .WithOne(x => x.StudentProfile)
            .HasForeignKey<StudentProfile>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        studentProfile.HasOne(x => x.Group)
            .WithMany(x => x.Students)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        studentProfile.HasOne(x => x.Supervisor)
            .WithMany(x => x.SupervisedStudents)
            .HasForeignKey(x => x.SupervisorId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
```

Append at the end of `OnModelCreating`:

```csharp
        var platformSettings = modelBuilder.Entity<PlatformSettings>();
        platformSettings.ToTable("PlatformSettings");
        platformSettings.HasKey(x => x.Id);
        platformSettings.Property(x => x.Id).ValueGeneratedNever();
        platformSettings.Property(x => x.RegistrationOpen).IsRequired();
        platformSettings.HasData(new PlatformSettings
        {
            Id = PlatformSettings.SingletonId,
            RegistrationOpen = false
        });
```

- [ ] **Step 5: Make the group student topic nullable**

In `DTOs/Groups/GroupStudentResponse.cs` replace

```csharp
    public string DiplomaTopic { get; set; } = string.Empty;
```

with

```csharp
    public string? DiplomaTopic { get; set; }
```

- [ ] **Step 6: Refuse sign-in for unclaimed accounts**

In `Services/AuthService.cs`, replace the body of `LoginAsync` up to the token creation with:

```csharp
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _dbContext.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == email && u.IsActive);

        if (user?.PasswordHash is null)
        {
            return null;
        }

        if (!_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
        {
            return null;
        }
```

- [ ] **Step 7: Give the demo student a student number**

In `Services/DbSeeder.cs`, inside `EnsureStudentProfileAsync`, add `StudentNumber = "SEED-0001",` to the `new StudentProfile { ... }` initializer directly after `UserId = userId,`.

- [ ] **Step 8: Build and regenerate the schema**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
rm -rf DiplomaTracker.Api/Migrations
dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations
M=$(ls DiplomaTracker.Api/Migrations/*_InitialCreate.cs)
grep -c 'name: "PlatformSettings"' "$M"
grep -c 'IX_StudentProfiles_StudentNumber' "$M"
grep "PasswordHash = table.Column" "$M" | grep -c "nullable: true"
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: build `0 Warning(s) 0 Error(s)`; `Done.`; counts `1` or more for each grep; `No changes have been made to the model since the last migration.`

If `dotnet build` reports errors in files not listed in this task (another use of `SupervisorId` as a non-nullable `Guid` or of `DiplomaTopic` as non-nullable), fix only the nullability at that site and note it in the report.

- [ ] **Step 9: Rebuild the local database**

Stop any running API first (`taskkill //F //IM DiplomaTracker.Api.exe` ignores "not found").

```bash
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

Expected: `Dropping database 'DiplomaTrackerDb'` or a message that it does not exist. The API recreates and seeds it on its next start (Task 5).

---

### Task 2: Passwords, registration switch and account claiming

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/OnboardingErrors.cs`
- Create: `backend/DiplomaTracker.Api/Services/PasswordPolicy.cs`
- Create: `backend/DiplomaTracker.Api/Services/IdentityNormalizer.cs`
- Create: `backend/DiplomaTracker.Api/Configuration/RateLimitPolicies.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IRegistrationService.cs`
- Create: `backend/DiplomaTracker.Api/Services/RegistrationService.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Registration/RegistrationStatusResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Registration/UpdateRegistrationStatusRequest.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/RegistrationController.cs`
- Create: `backend/DiplomaTracker.Api/Models/ClaimAccountRequest.cs`
- Create: `backend/DiplomaTracker.Api/Models/ChangePasswordRequest.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IAuthService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/AuthService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/AuthController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`
- Modify: `backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs` (constructor only)

**Interfaces:**
- Consumes: Task 1 entities.
- Produces:
  - `OnboardingErrors` constants (listed in Step 1), used by Tasks 3 and 4.
  - `PasswordPolicy.IsSatisfiedBy(string? password) : bool`, `PasswordPolicy.Violation : string`.
  - `IdentityNormalizer.Email(string) : string`, `IdentityNormalizer.StudentNumber(string) : string`, `IdentityNormalizer.Optional(string?) : string?`.
  - `IRegistrationService.IsOpenAsync() : Task<bool>`, `SetOpenAsync(bool open) : Task`.
  - `IAuthService.ClaimAccountAsync(ClaimAccountRequest) : Task<(LoginResponse? result, string? error)>`, `ChangePasswordAsync(Guid userId, ChangePasswordRequest) : Task<(bool success, string? error)>`.
  - HTTP: `GET /api/registration` → `{ open }`; `PUT /api/registration` (Admin) `{ open }` → 204; `POST /api/auth/claim` → 200 `LoginResponse` | 400 | 403 | 429; `PUT /api/auth/password` → 204 | 400 | 401.

- [ ] **Step 1: Create `Services/OnboardingErrors.cs`**

```csharp
namespace DiplomaTracker.Api.Services;

public static class OnboardingErrors
{
    public const string RegistrationClosed = "Registration is closed.";
    public const string ClaimDetailsMismatch = "These details don't match an account waiting to be claimed.";
    public const string CurrentPasswordIncorrect = "Current password is incorrect.";
    public const string UserNotFound = "User not found.";

    public const string StudentNotFound = "Student not found.";
    public const string TeacherNotFound = "Teacher not found.";
    public const string GroupNotFound = "Group not found.";
    public const string SupervisorNotFound = "Supervisor not found.";
    public const string SupervisorMustBeActiveTeacher = "Supervisor must be an active teacher.";
    public const string EmailTaken = "Email already exists.";
    public const string StudentNumberTaken = "Student number already exists.";

    public const string ImportFileMissing = "Choose a CSV file to upload.";
    public const string ImportFileNotCsv = "Only .csv files can be imported.";
    public const string ImportFileTooLarge = "The file is larger than 1 MB.";
    public const string ImportFileNotUtf8 = "Save the file as \"CSV UTF-8\" and upload it again.";
    public const string ImportTooManyRows = "The file contains more than 500 students.";
    public const string ImportHeaderInvalid = "The first line must name the columns lastName, firstName, email and studentNumber.";
    public const string ImportHasRowErrors = "The file contains errors. Nothing was imported.";
    public const string ImportConflict = "The student list changed during import; upload the file again.";
}
```

- [ ] **Step 2: Create `Services/PasswordPolicy.cs`**

```csharp
namespace DiplomaTracker.Api.Services;

public static class PasswordPolicy
{
    public const int MinimumLength = 8;
    public const int MaximumLength = 128;
    public const string Violation = "Password must be between 8 and 128 characters.";

    public static bool IsSatisfiedBy(string? password) =>
        password is not null && password.Length is >= MinimumLength and <= MaximumLength;
}
```

- [ ] **Step 3: Create `Services/IdentityNormalizer.cs`**

```csharp
namespace DiplomaTracker.Api.Services;

public static class IdentityNormalizer
{
    public static string Email(string value) => value.Trim().ToLowerInvariant();

    public static string StudentNumber(string value) => value.Trim().ToUpperInvariant();

    public static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
```

- [ ] **Step 4: Create `Configuration/RateLimitPolicies.cs`**

```csharp
namespace DiplomaTracker.Api.Configuration;

public static class RateLimitPolicies
{
    public const string Authentication = "authentication";
    public const int AuthenticationPermitLimit = 10;
    public static readonly TimeSpan AuthenticationWindow = TimeSpan.FromMinutes(1);
}
```

- [ ] **Step 5: Create the registration service**

`Interfaces/IRegistrationService.cs`:

```csharp
namespace DiplomaTracker.Api.Interfaces;

public interface IRegistrationService
{
    Task<bool> IsOpenAsync();
    Task SetOpenAsync(bool open);
}
```

`Services/RegistrationService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class RegistrationService : IRegistrationService
{
    private readonly AppDbContext _dbContext;

    public RegistrationService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<bool> IsOpenAsync()
    {
        return await _dbContext.PlatformSettings.AsNoTracking()
            .Where(s => s.Id == PlatformSettings.SingletonId)
            .Select(s => s.RegistrationOpen)
            .FirstOrDefaultAsync();
    }

    public async Task SetOpenAsync(bool open)
    {
        var settings = await _dbContext.PlatformSettings.FirstOrDefaultAsync(s => s.Id == PlatformSettings.SingletonId);
        if (settings is null)
        {
            settings = new PlatformSettings { Id = PlatformSettings.SingletonId };
            _dbContext.PlatformSettings.Add(settings);
        }

        settings.RegistrationOpen = open;
        await _dbContext.SaveChangesAsync();
    }
}
```

- [ ] **Step 6: Create the registration contracts and controller**

`DTOs/Registration/RegistrationStatusResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Registration;

public class RegistrationStatusResponse
{
    public bool Open { get; set; }
}
```

`DTOs/Registration/UpdateRegistrationStatusRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Registration;

public class UpdateRegistrationStatusRequest
{
    public bool Open { get; set; }
}
```

`Controllers/RegistrationController.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Registration;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/registration")]
public class RegistrationController : ControllerBase
{
    private readonly IRegistrationService _registrationService;

    public RegistrationController(IRegistrationService registrationService)
    {
        _registrationService = registrationService;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(new RegistrationStatusResponse { Open = await _registrationService.IsOpenAsync() });
    }

    [Authorize(Roles = "Admin")]
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateRegistrationStatusRequest request)
    {
        await _registrationService.SetOpenAsync(request.Open);
        return NoContent();
    }
}
```

- [ ] **Step 7: Create the auth request contracts**

`Models/ClaimAccountRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.Models;

public class ClaimAccountRequest
{
    [Required, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(32)]
    public string StudentNumber { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
```

`Models/ChangePasswordRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.Models;

public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required]
    public string NewPassword { get; set; } = string.Empty;
}
```

- [ ] **Step 8: Extend `Interfaces/IAuthService.cs`**

```csharp
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Interfaces;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request);
    Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId);
    Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request);
    Task<(bool success, string? error)> ChangePasswordAsync(Guid userId, ChangePasswordRequest request);
}
```

- [ ] **Step 9: Implement claim and change password in `Services/AuthService.cs`**

Add the field and constructor parameter:

```csharp
    private readonly IRegistrationService _registrationService;

    public AuthService(
        AppDbContext dbContext,
        IOptions<JwtSettings> jwtOptions,
        IPasswordHasher passwordHasher,
        IRegistrationService registrationService)
    {
        _dbContext = dbContext;
        _jwtSettings = jwtOptions.Value;
        _passwordHasher = passwordHasher;
        _registrationService = registrationService;
    }
```

Add these methods after `GetCurrentUserAsync`:

```csharp
    public async Task<(LoginResponse? result, string? error)> ClaimAccountAsync(ClaimAccountRequest request)
    {
        if (!await _registrationService.IsOpenAsync())
        {
            return (null, OnboardingErrors.RegistrationClosed);
        }

        if (!PasswordPolicy.IsSatisfiedBy(request.Password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        var profile = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.StudentNumber == studentNumber
                && p.User.Email == email
                && p.User.Role == "Student");

        if (profile is null || !profile.User.IsActive || profile.User.PasswordHash is not null)
        {
            return (null, OnboardingErrors.ClaimDetailsMismatch);
        }

        profile.User.PasswordHash = _passwordHasher.HashPassword(request.Password);
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (new LoginResponse
        {
            Token = CreateToken(profile.User),
            User = MapCurrentUser(profile.User)
        }, null);
    }

    public async Task<(bool success, string? error)> ChangePasswordAsync(Guid userId, ChangePasswordRequest request)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
        if (user?.PasswordHash is null)
        {
            return (false, OnboardingErrors.UserNotFound);
        }

        if (!_passwordHasher.VerifyPassword(request.CurrentPassword, user.PasswordHash))
        {
            return (false, OnboardingErrors.CurrentPasswordIncorrect);
        }

        if (!PasswordPolicy.IsSatisfiedBy(request.NewPassword))
        {
            return (false, PasswordPolicy.Violation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(request.NewPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }
```

- [ ] **Step 10: Replace `Controllers/AuthController.cs`**

```csharp
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [EnableRateLimiting(RateLimitPolicies.Authentication)]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await _authService.LoginAsync(request);
        if (result is null)
        {
            return Unauthorized();
        }

        return Ok(result);
    }

    [EnableRateLimiting(RateLimitPolicies.Authentication)]
    [HttpPost("claim")]
    public async Task<IActionResult> Claim([FromBody] ClaimAccountRequest request)
    {
        var (result, error) = await _authService.ClaimAccountAsync(request);
        if (result is not null)
        {
            return Ok(result);
        }

        return error == OnboardingErrors.RegistrationClosed
            ? StatusCode(StatusCodes.Status403Forbidden, new { message = error })
            : BadRequest(new { message = error });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var user = await _authService.GetCurrentUserAsync(userId);
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(user);
    }

    [Authorize]
    [HttpPut("password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        var (success, error) = await _authService.ChangePasswordAsync(userId, request);
        if (success)
        {
            return NoContent();
        }

        return error == OnboardingErrors.UserNotFound
            ? Unauthorized()
            : BadRequest(new { message = error });
    }

    private bool TryGetUserId(out Guid userId)
    {
        var userIdValue = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return Guid.TryParse(userIdValue, out userId);
    }
}
```

- [ ] **Step 11: Register the service and the rate limiter in `Program.cs`**

Add usings at the top:

```csharp
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
```

After `builder.Services.AddScoped<IDepartmentService, DepartmentService>();` add:

```csharp
builder.Services.AddScoped<IRegistrationService, RegistrationService>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(RateLimitPolicies.Authentication, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = RateLimitPolicies.AuthenticationPermitLimit,
                Window = RateLimitPolicies.AuthenticationWindow,
                QueueLimit = 0
            }));
});
```

Replace

```csharp
app.UseCors(CorsPolicyName);
app.UseAuthentication();
```

with

```csharp
app.UseCors(CorsPolicyName);
app.UseRateLimiter();
app.UseAuthentication();
```

- [ ] **Step 12: Keep the test project compiling**

In `backend/DiplomaTracker.Api.Tests/Services/AuthServiceTests.cs`, replace the last line of `CreateAuthService`

```csharp
        return new AuthService(context, jwtOptions, passwordHasher);
```

with

```csharp
        return new AuthService(context, jwtOptions, passwordHasher, new RegistrationService(context));
```

- [ ] **Step 13: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
```

Expected: both `0 Error(s)`, API project `0 Warning(s)`.

---

### Task 3: Student and teacher administration

**Files:**
- Modify: `backend/DiplomaTracker.Api/DTOs/Students/CreateStudentRequest.cs`, `UpdateStudentRequest.cs`, `StudentResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IStudentService.cs`
- Replace: `backend/DiplomaTracker.Api/Services/StudentService.cs`
- Replace: `backend/DiplomaTracker.Api/Controllers/StudentsController.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Teachers/CreateTeacherRequest.cs`, `UpdateTeacherRequest.cs`, `TeacherResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Teachers/SetTeacherPasswordRequest.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/ITeacherService.cs`
- Replace: `backend/DiplomaTracker.Api/Services/TeacherService.cs`
- Replace: `backend/DiplomaTracker.Api/Controllers/TeachersController.cs`

**Interfaces:**
- Consumes: `OnboardingErrors`, `PasswordPolicy`, `IdentityNormalizer`, `SqlUpdateExceptionHelper.IsUniqueConstraintViolation()`.
- Produces:
  - `IStudentService.ResetAccessAsync(Guid id) : Task<(bool success, string? error)>`.
  - `ITeacherService.SetPasswordAsync(Guid id, string password) : Task<(bool success, string? error)>`.
  - `StudentResponse` gains `Patronymic`, `StudentNumber`, `IsClaimed`; `DiplomaTopic` nullable. `TeacherResponse` gains `Patronymic`.
  - HTTP: `POST /api/students/{id}/reset-access` → 204 | 404; `PUT /api/teachers/{id}/password` → 204 | 400 | 404. Student and teacher create/update: unknown group or supervisor in the body → 400; email or student number taken → 409.

- [ ] **Step 1: Replace the student request and response contracts**

`DTOs/Students/CreateStudentRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Students;

public class CreateStudentRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(32)]
    public string StudentNumber { get; set; } = string.Empty;

    public string? Password { get; set; }

    [MaxLength(500)]
    public string? DiplomaTopic { get; set; }

    public Guid GroupId { get; set; }

    public Guid? SupervisorId { get; set; }
}
```

`DTOs/Students/UpdateStudentRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Students;

public class UpdateStudentRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, MaxLength(32)]
    public string StudentNumber { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? DiplomaTopic { get; set; }

    public Guid GroupId { get; set; }

    public Guid? SupervisorId { get; set; }
}
```

`DTOs/Students/StudentResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Students;

public class StudentResponse
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool IsClaimed { get; set; }
    public string? DiplomaTopic { get; set; }
    public Guid? GroupId { get; set; }
    public string? GroupName { get; set; }
    public Guid? SupervisorId { get; set; }
    public string? SupervisorFirstName { get; set; }
    public string? SupervisorLastName { get; set; }
    public string? SupervisorEmail { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

- [ ] **Step 2: Replace `Interfaces/IStudentService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Students;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentService
{
    Task<IReadOnlyList<StudentResponse>> GetStudentsAsync();
    Task<StudentResponse?> GetStudentByIdAsync(Guid id);
    Task<(StudentResponse? student, string? error)> CreateStudentAsync(CreateStudentRequest request);
    Task<(StudentResponse? student, string? error)> UpdateStudentAsync(Guid id, UpdateStudentRequest request);
    Task<(StudentResponse? student, string? error)> AssignGroupAsync(Guid id, Guid groupId);
    Task<(StudentResponse? student, string? error)> AssignSupervisorAsync(Guid id, Guid supervisorId);
    Task<(bool success, string? error)> DeactivateStudentAsync(Guid id);
    Task<(bool success, string? error)> ResetAccessAsync(Guid id);
}
```

- [ ] **Step 3: Replace `Services/StudentService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class StudentService : IStudentService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;

    public StudentService(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task<IReadOnlyList<StudentResponse>> GetStudentsAsync()
    {
        var students = await _dbContext.StudentProfiles.AsNoTracking()
            .Include(s => s.User)
            .Include(s => s.Group)
            .Include(s => s.Supervisor)
            .Where(s => s.User.Role == "Student")
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return students.Select(MapStudent).ToList();
    }

    public async Task<StudentResponse?> GetStudentByIdAsync(Guid id)
    {
        var student = await LoadStudentProfileAsync(id);
        return student is null ? null : MapStudent(student);
    }

    public async Task<(StudentResponse? student, string? error)> CreateStudentAsync(CreateStudentRequest request)
    {
        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        if (await _dbContext.Users.AnyAsync(u => u.Email == email))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumber == studentNumber))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }

        var password = string.IsNullOrEmpty(request.Password) ? null : request.Password;
        if (password is not null && !PasswordPolicy.IsSatisfiedBy(password))
        {
            return (null, PasswordPolicy.Violation);
        }

        var assignment = await ResolveAssignmentAsync(request.GroupId, request.SupervisorId);
        if (assignment.error is not null)
        {
            return (null, assignment.error);
        }

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Patronymic = IdentityNormalizer.Optional(request.Patronymic),
            Email = email,
            PasswordHash = password is null ? null : _passwordHasher.HashPassword(password),
            Role = "Student",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            StudentNumber = studentNumber,
            DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic),
            GroupId = assignment.group!.Id,
            SupervisorId = assignment.supervisor?.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Users.Add(user);
        _dbContext.StudentProfiles.Add(profile);

        var conflict = await SaveWithConflictMappingAsync(email, studentNumber, user.Id);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        profile.User = user;
        profile.Group = assignment.group;
        profile.Supervisor = assignment.supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> UpdateStudentAsync(Guid id, UpdateStudentRequest request)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        var email = IdentityNormalizer.Email(request.Email);
        var studentNumber = IdentityNormalizer.StudentNumber(request.StudentNumber);

        if (await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != profile.UserId))
        {
            return (null, OnboardingErrors.EmailTaken);
        }

        if (await _dbContext.StudentProfiles.AnyAsync(p => p.StudentNumber == studentNumber && p.Id != profile.Id))
        {
            return (null, OnboardingErrors.StudentNumberTaken);
        }

        var assignment = await ResolveAssignmentAsync(request.GroupId, request.SupervisorId);
        if (assignment.error is not null)
        {
            return (null, assignment.error);
        }

        var now = DateTime.UtcNow;
        profile.User.FirstName = request.FirstName.Trim();
        profile.User.LastName = request.LastName.Trim();
        profile.User.Patronymic = IdentityNormalizer.Optional(request.Patronymic);
        profile.User.Email = email;
        profile.User.UpdatedAt = now;
        profile.StudentNumber = studentNumber;
        profile.DiplomaTopic = IdentityNormalizer.Optional(request.DiplomaTopic);
        profile.GroupId = assignment.group!.Id;
        profile.SupervisorId = assignment.supervisor?.Id;
        profile.UpdatedAt = now;

        var conflict = await SaveWithConflictMappingAsync(email, studentNumber, profile.UserId);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        profile.Group = assignment.group;
        profile.Supervisor = assignment.supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> AssignGroupAsync(Guid id, Guid groupId)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, OnboardingErrors.GroupNotFound);
        }

        profile.GroupId = groupId;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        profile.Group = group;
        return (MapStudent(profile), null);
    }

    public async Task<(StudentResponse? student, string? error)> AssignSupervisorAsync(Guid id, Guid supervisorId)
    {
        var profile = await LoadStudentProfileAsync(id);
        if (profile is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId);
        if (supervisor is null)
        {
            return (null, OnboardingErrors.SupervisorNotFound);
        }

        if (supervisor.Role != "Teacher" || !supervisor.IsActive)
        {
            return (null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }

        profile.SupervisorId = supervisorId;
        profile.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        profile.Supervisor = supervisor;
        return (MapStudent(profile), null);
    }

    public async Task<(bool success, string? error)> DeactivateStudentAsync(Guid id)
    {
        var profile = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");

        if (profile is null)
        {
            return (false, OnboardingErrors.StudentNotFound);
        }

        profile.User.IsActive = false;
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    public async Task<(bool success, string? error)> ResetAccessAsync(Guid id)
    {
        var profile = await _dbContext.StudentProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");

        if (profile is null)
        {
            return (false, OnboardingErrors.StudentNotFound);
        }

        profile.User.PasswordHash = null;
        profile.User.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    private async Task<StudentProfile?> LoadStudentProfileAsync(Guid id)
    {
        return await _dbContext.StudentProfiles
            .Include(s => s.User)
            .Include(s => s.Group)
            .Include(s => s.Supervisor)
            .FirstOrDefaultAsync(s => s.Id == id && s.User.Role == "Student");
    }

    private async Task<(Group? group, AppUser? supervisor, string? error)> ResolveAssignmentAsync(Guid groupId, Guid? supervisorId)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, null, OnboardingErrors.GroupNotFound);
        }

        if (supervisorId is null)
        {
            return (group, null, null);
        }

        var supervisor = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == supervisorId.Value);
        if (supervisor is null)
        {
            return (null, null, OnboardingErrors.SupervisorNotFound);
        }

        if (supervisor.Role != "Teacher" || !supervisor.IsActive)
        {
            return (null, null, OnboardingErrors.SupervisorMustBeActiveTeacher);
        }

        return (group, supervisor, null);
    }

    private async Task<string?> SaveWithConflictMappingAsync(string email, string studentNumber, Guid userId)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            var emailTaken = await _dbContext.Users.AnyAsync(u => u.Email == email && u.Id != userId);
            return emailTaken ? OnboardingErrors.EmailTaken : OnboardingErrors.StudentNumberTaken;
        }
    }

    private static StudentResponse MapStudent(StudentProfile profile)
    {
        return new StudentResponse
        {
            Id = profile.Id,
            UserId = profile.UserId,
            FirstName = profile.User.FirstName,
            LastName = profile.User.LastName,
            Patronymic = profile.User.Patronymic,
            Email = profile.User.Email,
            StudentNumber = profile.StudentNumber,
            Role = profile.User.Role,
            IsActive = profile.User.IsActive,
            IsClaimed = profile.User.PasswordHash is not null,
            DiplomaTopic = profile.DiplomaTopic,
            GroupId = profile.GroupId,
            GroupName = profile.Group?.Name,
            SupervisorId = profile.SupervisorId,
            SupervisorFirstName = profile.Supervisor?.FirstName,
            SupervisorLastName = profile.Supervisor?.LastName,
            SupervisorEmail = profile.Supervisor?.Email,
            CreatedAt = profile.CreatedAt,
            UpdatedAt = profile.UpdatedAt
        };
    }
}
```

- [ ] **Step 4: Replace `Controllers/StudentsController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class StudentsController : ControllerBase
{
    private readonly IStudentService _studentService;

    public StudentsController(IStudentService studentService)
    {
        _studentService = studentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _studentService.GetStudentsAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var student = await _studentService.GetStudentByIdAsync(id);
        return student is null ? NotFound() : Ok(student);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStudentRequest request)
    {
        var (student, error) = await _studentService.CreateStudentAsync(request);
        return student is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = student.Id }, student);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStudentRequest request)
    {
        var (student, error) = await _studentService.UpdateStudentAsync(id, request);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _studentService.DeactivateStudentAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPost("{id:guid}/reset-access")]
    public async Task<IActionResult> ResetAccess(Guid id)
    {
        var (success, error) = await _studentService.ResetAccessAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPut("{id:guid}/group")]
    public async Task<IActionResult> AssignGroup(Guid id, [FromBody] AssignStudentGroupRequest request)
    {
        var (student, error) = await _studentService.AssignGroupAsync(id, request.GroupId);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    [HttpPut("{id:guid}/supervisor")]
    public async Task<IActionResult> AssignSupervisor(Guid id, [FromBody] AssignStudentSupervisorRequest request)
    {
        var (student, error) = await _studentService.AssignSupervisorAsync(id, request.SupervisorId);
        return student is null ? ToErrorResult(error) : Ok(student);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        OnboardingErrors.StudentNotFound => NotFound(new { message = error }),
        OnboardingErrors.EmailTaken or OnboardingErrors.StudentNumberTaken => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
```

- [ ] **Step 5: Replace the teacher contracts**

`DTOs/Teachers/CreateTeacherRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Teachers;

public class CreateTeacherRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}
```

`DTOs/Teachers/UpdateTeacherRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Teachers;

public class UpdateTeacherRequest
{
    [Required, MaxLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, MaxLength(100)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Patronymic { get; set; }

    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;
}
```

`DTOs/Teachers/TeacherResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Teachers;

public class TeacherResponse
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Patronymic { get; set; }
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

`DTOs/Teachers/SetTeacherPasswordRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Teachers;

public class SetTeacherPasswordRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}
```

- [ ] **Step 6: Replace `Interfaces/ITeacherService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Teachers;

namespace DiplomaTracker.Api.Interfaces;

public interface ITeacherService
{
    Task<IReadOnlyList<TeacherResponse>> GetTeachersAsync();
    Task<TeacherResponse?> GetTeacherByIdAsync(Guid id);
    Task<(TeacherResponse? teacher, string? error)> CreateTeacherAsync(CreateTeacherRequest request);
    Task<(TeacherResponse? teacher, string? error)> UpdateTeacherAsync(Guid id, UpdateTeacherRequest request);
    Task<(bool success, string? error)> DeactivateTeacherAsync(Guid id);
    Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password);
}
```

- [ ] **Step 7: Replace `Services/TeacherService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TeacherService : ITeacherService
{
    private readonly AppDbContext _dbContext;
    private readonly IPasswordHasher _passwordHasher;

    public TeacherService(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        _dbContext = dbContext;
        _passwordHasher = passwordHasher;
    }

    public async Task<IReadOnlyList<TeacherResponse>> GetTeachersAsync()
    {
        var users = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Teacher")
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return users.Select(MapTeacher).ToList();
    }

    public async Task<TeacherResponse?> GetTeacherByIdAsync(Guid id)
    {
        var user = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        return user is null ? null : MapTeacher(user);
    }

    public async Task<(TeacherResponse? teacher, string? error)> CreateTeacherAsync(CreateTeacherRequest request)
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
            Role = "Teacher",
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

        return (MapTeacher(user), null);
    }

    public async Task<(TeacherResponse? teacher, string? error)> UpdateTeacherAsync(Guid id, UpdateTeacherRequest request)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (null, OnboardingErrors.TeacherNotFound);
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

        return (MapTeacher(user), null);
    }

    public async Task<(bool success, string? error)> DeactivateTeacherAsync(Guid id)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (false, OnboardingErrors.TeacherNotFound);
        }

        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(bool success, string? error)> SetPasswordAsync(Guid id, string password)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Role == "Teacher" && u.Id == id);
        if (user is null)
        {
            return (false, OnboardingErrors.TeacherNotFound);
        }

        if (!PasswordPolicy.IsSatisfiedBy(password))
        {
            return (false, PasswordPolicy.Violation);
        }

        user.PasswordHash = _passwordHasher.HashPassword(password);
        user.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private static TeacherResponse MapTeacher(AppUser user)
    {
        return new TeacherResponse
        {
            Id = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Patronymic = user.Patronymic,
            Email = user.Email,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
            UpdatedAt = user.UpdatedAt
        };
    }
}
```

- [ ] **Step 8: Replace `Controllers/TeachersController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Teachers;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class TeachersController : ControllerBase
{
    private readonly ITeacherService _teacherService;

    public TeachersController(ITeacherService teacherService)
    {
        _teacherService = teacherService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _teacherService.GetTeachersAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var teacher = await _teacherService.GetTeacherByIdAsync(id);
        return teacher is null ? NotFound() : Ok(teacher);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.CreateTeacherAsync(request);
        return teacher is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = teacher.Id }, teacher);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTeacherRequest request)
    {
        var (teacher, error) = await _teacherService.UpdateTeacherAsync(id, request);
        return teacher is null ? ToErrorResult(error) : Ok(teacher);
    }

    [HttpPatch("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var (success, error) = await _teacherService.DeactivateTeacherAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    [HttpPut("{id:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid id, [FromBody] SetTeacherPasswordRequest request)
    {
        var (success, error) = await _teacherService.SetPasswordAsync(id, request.Password);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        OnboardingErrors.TeacherNotFound => NotFound(new { message = error }),
        OnboardingErrors.EmailTaken => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
```

- [ ] **Step 9: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Warning(s) 0 Error(s)`.

---

### Task 4: Student list import

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/Import/SimpleCsv.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Students/StudentImportResult.cs`
- Create: `backend/DiplomaTracker.Api/Services/StudentImportOutcome.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IStudentImportService.cs`
- Create: `backend/DiplomaTracker.Api/Services/StudentImportService.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/StudentImportController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `OnboardingErrors`, `IdentityNormalizer`, `SqlUpdateExceptionHelper.IsUniqueConstraintViolation()`.
- Produces:
  - `IStudentImportService.ImportAsync(Guid groupId, IFormFile? file) : Task<StudentImportOutcome>`.
  - HTTP `POST /api/groups/{groupId}/students/import` (Admin, multipart field `file`):
    - 200 `{ created: number, skipped: [{ line, email }] }`
    - 400 `{ message, errors: [{ line, message }] }` (row errors; `errors` empty for file-level problems)
    - 404 `{ message }` unknown group
    - 409 `{ message }` concurrent conflict

- [ ] **Step 1: Create `Services/Import/SimpleCsv.cs`**

```csharp
using System.Text;

namespace DiplomaTracker.Api.Services.Import;

public sealed record CsvRecord(int LineNumber, IReadOnlyList<string> Fields);

/// <summary>
/// Minimal RFC 4180 tokenizer: quoted fields, doubled quotes, CRLF or LF line ends, and quoted line breaks.
/// Line numbers are 1-based and refer to the line on which a record starts.
/// </summary>
public static class SimpleCsv
{
    public static char DetectDelimiter(string text)
    {
        var semicolons = 0;
        var commas = 0;
        var inQuotes = false;

        foreach (var ch in text)
        {
            if (ch == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (!inQuotes && (ch == '\r' || ch == '\n'))
            {
                break;
            }
            else if (!inQuotes && ch == ';')
            {
                semicolons++;
            }
            else if (!inQuotes && ch == ',')
            {
                commas++;
            }
        }

        return semicolons > commas ? ';' : ',';
    }

    public static IReadOnlyList<CsvRecord> Parse(string text, char delimiter)
    {
        var records = new List<CsvRecord>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var line = 1;
        var recordLine = 1;
        var index = 0;

        while (index < text.Length)
        {
            var ch = text[index];

            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (index + 1 < text.Length && text[index + 1] == '"')
                    {
                        field.Append('"');
                        index += 2;
                        continue;
                    }

                    inQuotes = false;
                    index++;
                    continue;
                }

                if (ch == '\n')
                {
                    line++;
                }

                field.Append(ch);
                index++;
                continue;
            }

            if (ch == '"')
            {
                inQuotes = true;
                index++;
                continue;
            }

            if (ch == delimiter)
            {
                fields.Add(field.ToString());
                field.Clear();
                index++;
                continue;
            }

            if (ch == '\r' || ch == '\n')
            {
                fields.Add(field.ToString());
                field.Clear();
                records.Add(new CsvRecord(recordLine, fields.ToArray()));
                fields.Clear();

                if (ch == '\r' && index + 1 < text.Length && text[index + 1] == '\n')
                {
                    index++;
                }

                index++;
                line++;
                recordLine = line;
                continue;
            }

            field.Append(ch);
            index++;
        }

        if (field.Length > 0 || fields.Count > 0)
        {
            fields.Add(field.ToString());
            records.Add(new CsvRecord(recordLine, fields.ToArray()));
        }

        return records;
    }
}
```

- [ ] **Step 2: Create `DTOs/Students/StudentImportResult.cs`**

```csharp
namespace DiplomaTracker.Api.DTOs.Students;

public sealed record SkippedImportRow(int Line, string Email);

public sealed record ImportRowError(int Line, string Message);

public class StudentImportResult
{
    public int Created { get; set; }
    public IReadOnlyList<SkippedImportRow> Skipped { get; set; } = [];
}
```

- [ ] **Step 3: Create `Services/StudentImportOutcome.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Students;

namespace DiplomaTracker.Api.Services;

public sealed class StudentImportOutcome
{
    public StudentImportResult? Result { get; private init; }
    public string? Error { get; private init; }
    public IReadOnlyList<ImportRowError> RowErrors { get; private init; } = [];

    public static StudentImportOutcome Succeeded(StudentImportResult result) => new() { Result = result };

    public static StudentImportOutcome Failed(string error) => new() { Error = error };

    public static StudentImportOutcome Invalid(IReadOnlyList<ImportRowError> rowErrors) =>
        new() { Error = OnboardingErrors.ImportHasRowErrors, RowErrors = rowErrors };
}
```

- [ ] **Step 4: Create `Interfaces/IStudentImportService.cs`**

```csharp
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IStudentImportService
{
    Task<StudentImportOutcome> ImportAsync(Guid groupId, IFormFile? file);
}
```

- [ ] **Step 5: Create `Services/StudentImportService.cs`**

```csharp
using System.Net.Mail;
using System.Text;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services.Import;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class StudentImportService : IStudentImportService
{
    public const long MaxFileBytes = 1024 * 1024;
    public const int MaxRows = 500;

    private const string LastNameColumn = "lastname";
    private const string FirstNameColumn = "firstname";
    private const string PatronymicColumn = "patronymic";
    private const string EmailColumn = "email";
    private const string StudentNumberColumn = "studentnumber";
    private static readonly string[] RequiredColumns = [LastNameColumn, FirstNameColumn, EmailColumn, StudentNumberColumn];
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    private readonly AppDbContext _dbContext;

    public StudentImportService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<StudentImportOutcome> ImportAsync(Guid groupId, IFormFile? file)
    {
        if (!await _dbContext.Groups.AnyAsync(g => g.Id == groupId))
        {
            return StudentImportOutcome.Failed(OnboardingErrors.GroupNotFound);
        }

        if (file is null || file.Length == 0)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileMissing);
        }

        if (!string.Equals(Path.GetExtension(file.FileName), ".csv", StringComparison.OrdinalIgnoreCase))
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileNotCsv);
        }

        if (file.Length > MaxFileBytes)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileTooLarge);
        }

        var text = await ReadStrictUtf8Async(file);
        if (text is null)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileNotUtf8);
        }

        var records = SimpleCsv.Parse(text, SimpleCsv.DetectDelimiter(text))
            .Where(record => record.Fields.Any(value => !string.IsNullOrWhiteSpace(value)))
            .ToList();

        var columns = records.Count == 0 ? null : MapColumns(records[0].Fields);
        if (columns is null)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportHeaderInvalid);
        }

        var dataRecords = records.Skip(1).ToList();
        if (dataRecords.Count > MaxRows)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportTooManyRows);
        }

        var errors = new List<ImportRowError>();
        var rows = ValidateRows(dataRecords, columns, errors);

        var emails = rows.Select(r => r.Email).ToList();
        var numbers = rows.Select(r => r.StudentNumber).ToList();

        var usersByEmail = await _dbContext.Users.AsNoTracking()
            .Include(u => u.StudentProfile)
            .Where(u => emails.Contains(u.Email))
            .ToDictionaryAsync(u => u.Email);

        var numbersInUse = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => numbers.Contains(p.StudentNumber))
            .Select(p => p.StudentNumber)
            .ToListAsync();
        var numbersInUseSet = numbersInUse.ToHashSet();

        var skipped = new List<SkippedImportRow>();
        var toCreate = new List<ImportRow>();

        foreach (var row in rows)
        {
            if (usersByEmail.TryGetValue(row.Email, out var existingUser))
            {
                if (existingUser.Role != "Student" || existingUser.StudentProfile is null)
                {
                    errors.Add(new ImportRowError(row.Line, "Email belongs to a teacher or an administrator."));
                }
                else if (existingUser.StudentProfile.StudentNumber != row.StudentNumber)
                {
                    errors.Add(new ImportRowError(row.Line, "Email belongs to an existing student with a different student number."));
                }
                else
                {
                    skipped.Add(new SkippedImportRow(row.Line, row.Email));
                }
            }
            else if (numbersInUseSet.Contains(row.StudentNumber))
            {
                errors.Add(new ImportRowError(row.Line, "Student number belongs to an existing student with a different email."));
            }
            else
            {
                toCreate.Add(row);
            }
        }

        if (errors.Count > 0)
        {
            return StudentImportOutcome.Invalid(errors.OrderBy(e => e.Line).ToList());
        }

        var now = DateTime.UtcNow;
        foreach (var row in toCreate)
        {
            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                FirstName = row.FirstName,
                LastName = row.LastName,
                Patronymic = row.Patronymic,
                Email = row.Email,
                PasswordHash = null,
                Role = "Student",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            };

            _dbContext.Users.Add(user);
            _dbContext.StudentProfiles.Add(new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                StudentNumber = row.StudentNumber,
                GroupId = groupId,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return StudentImportOutcome.Failed(OnboardingErrors.ImportConflict);
        }

        return StudentImportOutcome.Succeeded(new StudentImportResult
        {
            Created = toCreate.Count,
            Skipped = skipped
        });
    }

    private static async Task<string?> ReadStrictUtf8Async(IFormFile file)
    {
        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer);

        try
        {
            var text = StrictUtf8.GetString(buffer.ToArray());
            return text.Length > 0 && text[0] == '﻿' ? text[1..] : text;
        }
        catch (DecoderFallbackException)
        {
            return null;
        }
    }

    private static Dictionary<string, int>? MapColumns(IReadOnlyList<string> header)
    {
        var columns = new Dictionary<string, int>();
        for (var i = 0; i < header.Count; i++)
        {
            var name = header[i].Trim().ToLowerInvariant();
            if (name.Length > 0 && !columns.ContainsKey(name))
            {
                columns[name] = i;
            }
        }

        return RequiredColumns.All(columns.ContainsKey) ? columns : null;
    }

    private static List<ImportRow> ValidateRows(
        IReadOnlyList<CsvRecord> records,
        IReadOnlyDictionary<string, int> columns,
        List<ImportRowError> errors)
    {
        var rows = new List<ImportRow>();
        var emailLines = new Dictionary<string, int>();
        var numberLines = new Dictionary<string, int>();

        foreach (var record in records)
        {
            string Value(string column) =>
                columns.TryGetValue(column, out var index) && index < record.Fields.Count
                    ? record.Fields[index].Trim()
                    : string.Empty;

            var lastName = Value(LastNameColumn);
            var firstName = Value(FirstNameColumn);
            var patronymic = Value(PatronymicColumn);
            var email = IdentityNormalizer.Email(Value(EmailColumn));
            var studentNumber = IdentityNormalizer.StudentNumber(Value(StudentNumberColumn));
            var errorsBefore = errors.Count;

            if (lastName.Length == 0 || firstName.Length == 0 || email.Length == 0 || studentNumber.Length == 0)
            {
                errors.Add(new ImportRowError(record.LineNumber, "lastName, firstName, email and studentNumber are required."));
                continue;
            }

            if (lastName.Length > 100 || firstName.Length > 100 || patronymic.Length > 100)
            {
                errors.Add(new ImportRowError(record.LineNumber, "Names must be at most 100 characters."));
            }

            if (email.Length > 256 || !IsValidEmail(email))
            {
                errors.Add(new ImportRowError(record.LineNumber, $"\"{email}\" is not a valid email address."));
            }

            if (studentNumber.Length > 32)
            {
                errors.Add(new ImportRowError(record.LineNumber, "Student number must be at most 32 characters."));
            }

            if (emailLines.TryGetValue(email, out var firstEmailLine))
            {
                errors.Add(new ImportRowError(record.LineNumber, $"Email {email} already appears on line {firstEmailLine}."));
            }
            else
            {
                emailLines[email] = record.LineNumber;
            }

            if (numberLines.TryGetValue(studentNumber, out var firstNumberLine))
            {
                errors.Add(new ImportRowError(record.LineNumber, $"Student number {studentNumber} already appears on line {firstNumberLine}."));
            }
            else
            {
                numberLines[studentNumber] = record.LineNumber;
            }

            if (errors.Count == errorsBefore)
            {
                rows.Add(new ImportRow(
                    record.LineNumber,
                    lastName,
                    firstName,
                    patronymic.Length == 0 ? null : patronymic,
                    email,
                    studentNumber));
            }
        }

        return rows;
    }

    private static bool IsValidEmail(string email) =>
        MailAddress.TryCreate(email, out var address) && address.Address == email;

    private sealed record ImportRow(
        int Line,
        string LastName,
        string FirstName,
        string? Patronymic,
        string Email,
        string StudentNumber);
}
```

- [ ] **Step 6: Create `Controllers/StudentImportController.cs`**

```csharp
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/groups/{groupId:guid}/students/import")]
[Authorize(Roles = "Admin")]
public class StudentImportController : ControllerBase
{
    private readonly IStudentImportService _importService;

    public StudentImportController(IStudentImportService importService)
    {
        _importService = importService;
    }

    [HttpPost]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<IActionResult> Import(Guid groupId, IFormFile? file)
    {
        var outcome = await _importService.ImportAsync(groupId, file);
        if (outcome.Result is not null)
        {
            return Ok(outcome.Result);
        }

        return outcome.Error switch
        {
            OnboardingErrors.GroupNotFound => NotFound(new { message = outcome.Error }),
            OnboardingErrors.ImportConflict => Conflict(new { message = outcome.Error }),
            _ => BadRequest(new { message = outcome.Error, errors = outcome.RowErrors })
        };
    }
}
```

- [ ] **Step 7: Register the service in `Program.cs`**

After `builder.Services.AddScoped<IRegistrationService, RegistrationService>();` add:

```csharp
builder.Services.AddScoped<IStudentImportService, StudentImportService>();
```

- [ ] **Step 8: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `0 Warning(s) 0 Error(s)`; `No changes have been made to the model since the last migration.`

---

### Task 5: Backend endpoint verification

**Files:**
- Create: `.superpowers/checks/onboarding-check.mjs` (git-ignored; not committed)

**Interfaces:**
- Consumes: every endpoint from Tasks 2–4, the seed accounts `admin@diploma.local` / `Admin123!`, `teacher@diploma.local` / `Teacher123!`, and group `Seed Group A`.

In Git Bash, piping `curl` into `node -e` loses stdin; the check is a Node script using global `fetch`.

- [ ] **Step 1: Start the API**

From the repository root, in the background:

```bash
dotnet run --project backend/DiplomaTracker.Api --launch-profile http
```

Wait until `http://localhost:5000/api/registration` answers. The first start creates `DiplomaTrackerDb` from `InitialCreate` and seeds it.

- [ ] **Step 2: Create `.superpowers/checks/onboarding-check.mjs`**

```javascript
const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []

function check(name, actual, expected) {
  const ok = actual === expected
  results.push({ name, ok, actual, expected })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ` (expected ${expected})`}`)
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
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }
  if (form) body = form
  if (path === '/api/auth/login' || path === '/api/auth/claim') await paceAuth()
  const response = await fetch(API + path, { method, headers, body })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, data }
}

const login = (email, password) => call('POST', '/api/auth/login', { json: { email, password } })

function csvForm(content, name = 'students.csv') {
  const form = new FormData()
  const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content], { type: 'text/csv' })
  form.append('file', blob, name)
  return form
}

const admin = (await login('admin@diploma.local', 'Admin123!')).data.token
const groups = (await call('GET', '/api/groups', { token: admin })).data
const groupId = groups.find((g) => g.name === 'Seed Group A').id
const teachers = (await call('GET', '/api/teachers', { token: admin })).data
const teacherId = teachers.find((t) => t.email === 'teacher@diploma.local').id

// Registration switch
await call('PUT', '/api/registration', { token: admin, json: { open: false } })
check('01 registration anonymous GET', (await call('GET', '/api/registration')).status, 200)
check('02 claim while closed', (await call('POST', '/api/auth/claim', { json: { email: 'x@x.x', studentNumber: 'X', password: 'Password1!' } })).status, 403)
check('03 registration PUT as admin', (await call('PUT', '/api/registration', { token: admin, json: { open: true } })).status, 204)
check('04 registration now open', (await call('GET', '/api/registration')).data.open, true)

// Import
const emailA = `ivan.${stamp}@student.local`
const emailB = `olena.${stamp}@student.local`
const numberA = `kv${stamp}a`
const numberB = `KV${stamp}B`
const validCsv = `﻿lastName;firstName;patronymic;email;studentNumber\r\nІваненко;Іван;Петрович;${emailA};${numberA}\r\n"Коваль; молодша";Олена;;${emailB.toUpperCase()};${numberB}\r\n\r\n`
const firstImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv) })
check('05 import valid file', firstImport.status, 200)
check('06 import created count', firstImport.data.created, 2)
const secondImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv) })
check('07 re-import skipped count', secondImport.data.skipped.length, 2)
check('08 re-import created count', secondImport.data.created, 0)

const studentsBefore = (await call('GET', '/api/students', { token: admin })).data.length
const badCsv = `lastName,firstName,email,studentNumber\nA,B,not-an-email,N${stamp}1\nC,D,dup.${stamp}@x.local,N${stamp}2\nE,F,dup2.${stamp}@x.local,N${stamp}2\nG,H,teacher@diploma.local,N${stamp}3\nI,J,${emailA},OTHER${stamp}\n`
const badImport = await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(badCsv) })
check('09 import with row errors', badImport.status, 400)
check('10 row error count', badImport.data.errors.length, 4)
check('11 nothing written on error', (await call('GET', '/api/students', { token: admin })).data.length, studentsBefore)
check('12 import non-UTF-8', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(new Uint8Array([0x6c, 0x61, 0xc0, 0xc1, 0x0a])) })).status, 400)
check('13 import missing column', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm('lastName,firstName,email\nA,B,c@d.e\n') })).status, 400)
check('14 import unknown group', (await call('POST', '/api/groups/00000000-0000-0000-0000-000000000001/students/import', { token: admin, form: csvForm(validCsv) })).status, 404)
check('15 import wrong extension', (await call('POST', `/api/groups/${groupId}/students/import`, { token: admin, form: csvForm(validCsv, 'students.txt') })).status, 400)

// Claiming
check('16 unclaimed login refused', (await login(emailA, 'Password1!')).status, 401)
check('17 claim wrong number', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: 'WRONG', password: 'Password1!' } })).status, 400)
check('18 claim short password', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'short' } })).status, 400)
const claim = await call('POST', '/api/auth/claim', { json: { email: `  ${emailA.toUpperCase()} `, studentNumber: numberA.toLowerCase(), password: 'Password1!' } })
check('19 claim succeeds (normalised input)', claim.status, 200)
check('20 claim returns token', typeof claim.data.token, 'string')
check('21 claim twice refused', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'Password1!' } })).status, 400)
const studentToken = (await login(emailA, 'Password1!')).data.token
check('22 claimed student signs in', typeof studentToken, 'string')

// Change password
check('23 change password wrong current', (await call('PUT', '/api/auth/password', { token: studentToken, json: { currentPassword: 'nope-nope', newPassword: 'Password2!' } })).status, 400)
check('24 change password', (await call('PUT', '/api/auth/password', { token: studentToken, json: { currentPassword: 'Password1!', newPassword: 'Password2!' } })).status, 204)
check('25 sign in with new password', (await login(emailA, 'Password2!')).status, 200)

// Reset access
const importedA = (await call('GET', '/api/students', { token: admin })).data.find((s) => s.email === emailA)
check('26 student is claimed', importedA.isClaimed, true)
check('27 student number stored upper-case', importedA.studentNumber, numberA.toUpperCase())
check('28 reset access', (await call('POST', `/api/students/${importedA.id}/reset-access`, { token: admin })).status, 204)
check('29 reset account cannot sign in', (await login(emailA, 'Password2!')).status, 401)
check('30 reset account claims again', (await call('POST', '/api/auth/claim', { json: { email: emailA, studentNumber: numberA, password: 'Password3!' } })).status, 200)

// Teachers and manual students
check('31 teacher password too short', (await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'short' } })).status, 400)
check('32 teacher password set', (await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'Teacher456!' } })).status, 204)
check('33 teacher signs in with new password', (await login('teacher@diploma.local', 'Teacher456!')).status, 200)
await call('PUT', `/api/teachers/${teacherId}/password`, { token: admin, json: { password: 'Teacher123!' } })
check('34 manual student duplicate number', (await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual.${stamp}@x.local`, studentNumber: numberB, groupId } })).status, 409)
const manual = await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual.${stamp}@x.local`, studentNumber: `M${stamp}`, groupId } })
check('35 manual student without password', manual.status, 201)
check('36 manual student unclaimed', manual.data.isClaimed, false)
check('37 manual student unknown group', (await call('POST', '/api/students', { token: admin, json: { firstName: 'M', lastName: 'N', email: `manual2.${stamp}@x.local`, studentNumber: `M2${stamp}`, groupId: '00000000-0000-0000-0000-000000000001' } })).status, 400)

// Rate limit
authCalls.length = 0
let limited = false
for (let i = 0; i < 12; i++) {
  const response = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nobody@x.local', password: 'Password1!' }) })
  if (response.status === 429) limited = true
}
check('38 rate limit reached', limited, true)

await call('PUT', '/api/registration', { token: admin, json: { open: false } })
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
```

- [ ] **Step 3: Run the check**

```bash
node .superpowers/checks/onboarding-check.mjs
```

Expected: every line `PASS`, final line `38/38 checks passed`. The run pauses for the rate-limit window at least once; allow about three minutes.

- [ ] **Step 4: Stop the API**

```bash
taskkill //F //IM DiplomaTracker.Api.exe
netstat -ano | grep ":5000 .*LISTEN" || echo "port 5000 free"
```

Expected: `port 5000 free`.

---

### Task 6: Client contracts and API calls

**Files:**
- Replace: `frontend/diploma-tracker-web/src/api/apiClient.ts`
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`
- Create: `frontend/diploma-tracker-web/src/api/registrationApi.ts`
- Replace: `frontend/diploma-tracker-web/src/api/authApi.ts`
- Modify: `frontend/diploma-tracker-web/src/api/studentsApi.ts`
- Modify: `frontend/diploma-tracker-web/src/api/teachersApi.ts`
- Modify: `frontend/diploma-tracker-web/src/auth/context.ts`, `src/auth/AuthContext.tsx`

**Interfaces:**
- Produces:
  - `ApiError { status: number; message: string; payload: unknown }`.
  - Types `RegistrationStatus`, `ClaimAccountRequest`, `ChangePasswordRequest`, `StudentImportResult`, `ImportRowError`, updated `Student`, `Teacher`, `GroupStudent`, request types.
  - `getRegistrationStatus()`, `setRegistrationStatus(open)`, `claimAccount(request)`, `changePassword(request)`, `importStudents(groupId, file)`, `resetStudentAccess(id)`, `setTeacherPassword(id, password)`.
  - `AuthContextValue.completeSignIn(result: LoginResponse): CurrentUser`.

- [ ] **Step 1: Replace `src/api/apiClient.ts`**

```typescript
export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(status: number, message: string, payload: unknown = null) {
    super(message)
    this.status = status
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

export function isApiConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409
}

type ErrorPayload = {
  message?: string
  title?: string
  errors?: unknown
}

function firstValidationMessage(errors: unknown): string | undefined {
  if (!errors || typeof errors !== 'object' || Array.isArray(errors)) {
    return undefined
  }

  const first = Object.values(errors as Record<string, unknown>)[0]
  return Array.isArray(first) && typeof first[0] === 'string' ? first[0] : undefined
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ErrorPayload | null
    const fallback = response.status === 429
      ? 'Too many attempts. Wait a minute and try again.'
      : `Request failed with status ${response.status}`
    const message = payload?.message ?? firstValidationMessage(payload?.errors) ?? payload?.title ?? fallback
    throw new ApiError(response.status, message, payload)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
```

- [ ] **Step 2: Update `src/api/types.ts`**

Replace the `Teacher`, `CreateTeacherRequest` and `UpdateTeacherRequest` types with:

```typescript
export type Teacher = {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CreateTeacherRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  password: string
}

export type UpdateTeacherRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
}
```

Replace the `Student`, `CreateStudentRequest` and `UpdateStudentRequest` types with:

```typescript
export type Student = {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  email: string
  studentNumber: string
  role: 'Student'
  isActive: boolean
  isClaimed: boolean
  diplomaTopic: string | null
  groupId: string | null
  groupName: string | null
  supervisorId: string | null
  supervisorFirstName: string | null
  supervisorLastName: string | null
  supervisorEmail: string | null
  createdAt: string
  updatedAt: string
}

export type CreateStudentRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  studentNumber: string
  password?: string
  diplomaTopic?: string
  groupId: string
  supervisorId?: string
}

export type UpdateStudentRequest = {
  firstName: string
  lastName: string
  patronymic?: string
  email: string
  studentNumber: string
  diplomaTopic?: string
  groupId: string
  supervisorId?: string
}
```

In `GroupStudent`, replace `diplomaTopic: string` with `diplomaTopic: string | null`.

Append at the end of the file:

```typescript
export type RegistrationStatus = {
  open: boolean
}

export type ClaimAccountRequest = {
  email: string
  studentNumber: string
  password: string
}

export type ChangePasswordRequest = {
  currentPassword: string
  newPassword: string
}

export type SkippedImportRow = {
  line: number
  email: string
}

export type ImportRowError = {
  line: number
  message: string
}

export type StudentImportResult = {
  created: number
  skipped: SkippedImportRow[]
}
```

- [ ] **Step 3: Create `src/api/registrationApi.ts`**

```typescript
import { apiRequest } from './apiClient'
import type { RegistrationStatus } from './types'

export async function getRegistrationStatus(): Promise<RegistrationStatus> {
  return apiRequest<RegistrationStatus>('/api/registration')
}

export async function setRegistrationStatus(open: boolean): Promise<void> {
  await apiRequest<void>('/api/registration', {
    method: 'PUT',
    body: JSON.stringify({ open })
  })
}
```

- [ ] **Step 4: Replace `src/api/authApi.ts`**

```typescript
import { apiRequest } from './apiClient'
import type { ChangePasswordRequest, ClaimAccountRequest, CurrentUser, LoginRequest, LoginResponse } from './types'

export async function login(request: LoginRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}

export async function claimAccount(request: ClaimAccountRequest): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/claim', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function changePassword(request: ChangePasswordRequest): Promise<void> {
  await apiRequest<void>('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}
```

- [ ] **Step 5: Extend `src/api/studentsApi.ts`**

Change the type import to

```typescript
import type { CreateStudentRequest, Student, StudentImportResult, UpdateStudentRequest } from './types'
```

and append:

```typescript
export async function resetStudentAccess(id: string): Promise<void> {
  await apiRequest<void>(`/api/students/${id}/reset-access`, {
    method: 'POST'
  })
}

export async function importStudents(groupId: string, file: File): Promise<StudentImportResult> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<StudentImportResult>(`/api/groups/${groupId}/students/import`, {
    method: 'POST',
    body: form
  })
}
```

- [ ] **Step 6: Extend `src/api/teachersApi.ts`**

Append:

```typescript
export async function setTeacherPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/api/teachers/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password })
  })
}
```

- [ ] **Step 7: Add `completeSignIn` to the auth context**

Replace `src/auth/context.ts`:

```typescript
import { createContext } from 'react'
import type { CurrentUser, LoginResponse } from '../api/types'

export type AuthContextValue = {
  user: CurrentUser | null
  isInitializing: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  completeSignIn: (result: LoginResponse) => CurrentUser
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
```

In `src/auth/AuthContext.tsx`, replace the `value` memo with:

```typescript
  const value = useMemo<AuthContextValue>(() => ({
    user,
    isInitializing,
    login: async (email: string, password: string) => {
      const result = await loginRequest({ email, password })
      setToken(result.token)
      setUser(result.user)
      return result.user
    },
    completeSignIn: (result) => {
      setToken(result.token)
      setUser(result.user)
      return result.user
    },
    logout: () => {
      clearToken()
      setUser(null)
    }
  }), [user, isInitializing])
```

- [ ] **Step 8: Type-check**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
```

Expected: errors only in `StudentsPage.tsx`, `TeachersPage.tsx` and `GroupDetailsPage.tsx` (their forms and types are updated in Task 8). No errors in `src/api` or `src/auth`.

---

### Task 7: Claim, account and sign-in pages

**Files:**
- Create: `frontend/diploma-tracker-web/src/pages/ClaimAccountPage.tsx`
- Create: `frontend/diploma-tracker-web/src/pages/AccountPage.tsx`
- Replace: `frontend/diploma-tracker-web/src/pages/LoginPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/App.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/LayoutShell.tsx`
- Modify: `frontend/diploma-tracker-web/src/index.css`

**Interfaces:**
- Consumes: `getRegistrationStatus`, `claimAccount`, `changePassword`, `useAuth().completeSignIn`, `ApiError`.
- Produces: routes `/claim` (public) and `/account` (any signed-in role); navigation link *Account*.

- [ ] **Step 1: Create `src/pages/ClaimAccountPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { claimAccount } from '../api/authApi'
import { getRegistrationStatus } from '../api/registrationApi'
import { useAuth } from '../auth/useAuth'

const MIN_PASSWORD = 8
const MAX_PASSWORD = 128

export function ClaimAccountPage() {
  const { user, isInitializing, completeSignIn } = useAuth()
  const navigate = useNavigate()
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getRegistrationStatus()
      .then((status) => setRegistrationOpen(status.open))
      .catch(() => setRegistrationOpen(false))
  }, [])

  if (!isInitializing && user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      setError(`Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await claimAccount({ email: email.trim(), studentNumber: studentNumber.trim(), password })
      completeSignIn(result)
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-card">
        <h1>Claim your account</h1>
        {registrationOpen === null && <p>Loading...</p>}
        {registrationOpen === false && (
          <p>Registration is closed. Contact your department administrator.</p>
        )}
        {registrationOpen && (
          <form onSubmit={handleSubmit} className="login-form">
            <p className="field-hint">Use the email and student ID number from your department's list.</p>
            <label className="field-label" htmlFor="claim-email">Email</label>
            <input id="claim-email" type="email" className="field-input" maxLength={256} value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="field-label" htmlFor="claim-number">Student ID number</label>
            <input id="claim-number" className="field-input" maxLength={32} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required />
            <label className="field-label" htmlFor="claim-password">New password</label>
            <input id="claim-password" type="password" className="field-input" maxLength={MAX_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <label className="field-label" htmlFor="claim-confirm">Confirm password</label>
            <input id="claim-confirm" type="password" className="field-input" maxLength={MAX_PASSWORD} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Claiming...' : 'Claim account'}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        )}
        <p className="auth-link"><Link to="/login">Back to sign in</Link></p>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/AccountPage.tsx`**

```tsx
import { useState, type FormEvent } from 'react'
import { changePassword } from '../api/authApi'
import { useAuth } from '../auth/useAuth'

const MIN_PASSWORD = 8
const MAX_PASSWORD = 128

export function AccountPage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      setError(`Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password changed.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="account-page">
      <section className="page-card">
        <h1>Account</h1>
        {user && <p>{user.firstName} {user.lastName} · {user.email}</p>}
      </section>
      <section className="page-card">
        <h2>Change password</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-label" htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" className="field-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <label className="field-label" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" className="field-input" maxLength={MAX_PASSWORD} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" className="field-input" maxLength={MAX_PASSWORD} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Change password'}
          </button>
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/pages/LoginPage.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { getRegistrationStatus } from '../api/registrationApi'
import { useAuth } from '../auth/useAuth'

function routeByRole(role: 'Admin' | 'Teacher' | 'Student'): string {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

export function LoginPage() {
  const { user, login, isInitializing } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(false)

  useEffect(() => {
    getRegistrationStatus()
      .then((status) => setRegistrationOpen(status.open))
      .catch(() => setRegistrationOpen(false))
  }, [])

  if (!isInitializing && user) {
    return <Navigate to={routeByRole(user.role)} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const authenticatedUser = await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      const fallbackRoute = routeByRole(authenticatedUser.role)
      navigate(from && from !== '/login' ? from : fallbackRoute, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? err.message : 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-card">
        <h1>Diploma Tracker Login</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        {registrationOpen && (
          <p className="auth-link">First time here? <Link to="/claim">Claim your account</Link></p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Register the routes in `src/App.tsx`**

Add imports:

```tsx
import { ClaimAccountPage } from './pages/ClaimAccountPage'
import { AccountPage } from './pages/AccountPage'
```

After `<Route path="/login" element={<LoginPage />} />` add:

```tsx
      <Route path="/claim" element={<ClaimAccountPage />} />
```

After `<Route path="health" element={<HealthPage />} />` add:

```tsx
          <Route path="account" element={<AccountPage />} />
```

- [ ] **Step 5: Add the navigation link in `src/components/LayoutShell.tsx`**

Directly before the `Health` `NavLink` add:

```tsx
          {user && (
            <NavLink to="/account" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Account</NavLink>
          )}
```

- [ ] **Step 6: Append styles to `src/index.css`**

```css
.auth-link {
  margin-top: 16px;
  text-align: center;
}

.field-hint {
  margin: 0 0 8px;
  color: #5f6368;
  font-size: 13px;
}

.success-text {
  color: #188038;
}

.registration-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.badge-claimed {
  background: #e6f4ea;
  color: #188038;
}

.badge-unclaimed {
  background: #fef7e0;
  color: #b06000;
}

.import-grid {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 12px;
  align-items: center;
}

.import-result ul {
  margin: 8px 0 0;
  padding-left: 20px;
}
```

---

### Task 8: Student and teacher administration pages

**Files:**
- Replace: `frontend/diploma-tracker-web/src/pages/StudentsPage.tsx`
- Replace: `frontend/diploma-tracker-web/src/pages/TeachersPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/GroupDetailsPage.tsx`

**Interfaces:**
- Consumes: Task 6 API functions and types; existing `getGroups`, `getTeachers`, `ErrorModal`.

- [ ] **Step 1: Replace `src/pages/StudentsPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { getGroups } from '../api/groupsApi'
import { getRegistrationStatus, setRegistrationStatus } from '../api/registrationApi'
import { createStudent, deactivateStudent, getStudents, importStudents, resetStudentAccess, updateStudent } from '../api/studentsApi'
import { getTeachers } from '../api/teachersApi'
import type { Group, ImportRowError, Student, StudentImportResult, Teacher } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type StudentFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  studentNumber: string
  password: string
  diplomaTopic: string
  groupId: string
  supervisorId: string
}

const emptyForm: StudentFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  studentNumber: '',
  password: '',
  diplomaTopic: '',
  groupId: '',
  supervisorId: ''
}

const CSV_TEMPLATE = '﻿lastName;firstName;patronymic;email;studentNumber\r\n'

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function readRowErrors(error: unknown): ImportRowError[] {
  if (!(error instanceof ApiError)) {
    return []
  }

  const payload = error.payload as { errors?: unknown } | null
  return Array.isArray(payload?.errors) ? payload.errors as ImportRowError[] : []
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'students-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const [importGroupId, setImportGroupId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null)
  const [importErrors, setImportErrors] = useState<ImportRowError[]>([])
  const [importMessage, setImportMessage] = useState('')

  const [createForm, setCreateForm] = useState<StudentFormState>(emptyForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<StudentFormState>(emptyForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null)

  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [students])
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])

  const loadData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [studentsData, teachersData, groupsData, registration] = await Promise.all([getStudents(), getTeachers(), getGroups(), getRegistrationStatus()])
      setStudents(studentsData)
      setTeachers(teachersData)
      setGroups(groupsData)
      setRegistrationOpen(registration.open)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const toggleRegistration = async () => {
    setIsTogglingRegistration(true)
    try {
      await setRegistrationStatus(!registrationOpen)
      setRegistrationOpen(!registrationOpen)
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!importGroupId || !importFile) {
      return
    }

    setIsImporting(true)
    setImportResult(null)
    setImportErrors([])
    setImportMessage('')
    try {
      const result = await importStudents(importGroupId, importFile)
      setImportResult(result)
      setImportFile(null)
      setImportInputKey((key) => key + 1)
      await loadData()
    } catch (err) {
      setImportMessage((err as Error).message)
      setImportErrors(readRowErrors(err))
    } finally {
      setIsImporting(false)
    }
  }

  const toRequest = (form: StudentFormState) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    patronymic: optional(form.patronymic),
    email: form.email.trim(),
    studentNumber: form.studentNumber.trim(),
    diplomaTopic: optional(form.diplomaTopic),
    groupId: form.groupId,
    supervisorId: optional(form.supervisorId)
  })

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    try {
      await createStudent({ ...toRequest(createForm), password: optional(createForm.password) })
      setCreateForm(emptyForm)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      patronymic: student.patronymic ?? '',
      email: student.email,
      studentNumber: student.studentNumber,
      password: '',
      diplomaTopic: student.diplomaTopic ?? '',
      groupId: student.groupId ?? '',
      supervisorId: student.supervisorId ?? ''
    })
  }

  const cancelEdit = () => {
    setEditingStudentId(null)
    setEditForm(emptyForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingStudentId) {
      return
    }

    setIsSavingEdit(true)
    try {
      await updateStudent(editingStudentId, toRequest(editForm))
      cancelEdit()
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivate = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this student?')) {
      return
    }

    setBusyStudentId(studentId)
    try {
      await deactivateStudent(studentId)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setBusyStudentId(null)
    }
  }

  const handleResetAccess = async (student: Student) => {
    if (!window.confirm(`Reset access for ${student.firstName} ${student.lastName}? They will need to claim the account again.`)) {
      return
    }

    setBusyStudentId(student.id)
    try {
      await resetStudentAccess(student.id)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setBusyStudentId(null)
    }
  }

  const renderFormFields = (form: StudentFormState, setForm: React.Dispatch<React.SetStateAction<StudentFormState>>, includePassword: boolean) => (
    <div className="student-form-grid">
      <input className="field-input" placeholder="Last name" maxLength={100} value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
      <input className="field-input" placeholder="First name" maxLength={100} value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
      <input className="field-input" placeholder="Patronymic (optional)" maxLength={100} value={form.patronymic} onChange={(e) => setForm((prev) => ({ ...prev, patronymic: e.target.value }))} />
      <input className="field-input" placeholder="Email" type="email" maxLength={256} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
      <input className="field-input" placeholder="Student ID number" maxLength={32} value={form.studentNumber} onChange={(e) => setForm((prev) => ({ ...prev, studentNumber: e.target.value }))} required />
      {includePassword && (
        <input className="field-input" placeholder="Password (optional — leave empty to let the student claim)" type="password" maxLength={128} value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
      )}
      <input className="field-input" placeholder="Diploma topic (optional)" maxLength={500} value={form.diplomaTopic} onChange={(e) => setForm((prev) => ({ ...prev, diplomaTopic: e.target.value }))} />
      <select className="field-input" value={form.groupId} onChange={(e) => setForm((prev) => ({ ...prev, groupId: e.target.value }))} required>
        <option value="">Select group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
        ))}
      </select>
      <select className="field-input" value={form.supervisorId} onChange={(e) => setForm((prev) => ({ ...prev, supervisorId: e.target.value }))}>
        <option value="">No supervisor</option>
        {activeTeachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="students-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Manage Students</h1>
        <div className="registration-row">
          <span>Registration is <strong>{registrationOpen ? 'Open' : 'Closed'}</strong></span>
          <button className="secondary-button" type="button" onClick={toggleRegistration} disabled={isTogglingRegistration || isLoading}>
            {registrationOpen ? 'Close registration' : 'Open registration'}
          </button>
        </div>
      </section>

      <section className="page-card">
        <h2>Import students</h2>
        <form onSubmit={handleImport}>
          <div className="import-grid">
            <select className="field-input" value={importGroupId} onChange={(e) => setImportGroupId(e.target.value)} required>
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
              ))}
            </select>
            <input key={importInputKey} className="field-input" type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} required />
            <button className="primary-button" type="submit" disabled={isImporting || !importGroupId || !importFile}>{isImporting ? 'Importing...' : 'Import'}</button>
            <button className="secondary-button" type="button" onClick={downloadTemplate}>Download template</button>
          </div>
        </form>
        <p className="field-hint">CSV UTF-8 with columns lastName, firstName, patronymic (optional), email, studentNumber.</p>
        {importResult && (
          <div className="import-result">
            <p className="success-text">Created {importResult.created} student(s).</p>
            {importResult.skipped.length > 0 && (
              <>
                <p>Already in the system (skipped):</p>
                <ul>
                  {importResult.skipped.map((row) => <li key={row.line}>Line {row.line}: {row.email}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        {importMessage && (
          <div className="import-result">
            <p className="error-text">{importMessage}</p>
            {importErrors.length > 0 && (
              <ul>
                {importErrors.map((rowError, index) => <li key={`${rowError.line}-${index}`}>Line {rowError.line}: {rowError.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="page-card">
        <h2>Add student</h2>
        <form className="student-form" onSubmit={handleCreate}>
          {renderFormFields(createForm, setCreateForm, true)}
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Student'}</button>
        </form>
      </section>

      {editingStudentId && (
        <section className="page-card">
          <h2>Edit Student</h2>
          <form className="student-form" onSubmit={handleSaveEdit}>
            {renderFormFields(editForm, setEditForm, false)}
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Students</h2>
        {isLoading && <p>Loading students...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedStudents.length === 0 && <p>No students found.</p>}
        {!isLoading && !error && sortedStudents.length > 0 && (
          <div className="list-grid">
            {sortedStudents.map((student) => (
              <article className="entity-card" key={student.id}>
                <h3>{student.lastName} {student.firstName} {student.patronymic ?? ''}</h3>
                <p>{student.email}</p>
                <p><strong>Student ID:</strong> {student.studentNumber}</p>
                <p>
                  <span className={student.isClaimed ? 'badge badge-claimed' : 'badge badge-unclaimed'}>{student.isClaimed ? 'Claimed' : 'Not claimed'}</span>
                </p>
                <p><strong>Group:</strong> {student.groupName ?? 'Not assigned'}</p>
                <p><strong>Diploma topic:</strong> {student.diplomaTopic ?? 'Not set'}</p>
                <p><strong>Supervisor:</strong> {student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorLastName} ${student.supervisorFirstName}` : 'Not assigned'}</p>
                <p><strong>Status:</strong> <span className={student.isActive ? 'status-active' : 'status-inactive'}>{student.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(student)} disabled={!student.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => handleResetAccess(student)} disabled={!student.isActive || !student.isClaimed || busyStudentId === student.id}>Reset access</button>
                  <button className="secondary-button" onClick={() => handleDeactivate(student.id)} disabled={!student.isActive || busyStudentId === student.id}>Deactivate</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Replace `src/pages/TeachersPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { createTeacher, deactivateTeacher, getTeachers, setTeacherPassword, updateTeacher } from '../api/teachersApi'
import type { Teacher } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type TeacherFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  password: string
}

const emptyForm: TeacherFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  password: ''
}

const MIN_PASSWORD = 8
const MAX_PASSWORD = 128

function optional(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

export function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<TeacherFormState>(emptyForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TeacherFormState>(emptyForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deactivatingTeacherId, setDeactivatingTeacherId] = useState<string | null>(null)
  const [passwordTeacher, setPasswordTeacher] = useState<Teacher | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [teachers])

  const loadTeachers = async () => {
    setIsLoading(true)
    setError('')
    try {
      setTeachers(await getTeachers())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTeachers()
  }, [])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createForm.password.length < MIN_PASSWORD || createForm.password.length > MAX_PASSWORD) {
      setModalMessage(`Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`)
      return
    }

    setIsCreating(true)
    try {
      await createTeacher({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        patronymic: optional(createForm.patronymic),
        email: createForm.email.trim(),
        password: createForm.password
      })
      setCreateForm(emptyForm)
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id)
    setEditForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      patronymic: teacher.patronymic ?? '',
      email: teacher.email,
      password: ''
    })
  }

  const cancelEdit = () => {
    setEditingTeacherId(null)
    setEditForm(emptyForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTeacherId) {
      return
    }

    setIsSavingEdit(true)
    try {
      await updateTeacher(editingTeacherId, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        patronymic: optional(editForm.patronymic),
        email: editForm.email.trim()
      })
      cancelEdit()
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivate = async (teacherId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this teacher?')) {
      return
    }

    setDeactivatingTeacherId(teacherId)
    try {
      await deactivateTeacher(teacherId)
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setDeactivatingTeacherId(null)
    }
  }

  const openPasswordModal = (teacher: Teacher) => {
    setPasswordTeacher(teacher)
    setNewPassword('')
    setPasswordError('')
  }

  const handleSetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordTeacher) {
      return
    }

    if (newPassword.length < MIN_PASSWORD || newPassword.length > MAX_PASSWORD) {
      setPasswordError(`Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`)
      return
    }

    setIsSavingPassword(true)
    try {
      await setTeacherPassword(passwordTeacher.id, newPassword)
      setPasswordTeacher(null)
    } catch (err) {
      setPasswordError((err as Error).message)
    } finally {
      setIsSavingPassword(false)
    }
  }

  const renderNameFields = (form: TeacherFormState, setForm: React.Dispatch<React.SetStateAction<TeacherFormState>>) => (
    <>
      <input className="field-input" placeholder="Last name" maxLength={100} value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
      <input className="field-input" placeholder="First name" maxLength={100} value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
      <input className="field-input" placeholder="Patronymic (optional)" maxLength={100} value={form.patronymic} onChange={(e) => setForm((prev) => ({ ...prev, patronymic: e.target.value }))} />
      <input className="field-input" placeholder="Email" type="email" maxLength={256} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
    </>
  )

  return (
    <div className="teachers-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      {passwordTeacher && (
        <div className="modal-backdrop" onClick={() => setPasswordTeacher(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Set password for {passwordTeacher.lastName} {passwordTeacher.firstName}</h3>
            <form onSubmit={handleSetPassword} className="login-form">
              <input className="field-input" type="password" placeholder="New password" maxLength={MAX_PASSWORD} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
              {passwordError && <p className="error-text">{passwordError}</p>}
              <div className="actions-row">
                <button className="primary-button" type="submit" disabled={isSavingPassword}>{isSavingPassword ? 'Saving...' : 'Set password'}</button>
                <button className="secondary-button" type="button" onClick={() => setPasswordTeacher(null)} disabled={isSavingPassword}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="page-card">
        <h1>Manage Teachers</h1>
        <form className="teacher-form" onSubmit={handleCreate}>
          <div className="teacher-form-grid">
            {renderNameFields(createForm, setCreateForm)}
            <input className="field-input" placeholder="Password" type="password" maxLength={MAX_PASSWORD} value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} required />
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Teacher'}</button>
        </form>
      </section>

      {editingTeacherId && (
        <section className="page-card">
          <h2>Edit Teacher</h2>
          <form className="teacher-form" onSubmit={handleSaveEdit}>
            <div className="teacher-form-grid">
              {renderNameFields(editForm, setEditForm)}
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Teachers</h2>
        {isLoading && <p>Loading teachers...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedTeachers.length === 0 && <p>No teachers found.</p>}
        {!isLoading && !error && sortedTeachers.length > 0 && (
          <div className="list-grid">
            {sortedTeachers.map((teacher) => (
              <article className="entity-card" key={teacher.id}>
                <h3>{teacher.lastName} {teacher.firstName} {teacher.patronymic ?? ''}</h3>
                <p>{teacher.email}</p>
                <p><strong>Status:</strong> <span className={teacher.isActive ? 'status-active' : 'status-inactive'}>{teacher.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(teacher)} disabled={!teacher.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => openPasswordModal(teacher)} disabled={!teacher.isActive}>Set password</button>
                  <button className="secondary-button" onClick={() => handleDeactivate(teacher.id)} disabled={!teacher.isActive || deactivatingTeacherId === teacher.id}>{deactivatingTeacherId === teacher.id ? 'Deactivating...' : 'Deactivate'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Handle the optional topic in `src/pages/GroupDetailsPage.tsx`**

Replace

```tsx
<p><strong>Diploma topic:</strong> {student.diplomaTopic}</p>
```

with

```tsx
<p><strong>Diploma topic:</strong> {student.diplomaTopic ?? 'Not set'}</p>
```

- [ ] **Step 4: Frontend gates**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `tsc` prints nothing; lint `0 errors` and no warnings beyond the two-warning `react-hooks/exhaustive-deps` baseline in `GroupDetailsPage.tsx` and `GroupsPage.tsx` (the rewritten pages keep the existing effect pattern); build `✓ built in`.

---

### Task 9: Onboarding verification and commit

**Files:**
- Modify: `docs/superpowers/test-backlog.md`
- Modify: `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: Backend gates**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
ls DiplomaTracker.Api/Migrations
```

Expected: `0 Error(s)` twice; `No changes have been made to the model since the last migration.`; exactly three migration files.

- [ ] **Step 2: Frontend gates**

```bash
cd ../frontend/diploma-tracker-web
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `0 errors`; `✓ built in`.

- [ ] **Step 3: Append the onboarding section to `docs/superpowers/test-backlog.md`**

```markdown

## User onboarding

### Service level, InMemory
- `SimpleCsv`: delimiter detection (`;` vs `,`, delimiters inside quotes ignored); quoted fields with doubled quotes, quoted line breaks, CRLF and LF; line numbers of records after a quoted line break; trailing record without a newline.
- `StudentImportService`: unknown group; missing file; wrong extension; file over 1 MB; invalid UTF-8; BOM stripped; header missing a required column; more than 500 rows; each row rule (missing value, invalid email, over-length values, duplicate email and duplicate number within the file, teacher/admin email, email with different number, number with different email); exact match skipped; all-or-nothing on any row error; created students are unclaimed, active, in the chosen group, with normalised email and number and optional patronymic.
- `AuthService.ClaimAccountAsync`: closed registration; password policy bounds (7, 8, 128, 129 characters); normalised email and number; wrong number, unknown email, deactivated student and already-claimed account all return the same mismatch error; success returns a token and sets the hash.
- `AuthService.LoginAsync`: unclaimed account refused; email normalised.
- `AuthService.ChangePasswordAsync`: wrong current password; policy violation; success.
- `StudentService`: create without password is unclaimed; create with short password refused; duplicate email and duplicate student number; unknown group and unknown/inactive supervisor; update clears supervisor when omitted; `ResetAccessAsync` clears the hash; `IsClaimed` mapping.
- `TeacherService`: patronymic trimmed/nullable; create password policy; `SetPasswordAsync` unknown teacher and policy.
- `RegistrationService`: default closed from seeded row; set and read back.

### HTTP level
- `GET /api/registration` anonymous 200; `PUT` requires Admin (401/403).
- `POST /api/auth/claim` 403 closed, 400 mismatch, 200 success; login and claim return 429 after 10 requests per minute from one IP.
- `POST /api/groups/{id}/students/import` requires Admin; 404 unknown group; 400 body shape `{ message, errors: [{ line, message }] }`; 200 body shape `{ created, skipped: [{ line, email }] }`.
- `POST /api/students/{id}/reset-access` 204/404; `PUT /api/teachers/{id}/password` 204/400/404; `PUT /api/auth/password` 204/400/401.

### SQL Server integration
- Unique index on `StudentProfiles.StudentNumber`; concurrent import conflict returns 409 and writes nothing.
- `PlatformSettings` seed row present after migration.

### Frontend
- Claim page: closed notice, password mismatch and length messages, success signs in.
- Login page shows the claim link only when registration is open; 429 message.
- Students page: registration toggle, import success summary and row-error list, template download content, reset access confirmation.
- Teachers page: set-password modal validation.
```

- [ ] **Step 4: Update `docs/superpowers/PROJECT_MEMORY.md`**

In the status table replace the `User onboarding` row with:

```markdown
| User onboarding | Done — commit `Implement user onboarding` | `2026-09-16-user-onboarding-design.md` |
```

Append to the `## Log` section a line starting with today's date in `YYYY-MM-DD` form:

```markdown
- YYYY-MM-DD — User onboarding implemented: CSV import, account claiming, registration switch, password management.
```

Add to `## Gotchas`:

```markdown
- **Auth endpoints are rate-limited** (10 requests per minute per IP on `login` and `claim`). Scripted checks that sign in repeatedly must pace their calls or they receive 429.
- **Seed student number** is `SEED-0001`; imported and claimable test students need their own unique numbers.
```

- [ ] **Step 5: Confirm nothing secret is staged**

```bash
cd "$(git rev-parse --show-toplevel)"
grep -n '"Secret": "[^"]\|Password=[^;"]' backend/DiplomaTracker.Api/appsettings.json backend/DiplomaTracker.Api/appsettings.Development.json; echo "exit=$?"
```

Expected: no matching lines and `exit=1`.

- [ ] **Step 6: Stage and commit**

```bash
git add backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src docs/superpowers/test-backlog.md docs/superpowers/PROJECT_MEMORY.md
git diff --cached --name-only | grep -E '/bin/|/obj/|\.user$|PROJECT_PAPER|README|appsettings'; echo "exit=$?"
git commit -m "Implement user onboarding"
git log --oneline -1
```

Expected: the grep prints nothing and `exit=1`; the log's first line ends with `Implement user onboarding`.
