# Platform Foundations and Academic Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver phases 1 and 2 of the system design — a securely configured, testable platform and the Faculty → Department → Group academic hierarchy with its administration UI.

**Architecture:** ASP.NET Core 8 Web API layered as controllers → services (behind interfaces) → EF Core → SQL Server, with a React 18 + TypeScript + Vite client. Configuration comes from user-secrets locally and environment variables when hosted, validated at startup. New domain services follow the existing `(T? result, string? error)` tuple pattern, with error messages held in shared constants.

**Tech Stack:** .NET 8 (`net8.0`), EF Core 8.0.8 (SQL Server provider, InMemory for tests), xUnit 2.9, `dotnet-ef` 8.0.8 local tool, React 18.3, React Router 6, TypeScript 5.8, Vite 5.4, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-09-15-diploma-tracker-system-design.md` — sections 3, 5 and 6.

## Global Constraints

- Backend target framework stays `net8.0`; all `Microsoft.EntityFrameworkCore.*` packages stay on `8.0.8`.
- All primary keys are `Guid`.
- No secret is ever written to a committed file. `appsettings.json` holds structure and non-sensitive defaults only.
- JWT signing secret minimum: **32 bytes**. Bootstrap administrator password minimum: **12 characters**.
- Read-only queries use `AsNoTracking()`.
- Foreign keys `Department → Faculty` and `Group → Department` use `DeleteBehavior.Restrict`.
- Uniqueness: `Faculty.Name`, `Faculty.ShortName`, `(Department.FacultyId, Department.Name)`, `(Department.FacultyId, Department.ShortName)`.
- `StudentTask.Status` is the `StudentTaskStatus` enum (`Pending`, `Submitted`, `Approved`, `Returned`) persisted as its string name.
- **Commits: exactly one per phase**, title line only, no body, no `Co-Authored-By` trailer. Do **not** commit after individual tasks — only in the final task of each phase.
- Never stage `PROJECT_PAPER.md` or `frontend/diploma-tracker-web/README.md`.
- Backend commands run from `backend/`; frontend commands run from `frontend/diploma-tracker-web/`.

## File Map

**Phase 1 — Platform foundations**

| Path | Responsibility |
|---|---|
| `.gitignore` | Stop ignoring `/.config` so the `dotnet-ef` tool manifest is versioned |
| `backend/DiplomaTracker.Api/appsettings.json` | Non-secret structure and defaults |
| `backend/DiplomaTracker.Api/appsettings.Development.json` | Local CORS origin |
| `backend/DiplomaTracker.Api/Models/CorsSettings.cs` | Bound `Cors` section |
| `backend/DiplomaTracker.Api/Models/BootstrapSettings.cs` | Bound `Bootstrap` section |
| `backend/DiplomaTracker.Api/Configuration/StartupValidation.cs` | Fail-fast validation of JWT and CORS settings |
| `backend/DiplomaTracker.Api/Services/AdminBootstrapper.cs` | One-time hosted administrator creation |
| `backend/DiplomaTracker.Api/Services/DbSeeder.cs` | Development dataset |
| `backend/DiplomaTracker.Api/Program.cs` | Composition root |
| `backend/DiplomaTracker.Api/Entities/StudentTaskStatus.cs` | Workflow step status enum |
| `backend/DiplomaTracker.Api/Services/*Service.cs` | Untracked read-only queries |
| `backend/DiplomaTracker.Api.Tests/Support/TestDbContextFactory.cs` | Isolated InMemory contexts |
| `frontend/diploma-tracker-web/.env.development` | Local API base URL |
| `frontend/diploma-tracker-web/src/api/apiClient.ts` | Env-based base URL, error parsing, `isApiConflict` |
| `frontend/diploma-tracker-web/src/auth/context.ts`, `useAuth.ts` | Auth context object and hook, split from the provider |

**Phase 2 — Academic structure**

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/Faculty.cs`, `Department.cs`, `Group.cs` | Hierarchy entities |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs` | Mapping, keys, indexes, delete behaviour |
| `backend/DiplomaTracker.Api/Migrations/*` | Single `InitialCreate` migration |
| `backend/DiplomaTracker.Api/Services/AcademicStructureErrors.cs` | Shared error message constants |
| `backend/DiplomaTracker.Api/DTOs/Faculties/*`, `DTOs/Departments/*` | Request and response contracts |
| `backend/DiplomaTracker.Api/Interfaces/IFacultyService.cs`, `IDepartmentService.cs` | Service contracts |
| `backend/DiplomaTracker.Api/Services/FacultyService.cs`, `DepartmentService.cs` | Business rules |
| `backend/DiplomaTracker.Api/Controllers/FacultiesController.cs`, `DepartmentsController.cs` | HTTP surface |
| `backend/DiplomaTracker.Api/Services/GroupService.cs`, `DTOs/Groups/*` | Required department on groups |
| `backend/DiplomaTracker.Api.Tests/Support/TestData.cs` | Test entity builders |
| `frontend/diploma-tracker-web/src/api/facultiesApi.ts`, `departmentsApi.ts`, `types.ts` | Client contracts |
| `frontend/diploma-tracker-web/src/pages/FacultiesPage.tsx` | Faculty and department administration |
| `frontend/diploma-tracker-web/src/pages/GroupsPage.tsx` | Department selector on groups |

---

# Phase 1 — Platform foundations

### Task 1: Secrets and repository configuration

**Files:**
- Modify: `.gitignore`
- Modify: `backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj` (via `dotnet user-secrets init`)
- Modify: `backend/DiplomaTracker.Api/appsettings.json`
- Modify: `backend/DiplomaTracker.Api/appsettings.Development.json`

**Interfaces:**
- Produces: configuration sections `Jwt`, `Cors:AllowedOrigins` (string array), `Bootstrap:AdminEmail`, `Bootstrap:AdminPassword`, consumed by Tasks 2–4.

The working-tree `appsettings.json` currently holds a real connection string and JWT secret. Move the connection string into user-secrets **before** overwriting the file, then generate a fresh JWT secret rather than reusing the exposed one.

- [ ] **Step 1: Initialise user-secrets and move the connection string**

```bash
cd backend
dotnet user-secrets init --project DiplomaTracker.Api
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "$(node -e "console.log(require('./DiplomaTracker.Api/appsettings.json').ConnectionStrings.DefaultConnection)")" --project DiplomaTracker.Api
```

Expected: `Set UserSecretsId to '<guid>'` then `Successfully saved ConnectionStrings:DefaultConnection to the secret store.`

- [ ] **Step 2: Generate a new JWT secret**

```bash
dotnet user-secrets set "Jwt:Secret" "$(openssl rand -base64 48)" --project DiplomaTracker.Api
dotnet user-secrets list --project DiplomaTracker.Api
```

Expected: the list shows `ConnectionStrings:DefaultConnection = Server=localhost;...` and `Jwt:Secret = <64 base64 characters>`.

- [ ] **Step 3: Replace `backend/DiplomaTracker.Api/appsettings.json`**

```json
{
  "ConnectionStrings": {
    "DefaultConnection": ""
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "Jwt": {
    "Issuer": "DiplomaTracker.Api",
    "Audience": "DiplomaTracker.Web",
    "Secret": "",
    "ExpiresInMinutes": 60
  },
  "Cors": {
    "AllowedOrigins": []
  },
  "Bootstrap": {
    "AdminEmail": "",
    "AdminPassword": ""
  },
  "AllowedHosts": "*"
}
```

- [ ] **Step 4: Replace `backend/DiplomaTracker.Api/appsettings.Development.json`**

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "Cors": {
    "AllowedOrigins": [ "http://localhost:5173" ]
  }
}
```

- [ ] **Step 5: Version the tool manifest**

In the root `.gitignore`, delete the line `/.config`. Leave every other line unchanged.

- [ ] **Step 6: Verify**

```bash
cd backend
dotnet build --nologo -v q
cd ..
git check-ignore .config/dotnet-tools.json; echo "exit=$?"
grep -c "YourStrongTestPassword\|ThisIsAStrongDevelopmentSecret" backend/DiplomaTracker.Api/appsettings.json
```

Expected: `Build succeeded`, `exit=1` (the manifest is no longer ignored), and `0` matches for the old secrets.

---

### Task 2: Startup configuration validation

**Files:**
- Create: `backend/DiplomaTracker.Api/Models/CorsSettings.cs`
- Create: `backend/DiplomaTracker.Api/Models/BootstrapSettings.cs`
- Create: `backend/DiplomaTracker.Api/Configuration/StartupValidation.cs`
- Test: `backend/DiplomaTracker.Api.Tests/Configuration/StartupValidationTests.cs`

**Interfaces:**
- Consumes: `DiplomaTracker.Api.Models.JwtSettings` (`Issuer`, `Audience`, `Secret`, `ExpiresInMinutes`).
- Produces:
  - `class CorsSettings { string[] AllowedOrigins }`
  - `class BootstrapSettings { string AdminEmail; string AdminPassword }`
  - `static class StartupValidation { const int MinimumJwtSecretBytes = 32; static void ValidateJwtSettings(JwtSettings); static void ValidateCorsSettings(CorsSettings); }` — both throw `InvalidOperationException`.

- [ ] **Step 1: Write the failing tests**

Create `backend/DiplomaTracker.Api.Tests/Configuration/StartupValidationTests.cs`:

```csharp
using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Tests.Configuration;

public class StartupValidationTests
{
    [Fact]
    public void ValidateJwtSettings_WithValidSettings_DoesNotThrow()
    {
        var exception = Record.Exception(() => StartupValidation.ValidateJwtSettings(ValidJwtSettings()));

        Assert.Null(exception);
    }

    [Theory]
    [InlineData("")]
    [InlineData("only-thirty-one-bytes-long-key!")]
    public void ValidateJwtSettings_WithSecretShorterThan32Bytes_Throws(string secret)
    {
        var settings = ValidJwtSettings();
        settings.Secret = secret;

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:Secret", exception.Message);
    }

    [Fact]
    public void ValidateJwtSettings_WithMissingIssuer_Throws()
    {
        var settings = ValidJwtSettings();
        settings.Issuer = " ";

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:Issuer", exception.Message);
    }

    [Fact]
    public void ValidateJwtSettings_WithNonPositiveExpiry_Throws()
    {
        var settings = ValidJwtSettings();
        settings.ExpiresInMinutes = 0;

        var exception = Assert.Throws<InvalidOperationException>(() => StartupValidation.ValidateJwtSettings(settings));

        Assert.Contains("Jwt:ExpiresInMinutes", exception.Message);
    }

    [Fact]
    public void ValidateCorsSettings_WithNoOrigins_Throws()
    {
        var exception = Assert.Throws<InvalidOperationException>(
            () => StartupValidation.ValidateCorsSettings(new CorsSettings()));

        Assert.Contains("Cors:AllowedOrigins", exception.Message);
    }

    [Fact]
    public void ValidateCorsSettings_WithOrigin_DoesNotThrow()
    {
        var settings = new CorsSettings { AllowedOrigins = ["http://localhost:5173"] };

        var exception = Record.Exception(() => StartupValidation.ValidateCorsSettings(settings));

        Assert.Null(exception);
    }

    private static JwtSettings ValidJwtSettings() => new()
    {
        Issuer = "DiplomaTracker.Api",
        Audience = "DiplomaTracker.Web",
        Secret = new string('k', StartupValidation.MinimumJwtSecretBytes),
        ExpiresInMinutes = 60
    };
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~StartupValidationTests"
```

Expected: build FAILS with `error CS0234: The type or namespace name 'Configuration' does not exist in the namespace 'DiplomaTracker.Api'`.

- [ ] **Step 3: Create the settings classes**

`backend/DiplomaTracker.Api/Models/CorsSettings.cs`:

```csharp
namespace DiplomaTracker.Api.Models;

public class CorsSettings
{
    public string[] AllowedOrigins { get; set; } = [];
}
```

`backend/DiplomaTracker.Api/Models/BootstrapSettings.cs`:

```csharp
namespace DiplomaTracker.Api.Models;

public class BootstrapSettings
{
    public string AdminEmail { get; set; } = string.Empty;
    public string AdminPassword { get; set; } = string.Empty;
}
```

- [ ] **Step 4: Implement the validator**

`backend/DiplomaTracker.Api/Configuration/StartupValidation.cs`:

```csharp
using System.Text;
using DiplomaTracker.Api.Models;

namespace DiplomaTracker.Api.Configuration;

public static class StartupValidation
{
    public const int MinimumJwtSecretBytes = 32;

    public static void ValidateJwtSettings(JwtSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.Issuer) || string.IsNullOrWhiteSpace(settings.Audience))
        {
            throw new InvalidOperationException("Jwt:Issuer and Jwt:Audience must be configured.");
        }

        if (Encoding.UTF8.GetByteCount(settings.Secret) < MinimumJwtSecretBytes)
        {
            throw new InvalidOperationException(
                $"Jwt:Secret must be at least {MinimumJwtSecretBytes} bytes. " +
                "Set it with user-secrets locally or the Jwt__Secret environment variable when hosted.");
        }

        if (settings.ExpiresInMinutes <= 0)
        {
            throw new InvalidOperationException("Jwt:ExpiresInMinutes must be greater than zero.");
        }
    }

    public static void ValidateCorsSettings(CorsSettings settings)
    {
        if (settings.AllowedOrigins.Length == 0 || settings.AllowedOrigins.Any(string.IsNullOrWhiteSpace))
        {
            throw new InvalidOperationException(
                "Cors:AllowedOrigins must list at least one origin. Set Cors__AllowedOrigins__0 when hosted.");
        }
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~StartupValidationTests"
```

Expected: `Passed! - Failed: 0, Passed: 7`.

---

### Task 3: Environment bootstrap

**Files:**
- Create: `backend/DiplomaTracker.Api.Tests/Support/TestDbContextFactory.cs`
- Create: `backend/DiplomaTracker.Api/Services/AdminBootstrapper.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs` (full replacement)
- Test: `backend/DiplomaTracker.Api.Tests/Services/AdminBootstrapperTests.cs`

**Interfaces:**
- Consumes: `BootstrapSettings` (Task 2); `IPasswordHasher.HashPassword(string) : string`; `AppDbContext.Users`.
- Produces:
  - `static class TestDbContextFactory { static AppDbContext Create(); }` — used by every later test class.
  - `static class AdminBootstrapper { const int MinimumPasswordLength = 12; static Task<bool> EnsureAdminAsync(AppDbContext, IPasswordHasher, BootstrapSettings, DateTime now); }` — returns `true` when an admin was created, `false` when one already existed; throws `InvalidOperationException` when an admin is needed but settings are missing or the password is too short.

- [ ] **Step 1: Create the shared test context factory**

`backend/DiplomaTracker.Api.Tests/Support/TestDbContextFactory.cs`:

```csharp
using DiplomaTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Support;

public static class TestDbContextFactory
{
    public static AppDbContext Create()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new AppDbContext(options);
    }
}
```

- [ ] **Step 2: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Services/AdminBootstrapperTests.cs`:

```csharp
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class AdminBootstrapperTests
{
    private static readonly DateTime Now = new(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);
    private readonly PasswordHasher _passwordHasher = new();

    [Fact]
    public async Task EnsureAdminAsync_WhenNoAdminExists_CreatesActiveAdminWithNormalizedEmail()
    {
        await using var context = TestDbContextFactory.Create();
        var settings = new BootstrapSettings { AdminEmail = "  Head.Admin@KPI.ua ", AdminPassword = "Correct-Horse-42" };

        var created = await AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now);

        Assert.True(created);
        var admin = await context.Users.SingleAsync();
        Assert.Equal("head.admin@kpi.ua", admin.Email);
        Assert.Equal("Admin", admin.Role);
        Assert.True(admin.IsActive);
        Assert.Equal(Now, admin.CreatedAt);
        Assert.False(string.IsNullOrWhiteSpace(admin.PasswordHash));
        Assert.NotEqual(settings.AdminPassword, admin.PasswordHash);
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenAdminAlreadyExists_ChangesNothing()
    {
        await using var context = TestDbContextFactory.Create();
        context.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "Existing",
            LastName = "Admin",
            Email = "existing@kpi.ua",
            PasswordHash = "existing-hash",
            Role = "Admin",
            IsActive = true,
            CreatedAt = Now,
            UpdatedAt = Now
        });
        await context.SaveChangesAsync();
        var settings = new BootstrapSettings { AdminEmail = "other@kpi.ua", AdminPassword = "Another-Password-99" };

        var created = await AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now);

        Assert.False(created);
        var admin = await context.Users.SingleAsync();
        Assert.Equal("existing@kpi.ua", admin.Email);
        Assert.Equal("existing-hash", admin.PasswordHash);
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenNoAdminAndSettingsMissing_Throws()
    {
        await using var context = TestDbContextFactory.Create();

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, new BootstrapSettings(), Now));

        Assert.Contains("Bootstrap__AdminEmail", exception.Message);
        Assert.False(await context.Users.AnyAsync());
    }

    [Fact]
    public async Task EnsureAdminAsync_WhenPasswordTooShort_Throws()
    {
        await using var context = TestDbContextFactory.Create();
        var settings = new BootstrapSettings { AdminEmail = "admin@kpi.ua", AdminPassword = "short-pw" };

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(
            () => AdminBootstrapper.EnsureAdminAsync(context, _passwordHasher, settings, Now));

        Assert.Contains("at least 12", exception.Message);
        Assert.False(await context.Users.AnyAsync());
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~AdminBootstrapperTests"
```

Expected: build FAILS with `error CS0103: The name 'AdminBootstrapper' does not exist in the current context`.

- [ ] **Step 4: Implement the bootstrapper**

`backend/DiplomaTracker.Api/Services/AdminBootstrapper.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public static class AdminBootstrapper
{
    public const int MinimumPasswordLength = 12;

    public static async Task<bool> EnsureAdminAsync(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        BootstrapSettings settings,
        DateTime now)
    {
        if (await dbContext.Users.AnyAsync(u => u.Role == "Admin"))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(settings.AdminEmail) || string.IsNullOrWhiteSpace(settings.AdminPassword))
        {
            throw new InvalidOperationException(
                "No administrator exists. Set Bootstrap__AdminEmail and Bootstrap__AdminPassword to create the first one.");
        }

        if (settings.AdminPassword.Length < MinimumPasswordLength)
        {
            throw new InvalidOperationException(
                $"Bootstrap__AdminPassword must be at least {MinimumPasswordLength} characters long.");
        }

        dbContext.Users.Add(new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = "System",
            LastName = "Administrator",
            Email = settings.AdminEmail.Trim().ToLowerInvariant(),
            PasswordHash = passwordHasher.HashPassword(settings.AdminPassword),
            Role = "Admin",
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
        return true;
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~AdminBootstrapperTests"
```

Expected: `Passed! - Failed: 0, Passed: 4`.

- [ ] **Step 6: Replace `backend/DiplomaTracker.Api/Services/DbSeeder.cs`**

The development seeder creates a representative dataset and nothing else.

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public static class DbSeeder
{
    private static readonly string[] DefaultTaskTemplates =
    [
        "Choose diploma topic",
        "Submit diploma plan",
        "Submit introduction",
        "Submit literature review",
        "Submit practical part",
        "Submit first draft",
        "Submit final version",
        "Submit presentation"
    ];

    public static async Task SeedAsync(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        var now = DateTime.UtcNow;

        await EnsureUserAsync(dbContext, passwordHasher, "admin@diploma.local", "System", "Admin", "Admin123!", "Admin", now);
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", "Teacher", now);
        var student = await EnsureUserAsync(dbContext, passwordHasher, "student@diploma.local", "Demo", "Student", "Student123!", "Student", now);

        var group = await EnsureGroupAsync(dbContext, "Seed Group A", "Default seeded group", "2026/2027", now);

        await EnsureStudentProfileAsync(dbContext, student.Id, group.Id, teacher.Id, now);
        await EnsureTaskTemplatesAsync(dbContext, now);
    }

    private static async Task<AppUser> EnsureUserAsync(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        string email,
        string firstName,
        string lastName,
        string password,
        string role,
        DateTime now)
    {
        var existing = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing is not null)
        {
            return existing;
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            PasswordHash = passwordHasher.HashPassword(password),
            Role = role,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();
        return user;
    }

    private static async Task<Group> EnsureGroupAsync(
        AppDbContext dbContext,
        string name,
        string description,
        string academicYear,
        DateTime now)
    {
        var existing = await dbContext.Groups.FirstOrDefaultAsync(g => g.Name == name && g.AcademicYear == academicYear);
        if (existing is not null)
        {
            return existing;
        }

        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            AcademicYear = academicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Groups.Add(group);
        await dbContext.SaveChangesAsync();
        return group;
    }

    private static async Task EnsureStudentProfileAsync(
        AppDbContext dbContext,
        Guid userId,
        Guid groupId,
        Guid supervisorId,
        DateTime now)
    {
        if (await dbContext.StudentProfiles.AnyAsync(s => s.UserId == userId))
        {
            return;
        }

        dbContext.StudentProfiles.Add(new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DiplomaTopic = "Seeded diploma topic",
            GroupId = groupId,
            SupervisorId = supervisorId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureTaskTemplatesAsync(AppDbContext dbContext, DateTime now)
    {
        if (await dbContext.DiplomaTaskTemplates.AnyAsync())
        {
            return;
        }

        for (var i = 0; i < DefaultTaskTemplates.Length; i++)
        {
            dbContext.DiplomaTaskTemplates.Add(new DiplomaTaskTemplate
            {
                Id = Guid.NewGuid(),
                Title = DefaultTaskTemplates[i],
                Order = i + 1,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
}
```

- [ ] **Step 7: Verify the whole suite still builds and passes**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 20` (9 existing + 7 + 4).

---

### Task 4: Composition root

**Files:**
- Modify: `backend/DiplomaTracker.Api/Program.cs` (full replacement)

**Interfaces:**
- Consumes: `JwtSettings`, `CorsSettings`, `BootstrapSettings`, `StartupValidation` (Task 2); `AdminBootstrapper`, `DbSeeder` (Task 3).
- Produces: CORS policy name `FrontendPolicy`; Swagger available only when `ASPNETCORE_ENVIRONMENT=Development`.

JWT bearer and CORS options are configured lazily from bound settings, and validation runs immediately after `builder.Build()`. This ordering matters: EF Core design-time tooling (`dotnet ef migrations add`) executes `Program.cs` only up to `Build()`, so migrations can be generated without secrets present, while the running application still refuses to start misconfigured.

- [ ] **Step 1: Replace `backend/DiplomaTracker.Api/Program.cs`**

```csharp
using System.Text;
using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

const string CorsPolicyName = "FrontendPolicy";

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<CorsSettings>(builder.Configuration.GetSection("Cors"));
builder.Services.Configure<BootstrapSettings>(builder.Configuration.GetSection("Bootstrap"));

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITeacherService, TeacherService>();
builder.Services.AddScoped<IStudentService, StudentService>();
builder.Services.AddScoped<IGroupService, GroupService>();
builder.Services.AddScoped<ITaskTemplateService, TaskTemplateService>();
builder.Services.AddScoped<IGroupTaskService, GroupTaskService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "DiplomaTracker.Api", Version = "v1" });
    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Description = "Enter JWT Bearer token",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Type = ReferenceType.SecurityScheme,
            Id = JwtBearerDefaults.AuthenticationScheme
        }
    };
    options.AddSecurityDefinition(securityScheme.Reference.Id, securityScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });
});

builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>()
    .Configure<IOptions<CorsSettings>>((options, corsSettings) =>
        options.AddPolicy(CorsPolicyName, policy => policy
            .WithOrigins(corsSettings.Value.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtSettings>>((options, jwtSettings) =>
    {
        var jwt = jwtSettings.Value;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

StartupValidation.ValidateJwtSettings(app.Services.GetRequiredService<IOptions<JwtSettings>>().Value);
StartupValidation.ValidateCorsSettings(app.Services.GetRequiredService<IOptions<CorsSettings>>().Value);

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

    await dbContext.Database.MigrateAsync();

    if (app.Environment.IsDevelopment())
    {
        await DbSeeder.SeedAsync(dbContext, passwordHasher);
    }
    else
    {
        var bootstrapSettings = scope.ServiceProvider.GetRequiredService<IOptions<BootstrapSettings>>().Value;
        await AdminBootstrapper.EnsureAdminAsync(dbContext, passwordHasher, bootstrapSettings, DateTime.UtcNow);
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(CorsPolicyName);
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

- [ ] **Step 2: Build and run the suite**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 20`.

- [ ] **Step 3: Verify fail-fast outside Development**

```bash
dotnet run --project DiplomaTracker.Api --no-launch-profile -- --environment Production
```

Expected: the process exits with an unhandled `System.InvalidOperationException: Jwt:Secret must be at least 32 bytes. Set it with user-secrets locally or the Jwt__Secret environment variable when hosted.` (user-secrets are not loaded outside Development, so the secret is empty).

- [ ] **Step 4: Verify the Development happy path**

Start the API (requires the local SQL Server from Task 1's connection string):

```bash
dotnet run --project DiplomaTracker.Api --launch-profile http
```

In a second terminal:

```bash
curl -s http://localhost:5000/api/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5000/swagger/index.html
curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@diploma.local","password":"Admin123!"}' | head -c 80; echo
```

Expected: a JSON health payload containing `DiplomaTracker.Api`; `200`; a JSON body beginning `{"token":"ey`. Stop the API with Ctrl+C.

---

### Task 5: Workflow step status enumeration

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/StudentTaskStatus.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/StudentTask.cs:8`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs:111`
- Modify: `backend/DiplomaTracker.Api/Services/GroupTaskService.cs:159,261,335,429-430,453-454`
- Test: `backend/DiplomaTracker.Api.Tests/Data/StudentTaskStatusMappingTests.cs`

**Interfaces:**
- Consumes: `TestDbContextFactory.Create()` (Task 3).
- Produces: `enum StudentTaskStatus { Pending, Submitted, Approved, Returned }` in `DiplomaTracker.Api.Entities`; `StudentTask.Status` is of that type. API response DTOs keep `string Status` — the wire contract is unchanged.

- [ ] **Step 1: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Data/StudentTaskStatusMappingTests.cs`:

```csharp
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Data;

public class StudentTaskStatusMappingTests
{
    [Fact]
    public void Status_IsMappedAsEnumPersistedAsString()
    {
        using var context = TestDbContextFactory.Create();

        var property = context.Model.FindEntityType(typeof(StudentTask))!.FindProperty(nameof(StudentTask.Status))!;

        Assert.Equal(typeof(StudentTaskStatus), property.ClrType);
        Assert.Equal(typeof(string), property.GetProviderClrType());
    }

    [Fact]
    public async Task Status_RoundTripsThroughTheContext()
    {
        var taskId = Guid.NewGuid();
        await using (var writeContext = TestDbContextFactory.Create())
        {
            writeContext.StudentTasks.Add(new StudentTask
            {
                Id = taskId,
                StudentProfileId = Guid.NewGuid(),
                GroupTaskId = Guid.NewGuid(),
                Status = StudentTaskStatus.Submitted,
                CreatedAt = DateTime.UtcNow
            });
            await writeContext.SaveChangesAsync();

            var stored = await writeContext.StudentTasks.AsNoTracking().SingleAsync(t => t.Id == taskId);

            Assert.Equal(StudentTaskStatus.Submitted, stored.Status);
        }
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~StudentTaskStatusMappingTests"
```

Expected: build FAILS with `error CS0103: The name 'StudentTaskStatus' does not exist in the current context`.

- [ ] **Step 3: Create the enum**

`backend/DiplomaTracker.Api/Entities/StudentTaskStatus.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public enum StudentTaskStatus
{
    Pending,
    Submitted,
    Approved,
    Returned
}
```

- [ ] **Step 4: Change the entity and its mapping**

In `backend/DiplomaTracker.Api/Entities/StudentTask.cs`, replace:

```csharp
    public string Status { get; set; } = string.Empty;
```

with:

```csharp
    public StudentTaskStatus Status { get; set; } = StudentTaskStatus.Pending;
```

In `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, replace:

```csharp
        studentTask.Property(x => x.Status).HasMaxLength(50).IsRequired();
```

with:

```csharp
        studentTask.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
```

- [ ] **Step 5: Replace the string literals in `GroupTaskService`**

At both student-task creation sites (lines 159 and 261) replace:

```csharp
Status = "Pending",
```

with:

```csharp
Status = StudentTaskStatus.Pending,
```

At line 335 replace:

```csharp
        var hasNonPending = groupTask.StudentTasks.Any(st => st.Status != "Pending");
```

with:

```csharp
        var hasNonPending = groupTask.StudentTasks.Any(st => st.Status != StudentTaskStatus.Pending);
```

In both `MapMyTask` (lines 429–430) and `MapMyTaskDetails` (lines 453–454) replace:

```csharp
        var status = task.Status;
        var displayStatus = status == "Pending" && task.GroupTask.Deadline < now ? "MissedDeadline" : status;
```

with:

```csharp
        var status = task.Status.ToString();
        var displayStatus = task.Status == StudentTaskStatus.Pending && task.GroupTask.Deadline < now ? "MissedDeadline" : status;
```

- [ ] **Step 6: Run tests and confirm no literals remain**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
grep -rn '"Pending"' DiplomaTracker.Api/Services DiplomaTracker.Api/Entities DiplomaTracker.Api/Data
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `Passed! - Failed: 0, Passed: 22`; no grep output; `No changes have been made to the model since the last migration.` If `has-pending-model-changes` reports a difference, do **not** add a migration — the schema is regenerated from scratch in Task 14.

---

### Task 6: Untracked read-only queries

**Files:**
- Modify: `backend/DiplomaTracker.Api/Services/AuthService.cs:29,52`
- Modify: `backend/DiplomaTracker.Api/Services/TeacherService.cs:22,33`
- Modify: `backend/DiplomaTracker.Api/Services/StudentService.cs:22`
- Modify: `backend/DiplomaTracker.Api/Services/TaskTemplateService.cs:20,29`
- Modify: `backend/DiplomaTracker.Api/Services/GroupTaskService.cs:21,47,87,355,363,382,390`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs:20,30,125,144`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature changes. Every query in a method that never calls `SaveChangesAsync` is untracked.

Several of these lines are textually identical to lines in update methods of the same file (for example `TeacherService.cs:33` matches lines 68 and 93). Edit **only the listed line numbers** — the update and deactivate methods must keep tracking, or their changes will silently not be saved.

- [ ] **Step 1: Insert `.AsNoTracking()` at each listed query root**

Apply exactly these changes. Where a query spans several lines, `.AsNoTracking()` goes directly after the `DbSet` on the first line.

| File:line | Method | Before | After |
|---|---|---|---|
| `AuthService.cs:29` | `LoginAsync` | `var user = await _dbContext.Users` | `var user = await _dbContext.Users.AsNoTracking()` |
| `AuthService.cs:52` | `GetCurrentUserAsync` | `await _dbContext.Users.FirstOrDefaultAsync(` | `await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(` |
| `TeacherService.cs:22` | `GetTeachersAsync` | `var users = await _dbContext.Users` | `var users = await _dbContext.Users.AsNoTracking()` |
| `TeacherService.cs:33` | `GetTeacherByIdAsync` | `await _dbContext.Users.FirstOrDefaultAsync(` | `await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(` |
| `StudentService.cs:22` | `GetStudentsAsync` | `var students = await _dbContext.StudentProfiles` | `var students = await _dbContext.StudentProfiles.AsNoTracking()` |
| `TaskTemplateService.cs:20` | `GetTaskTemplatesAsync` | `var templates = await _dbContext.DiplomaTaskTemplates` | `var templates = await _dbContext.DiplomaTaskTemplates.AsNoTracking()` |
| `TaskTemplateService.cs:29` | `GetTaskTemplateByIdAsync` | `await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(` | `await _dbContext.DiplomaTaskTemplates.AsNoTracking().FirstOrDefaultAsync(` |
| `GroupTaskService.cs:21` | `GetGroupTasksAsync` | `var query = _dbContext.GroupTasks` | `var query = _dbContext.GroupTasks.AsNoTracking()` |
| `GroupTaskService.cs:47` | `GetGroupTaskByIdAsync` | `var groupTask = await _dbContext.GroupTasks` | `var groupTask = await _dbContext.GroupTasks.AsNoTracking()` |
| `GroupTaskService.cs:87` | `GetTasksForGroupAsync` | `var tasks = await _dbContext.GroupTasks` | `var tasks = await _dbContext.GroupTasks.AsNoTracking()` |
| `GroupTaskService.cs:355` | `GetMyTasksAsync` | `var studentProfile = await _dbContext.StudentProfiles` | `var studentProfile = await _dbContext.StudentProfiles.AsNoTracking()` |
| `GroupTaskService.cs:363` | `GetMyTasksAsync` | `var tasks = await _dbContext.StudentTasks` | `var tasks = await _dbContext.StudentTasks.AsNoTracking()` |
| `GroupTaskService.cs:382` | `GetMyTaskByIdAsync` | `var studentProfile = await _dbContext.StudentProfiles` | `var studentProfile = await _dbContext.StudentProfiles.AsNoTracking()` |
| `GroupTaskService.cs:390` | `GetMyTaskByIdAsync` | `var task = await _dbContext.StudentTasks` | `var task = await _dbContext.StudentTasks.AsNoTracking()` |
| `GroupService.cs:20` | `GetGroupsAsync` | `var groups = await _dbContext.Groups` | `var groups = await _dbContext.Groups.AsNoTracking()` |
| `GroupService.cs:30` | `GetGroupByIdAsync` | `await _dbContext.Groups.FirstOrDefaultAsync(` | `await _dbContext.Groups.AsNoTracking().FirstOrDefaultAsync(` |
| `GroupService.cs:125` | `GetGroupStudentsAsync` | `var students = await _dbContext.StudentProfiles` | `var students = await _dbContext.StudentProfiles.AsNoTracking()` |
| `GroupService.cs:144` | `GetGroupReviewersAsync` | `var reviewers = await _dbContext.GroupReviewers` | `var reviewers = await _dbContext.GroupReviewers.AsNoTracking()` |

- [ ] **Step 2: Verify counts and that update paths still track**

```bash
cd backend
for f in AuthService TeacherService StudentService TaskTemplateService GroupTaskService GroupService; do printf "%s " "$f"; grep -c "AsNoTracking" "DiplomaTracker.Api/Services/$f.cs"; done
sed -n '68p;93p' DiplomaTracker.Api/Services/TeacherService.cs
sed -n '297p;326p' DiplomaTracker.Api/Services/GroupTaskService.cs
```

Expected counts: `AuthService 2`, `TeacherService 2`, `StudentService 1`, `TaskTemplateService 2`, `GroupTaskService 7`, `GroupService 4`. The four printed update-path lines contain **no** `AsNoTracking`.

- [ ] **Step 3: Run the suite**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 22`.

---

### Task 7: Frontend configuration and lint baseline

**Files:**
- Create: `frontend/diploma-tracker-web/.env.development`
- Modify: `frontend/diploma-tracker-web/src/vite-env.d.ts`
- Modify: `frontend/diploma-tracker-web/src/api/apiClient.ts` (full replacement)
- Modify: `frontend/diploma-tracker-web/src/components/ErrorModal.tsx` (full replacement)
- Create: `frontend/diploma-tracker-web/src/auth/context.ts`
- Create: `frontend/diploma-tracker-web/src/auth/useAuth.ts`
- Modify: `frontend/diploma-tracker-web/src/auth/AuthContext.tsx` (full replacement)
- Modify imports in: `src/pages/LoginPage.tsx`, `src/components/LayoutShell.tsx`, `src/auth/RoleRedirect.tsx`, `src/auth/ProtectedRoute.tsx`, `src/pages/GroupDetailsPage.tsx`, `src/pages/GroupsPage.tsx`, `src/pages/StudentsPage.tsx`, `src/pages/TaskTemplatesPage.tsx`, `src/pages/TeachersPage.tsx`

**Interfaces:**
- Produces:
  - `apiClient.ts`: `class ApiError`, `getToken()`, `setToken(token)`, `clearToken()`, `apiRequest<T>(path, init?)`, **`isApiConflict(error: unknown): error is ApiError`** (moved here).
  - `auth/context.ts`: `type AuthContextValue`, `const AuthContext`.
  - `auth/useAuth.ts`: `useAuth(): AuthContextValue`.
  - `auth/AuthContext.tsx`: `AuthProvider` only.

The frontend has no unit test runner; ESLint and the TypeScript build are the verification gates. `react-refresh/only-export-components` fails when a `.tsx` file exports a component alongside anything else, which is why the hook, the context object and the conflict helper move into their own non-component modules.

- [ ] **Step 1: Confirm the current failures**

```bash
cd frontend/diploma-tracker-web
npm run lint
```

Expected: `✖ 5 problems (3 errors, 2 warnings)` — `no-empty` in `apiClient.ts`, and `react-refresh/only-export-components` in `AuthContext.tsx` and `ErrorModal.tsx`.

- [ ] **Step 2: Add environment configuration**

`frontend/diploma-tracker-web/.env.development`:

```
VITE_API_BASE_URL=http://localhost:5000
```

`frontend/diploma-tracker-web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Replace `src/api/apiClient.ts`**

```ts
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new ApiError(response.status, payload?.message ?? `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
```

- [ ] **Step 4: Replace `src/components/ErrorModal.tsx`**

```tsx
type ErrorModalProps = {
  message: string
  onClose: () => void
}

export function ErrorModal({ message, onClose }: ErrorModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Error</h3>
        <p>{message}</p>
        <button className="primary-button" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Split the authentication module**

`src/auth/context.ts`:

```ts
import { createContext } from 'react'
import type { CurrentUser } from '../api/types'

export type AuthContextValue = {
  user: CurrentUser | null
  isInitializing: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
```

`src/auth/useAuth.ts`:

```ts
import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from './context'

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

`src/auth/AuthContext.tsx`:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getCurrentUser, login as loginRequest } from '../api/authApi'
import { clearToken, getToken, setToken } from '../api/apiClient'
import type { CurrentUser } from '../api/types'
import { AuthContext, type AuthContextValue } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setIsInitializing(false)
      return
    }

    getCurrentUser()
      .then((currentUser) => {
        setUser(currentUser)
      })
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => {
        setIsInitializing(false)
      })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isInitializing,
    login: async (email: string, password: string) => {
      const result = await loginRequest({ email, password })
      setToken(result.token)
      setUser(result.user)
      return result.user
    },
    logout: () => {
      clearToken()
      setUser(null)
    }
  }), [user, isInitializing])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

- [ ] **Step 6: Update imports**

Replace the `useAuth` import:

| File | Before | After |
|---|---|---|
| `src/pages/LoginPage.tsx` | `import { useAuth } from '../auth/AuthContext'` | `import { useAuth } from '../auth/useAuth'` |
| `src/pages/GroupDetailsPage.tsx` | `import { useAuth } from '../auth/AuthContext'` | `import { useAuth } from '../auth/useAuth'` |
| `src/components/LayoutShell.tsx` | `import { useAuth } from '../auth/AuthContext'` | `import { useAuth } from '../auth/useAuth'` |
| `src/auth/RoleRedirect.tsx` | `import { useAuth } from './AuthContext'` | `import { useAuth } from './useAuth'` |
| `src/auth/ProtectedRoute.tsx` | `import { useAuth } from './AuthContext'` | `import { useAuth } from './useAuth'` |

In `GroupsPage.tsx`, `GroupDetailsPage.tsx`, `StudentsPage.tsx`, `TaskTemplatesPage.tsx` and `TeachersPage.tsx`, replace:

```ts
import { ErrorModal, isApiConflict } from '../components/ErrorModal'
```

with:

```ts
import { ErrorModal } from '../components/ErrorModal'
```

and import `isApiConflict` from `'../api/apiClient'`. If the file already imports from `'../api/apiClient'`, add `isApiConflict` to that existing import — for example `GroupsPage.tsx` becomes:

```ts
import { ApiError, isApiConflict } from '../api/apiClient'
```

Otherwise add a new line:

```ts
import { isApiConflict } from '../api/apiClient'
```

Then check whether `ApiError` is still referenced in each of those five files; if a file imports `ApiError` but no longer uses it, remove it from the import.

- [ ] **Step 7: Verify lint and build**

```bash
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: lint reports `0 errors` (the two pre-existing `react-hooks/exhaustive-deps` warnings in `GroupDetailsPage.tsx` and `GroupsPage.tsx` may remain); build ends with `✓ built in`.

- [ ] **Step 8: Smoke-test in the browser**

With the API running (`dotnet run --project DiplomaTracker.Api --launch-profile http` from `backend/`), start the client:

```bash
npm run dev
```

Open `http://localhost:5173`, sign in as `admin@diploma.local` / `Admin123!`, and confirm the admin dashboard loads and the Groups page lists `Seed Group A`. Reload the page and confirm the session persists. Stop both processes.

---

### Task 8: Phase 1 verification and commit

**Files:** none new.

- [ ] **Step 1: Full backend suite**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 22`.

- [ ] **Step 2: Frontend gates**

```bash
cd ../frontend/diploma-tracker-web
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `0 errors`; `✓ built in`.

- [ ] **Step 3: Confirm no secrets are about to be committed**

```bash
cd ../..
grep -n '"Secret": "[^"]\|Password=[^;"]' backend/DiplomaTracker.Api/appsettings.json backend/DiplomaTracker.Api/appsettings.Development.json; echo "exit=$?"
```

Expected: no matching lines and `exit=1`.

- [ ] **Step 4: Stage exactly the phase 1 changes**

```bash
git add .gitignore .config/dotnet-tools.json backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/.env.development frontend/diploma-tracker-web/src
git status --short
git diff --cached --name-only | grep -E '/bin/|/obj/|\.user$|PROJECT_PAPER|README'; echo "exit=$?"
```

Expected: `PROJECT_PAPER.md` and `frontend/diploma-tracker-web/README.md` still listed as `??` (untracked, not staged); the final grep prints nothing and `exit=1`.

- [ ] **Step 5: Commit**

```bash
git commit -m "Implement platform foundations"
git log --oneline -1
```

Expected: `<hash> Implement platform foundations`.

---

# Phase 2 — Academic structure

### Task 9: Academic hierarchy domain model

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/Faculty.cs`
- Create: `backend/DiplomaTracker.Api/Entities/Department.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/Group.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Test: `backend/DiplomaTracker.Api.Tests/Data/AcademicStructureModelTests.cs`

**Interfaces:**
- Consumes: `TestDbContextFactory.Create()` (Task 3).
- Produces:
  - `Faculty { Guid Id; string Name; string ShortName; DateTime CreatedAt; DateTime UpdatedAt; ICollection<Department> Departments }`
  - `Department { Guid Id; Guid FacultyId; string Name; string ShortName; DateTime CreatedAt; DateTime UpdatedAt; Faculty Faculty; ICollection<Group> Groups }`
  - `Group` gains `Guid DepartmentId` and `Department Department`.
  - `AppDbContext.Faculties`, `AppDbContext.Departments`.

- [ ] **Step 1: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Data/AcademicStructureModelTests.cs`:

```csharp
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace DiplomaTracker.Api.Tests.Data;

public class AcademicStructureModelTests
{
    [Fact]
    public void Department_RequiresFaculty_AndRestrictsFacultyDeletion()
    {
        using var context = TestDbContextFactory.Create();

        var foreignKey = context.Model.FindEntityType(typeof(Department))!
            .GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Faculty));

        Assert.True(foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
    }

    [Fact]
    public void Group_RequiresDepartment_AndRestrictsDepartmentDeletion()
    {
        using var context = TestDbContextFactory.Create();

        var foreignKey = context.Model.FindEntityType(typeof(Group))!
            .GetForeignKeys()
            .Single(fk => fk.PrincipalEntityType.ClrType == typeof(Department));

        Assert.True(foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
    }

    [Fact]
    public void Faculty_NameAndShortName_AreUnique()
    {
        using var context = TestDbContextFactory.Create();
        var faculty = context.Model.FindEntityType(typeof(Faculty))!;

        AssertUniqueIndex(faculty, nameof(Faculty.Name));
        AssertUniqueIndex(faculty, nameof(Faculty.ShortName));
    }

    [Fact]
    public void Department_NameAndShortName_AreUniqueWithinFaculty()
    {
        using var context = TestDbContextFactory.Create();
        var department = context.Model.FindEntityType(typeof(Department))!;

        AssertUniqueIndex(department, nameof(Department.FacultyId), nameof(Department.Name));
        AssertUniqueIndex(department, nameof(Department.FacultyId), nameof(Department.ShortName));
    }

    private static void AssertUniqueIndex(IEntityType entityType, params string[] propertyNames)
    {
        var index = entityType.GetIndexes()
            .SingleOrDefault(i => i.Properties.Select(p => p.Name).SequenceEqual(propertyNames));

        Assert.NotNull(index);
        Assert.True(index!.IsUnique);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~AcademicStructureModelTests"
```

Expected: build FAILS with `error CS0246: The type or namespace name 'Department' could not be found`.

- [ ] **Step 3: Create the entities**

`backend/DiplomaTracker.Api/Entities/Faculty.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class Faculty
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<Department> Departments { get; set; } = new List<Department>();
}
```

`backend/DiplomaTracker.Api/Entities/Department.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class Department
{
    public Guid Id { get; set; }
    public Guid FacultyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Faculty Faculty { get; set; } = null!;
    public ICollection<Group> Groups { get; set; } = new List<Group>();
}
```

Replace `backend/DiplomaTracker.Api/Entities/Group.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class Group
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Department Department { get; set; } = null!;
    public ICollection<StudentProfile> Students { get; set; } = new List<StudentProfile>();
    public ICollection<GroupReviewer> Reviewers { get; set; } = new List<GroupReviewer>();
    public ICollection<GroupTask> GroupTasks { get; set; } = new List<GroupTask>();
}
```

- [ ] **Step 4: Map the hierarchy**

In `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, add the sets after `DbSet<AppUser> Users`:

```csharp
    public DbSet<Faculty> Faculties => Set<Faculty>();
    public DbSet<Department> Departments => Set<Department>();
```

At the start of `OnModelCreating`, before `var user = modelBuilder.Entity<AppUser>();`, add:

```csharp
        var faculty = modelBuilder.Entity<Faculty>();
        faculty.ToTable("Faculties");
        faculty.HasKey(x => x.Id);
        faculty.Property(x => x.Name).HasMaxLength(200).IsRequired();
        faculty.Property(x => x.ShortName).HasMaxLength(50).IsRequired();
        faculty.Property(x => x.CreatedAt).IsRequired();
        faculty.Property(x => x.UpdatedAt).IsRequired();
        faculty.HasIndex(x => x.Name).IsUnique();
        faculty.HasIndex(x => x.ShortName).IsUnique();

        var department = modelBuilder.Entity<Department>();
        department.ToTable("Departments");
        department.HasKey(x => x.Id);
        department.Property(x => x.Name).HasMaxLength(200).IsRequired();
        department.Property(x => x.ShortName).HasMaxLength(50).IsRequired();
        department.Property(x => x.CreatedAt).IsRequired();
        department.Property(x => x.UpdatedAt).IsRequired();
        department.HasIndex(x => new { x.FacultyId, x.Name }).IsUnique();
        department.HasIndex(x => new { x.FacultyId, x.ShortName }).IsUnique();
        department.HasOne(x => x.Faculty)
            .WithMany(x => x.Departments)
            .HasForeignKey(x => x.FacultyId)
            .OnDelete(DeleteBehavior.Restrict);
```

In the `group` block, directly after `group.HasIndex(x => new { x.Name, x.AcademicYear }).IsUnique();`, add:

```csharp
        group.HasOne(x => x.Department)
            .WithMany(x => x.Groups)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 26`.

---

### Task 10: Faculty service

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/AcademicStructureErrors.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Faculties/FacultyResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Faculties/CreateFacultyRequest.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Faculties/UpdateFacultyRequest.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IFacultyService.cs`
- Create: `backend/DiplomaTracker.Api/Services/FacultyService.cs`
- Create: `backend/DiplomaTracker.Api.Tests/Support/TestData.cs`
- Test: `backend/DiplomaTracker.Api.Tests/Services/FacultyServiceTests.cs`

**Interfaces:**
- Consumes: `Faculty`, `Department`, `Group`, `AppDbContext.Faculties/Departments` (Task 9).
- Produces:
  - `static class AcademicStructureErrors` with constants `FacultyNotFound`, `FacultyNameTaken`, `FacultyShortNameTaken`, `FacultyHasDepartments`, `DepartmentNotFound`, `DepartmentNameTaken`, `DepartmentShortNameTaken`, `DepartmentHasGroups`.
  - `FacultyResponse { Guid Id; string Name; string ShortName; DateTime CreatedAt; DateTime UpdatedAt }`
  - `CreateFacultyRequest` / `UpdateFacultyRequest { string Name; string ShortName }`
  - `IFacultyService`:
    - `Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync()`
    - `Task<FacultyResponse?> GetFacultyByIdAsync(Guid id)`
    - `Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request)`
    - `Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request)`
    - `Task<(bool success, string? error)> DeleteFacultyAsync(Guid id)`
  - `static class TestData` with `Now`, `AddFaculty`, `AddDepartment`, `AddGroup`, `AddUser`, `AddStudentProfile` (each saves and returns the entity).

EF Core InMemory enforces neither unique indexes nor foreign keys, so every uniqueness and delete-guard rule below is an explicit service check, and the tests assert those checks — never a provider exception.

- [ ] **Step 1: Create the shared test data builders**

`backend/DiplomaTracker.Api.Tests/Support/TestData.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Tests.Support;

public static class TestData
{
    public static readonly DateTime Now = new(2026, 9, 15, 12, 0, 0, DateTimeKind.Utc);

    public static Faculty AddFaculty(AppDbContext context, string name = "Faculty of Informatics", string shortName = "FI")
    {
        var faculty = new Faculty { Id = Guid.NewGuid(), Name = name, ShortName = shortName, CreatedAt = Now, UpdatedAt = Now };
        context.Faculties.Add(faculty);
        context.SaveChanges();
        return faculty;
    }

    public static Department AddDepartment(AppDbContext context, Guid facultyId, string name = "Department of Software Engineering", string shortName = "SE")
    {
        var department = new Department { Id = Guid.NewGuid(), FacultyId = facultyId, Name = name, ShortName = shortName, CreatedAt = Now, UpdatedAt = Now };
        context.Departments.Add(department);
        context.SaveChanges();
        return department;
    }

    public static Group AddGroup(AppDbContext context, Guid departmentId, string name = "SE-21", string academicYear = "2026/2027")
    {
        var group = new Group { Id = Guid.NewGuid(), DepartmentId = departmentId, Name = name, AcademicYear = academicYear, CreatedAt = Now, UpdatedAt = Now };
        context.Groups.Add(group);
        context.SaveChanges();
        return group;
    }

    public static AppUser AddUser(AppDbContext context, string role, string email)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = role,
            LastName = email,
            Email = email,
            PasswordHash = "hash",
            Role = role,
            IsActive = true,
            CreatedAt = Now,
            UpdatedAt = Now
        };
        context.Users.Add(user);
        context.SaveChanges();
        return user;
    }

    public static StudentProfile AddStudentProfile(AppDbContext context, Guid userId, Guid groupId, Guid supervisorId)
    {
        var profile = new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GroupId = groupId,
            SupervisorId = supervisorId,
            DiplomaTopic = "Topic",
            CreatedAt = Now,
            UpdatedAt = Now
        };
        context.StudentProfiles.Add(profile);
        context.SaveChanges();
        return profile;
    }
}
```

- [ ] **Step 2: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Services/FacultyServiceTests.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class FacultyServiceTests
{
    [Fact]
    public async Task GetFacultiesAsync_ReturnsFacultiesOrderedByName()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var faculties = await new FacultyService(context).GetFacultiesAsync();

        Assert.Equal(new[] { "Faculty of Informatics", "Faculty of Physics" }, faculties.Select(f => f.Name));
    }

    [Fact]
    public async Task CreateFacultyAsync_WithUniqueNames_ReturnsTrimmedFaculty()
    {
        await using var context = TestDbContextFactory.Create();

        var (faculty, error) = await new FacultyService(context).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "  Faculty of Applied Mathematics ", ShortName = " FAM " });

        Assert.Null(error);
        Assert.NotNull(faculty);
        Assert.Equal("Faculty of Applied Mathematics", faculty!.Name);
        Assert.Equal("FAM", faculty.ShortName);
        Assert.True(await context.Faculties.AnyAsync(f => f.Id == faculty.Id));
    }

    [Fact]
    public async Task CreateFacultyAsync_WithDuplicateName_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "Faculty of Informatics", ShortName = "OTHER" });

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNameTaken, error);
    }

    [Fact]
    public async Task CreateFacultyAsync_WithDuplicateShortName_ReturnsShortNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context).CreateFacultyAsync(
            new CreateFacultyRequest { Name = "Faculty of Innovation", ShortName = "FI" });

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyShortNameTaken, error);
    }

    [Fact]
    public async Task UpdateFacultyAsync_WithUnknownId_ReturnsNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (faculty, error) = await new FacultyService(context).UpdateFacultyAsync(
            Guid.NewGuid(), new UpdateFacultyRequest { Name = "Any", ShortName = "A" });

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNotFound, error);
    }

    [Fact]
    public async Task UpdateFacultyAsync_KeepingItsOwnNames_Succeeds()
    {
        await using var context = TestDbContextFactory.Create();
        var existing = TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (faculty, error) = await new FacultyService(context).UpdateFacultyAsync(
            existing.Id, new UpdateFacultyRequest { Name = "Faculty of Informatics", ShortName = "FI" });

        Assert.Null(error);
        Assert.Equal("FI", faculty!.ShortName);
    }

    [Fact]
    public async Task UpdateFacultyAsync_ToAnotherFacultysName_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");

        var (faculty, error) = await new FacultyService(context).UpdateFacultyAsync(
            physics.Id, new UpdateFacultyRequest { Name = "Faculty of Informatics", ShortName = "FP" });

        Assert.Null(faculty);
        Assert.Equal(AcademicStructureErrors.FacultyNameTaken, error);
    }

    [Fact]
    public async Task DeleteFacultyAsync_WithDepartments_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id);

        var (success, error) = await new FacultyService(context).DeleteFacultyAsync(faculty.Id);

        Assert.False(success);
        Assert.Equal(AcademicStructureErrors.FacultyHasDepartments, error);
        Assert.True(await context.Faculties.AnyAsync(f => f.Id == faculty.Id));
    }

    [Fact]
    public async Task DeleteFacultyAsync_WithoutDepartments_RemovesFaculty()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);

        var (success, error) = await new FacultyService(context).DeleteFacultyAsync(faculty.Id);

        Assert.True(success);
        Assert.Null(error);
        Assert.False(await context.Faculties.AnyAsync());
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~FacultyServiceTests"
```

Expected: build FAILS with `error CS0234: The type or namespace name 'Faculties' does not exist in the namespace 'DiplomaTracker.Api.DTOs'`.

- [ ] **Step 4: Create the error constants**

`backend/DiplomaTracker.Api/Services/AcademicStructureErrors.cs`:

```csharp
namespace DiplomaTracker.Api.Services;

public static class AcademicStructureErrors
{
    public const string FacultyNotFound = "Faculty not found.";
    public const string FacultyNameTaken = "Faculty with the same name already exists.";
    public const string FacultyShortNameTaken = "Faculty with the same short name already exists.";
    public const string FacultyHasDepartments = "Cannot delete faculty because departments are assigned.";

    public const string DepartmentNotFound = "Department not found.";
    public const string DepartmentNameTaken = "Department with the same name already exists in this faculty.";
    public const string DepartmentShortNameTaken = "Department with the same short name already exists in this faculty.";
    public const string DepartmentHasGroups = "Cannot delete department because groups are assigned.";
}
```

- [ ] **Step 5: Create the DTOs and interface**

`backend/DiplomaTracker.Api/DTOs/Faculties/FacultyResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Faculties;

public class FacultyResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

`backend/DiplomaTracker.Api/DTOs/Faculties/CreateFacultyRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Faculties;

public class CreateFacultyRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string ShortName { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/DTOs/Faculties/UpdateFacultyRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Faculties;

public class UpdateFacultyRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string ShortName { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/Interfaces/IFacultyService.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Faculties;

namespace DiplomaTracker.Api.Interfaces;

public interface IFacultyService
{
    Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync();
    Task<FacultyResponse?> GetFacultyByIdAsync(Guid id);
    Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request);
    Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request);
    Task<(bool success, string? error)> DeleteFacultyAsync(Guid id);
}
```

- [ ] **Step 6: Implement the service**

`backend/DiplomaTracker.Api/Services/FacultyService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class FacultyService : IFacultyService
{
    private readonly AppDbContext _dbContext;

    public FacultyService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync()
    {
        var faculties = await _dbContext.Faculties
            .AsNoTracking()
            .OrderBy(f => f.Name)
            .ToListAsync();

        return faculties.Select(MapFaculty).ToList();
    }

    public async Task<FacultyResponse?> GetFacultyByIdAsync(Guid id)
    {
        var faculty = await _dbContext.Faculties.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id);
        return faculty is null ? null : MapFaculty(faculty);
    }

    public async Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request)
    {
        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(null, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        var now = DateTime.UtcNow;
        var faculty = new Faculty
        {
            Id = Guid.NewGuid(),
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Faculties.Add(faculty);
        await _dbContext.SaveChangesAsync();

        return (MapFaculty(faculty), null);
    }

    public async Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == id);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        faculty.Name = name;
        faculty.ShortName = shortName;
        faculty.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (MapFaculty(faculty), null);
    }

    public async Task<(bool success, string? error)> DeleteFacultyAsync(Guid id)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == id);
        if (faculty is null)
        {
            return (false, AcademicStructureErrors.FacultyNotFound);
        }

        if (await _dbContext.Departments.AnyAsync(d => d.FacultyId == id))
        {
            return (false, AcademicStructureErrors.FacultyHasDepartments);
        }

        _dbContext.Faculties.Remove(faculty);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private async Task<string?> FindConflictAsync(Guid? excludedId, string name, string shortName)
    {
        if (await _dbContext.Faculties.AnyAsync(f => f.Id != excludedId && f.Name == name))
        {
            return AcademicStructureErrors.FacultyNameTaken;
        }

        if (await _dbContext.Faculties.AnyAsync(f => f.Id != excludedId && f.ShortName == shortName))
        {
            return AcademicStructureErrors.FacultyShortNameTaken;
        }

        return null;
    }

    private static FacultyResponse MapFaculty(Faculty faculty) => new()
    {
        Id = faculty.Id,
        Name = faculty.Name,
        ShortName = faculty.ShortName,
        CreatedAt = faculty.CreatedAt,
        UpdatedAt = faculty.UpdatedAt
    };
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 35`.

---

### Task 11: Department service

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Departments/DepartmentResponse.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Departments/CreateDepartmentRequest.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Departments/UpdateDepartmentRequest.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IDepartmentService.cs`
- Create: `backend/DiplomaTracker.Api/Services/DepartmentService.cs`
- Test: `backend/DiplomaTracker.Api.Tests/Services/DepartmentServiceTests.cs`

**Interfaces:**
- Consumes: `AcademicStructureErrors`, `TestData` (Task 10).
- Produces:
  - `DepartmentResponse { Guid Id; Guid FacultyId; string FacultyName; string Name; string ShortName; DateTime CreatedAt; DateTime UpdatedAt }`
  - `CreateDepartmentRequest` / `UpdateDepartmentRequest { Guid FacultyId; string Name; string ShortName }`
  - `IDepartmentService`:
    - `Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId)` — returns `null` only when `facultyId` is supplied and that faculty does not exist.
    - `Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id)`
    - `Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request)`
    - `Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request)`
    - `Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id)`

- [ ] **Step 1: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Services/DepartmentServiceTests.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class DepartmentServiceTests
{
    [Fact]
    public async Task CreateDepartmentAsync_ForUnknownFaculty_ReturnsFacultyNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = Guid.NewGuid(), Name = "Department of Software Engineering", ShortName = "SE" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.FacultyNotFound, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithUniqueNames_ReturnsDepartmentWithFacultyName()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = " Department of Software Engineering ", ShortName = " SE " });

        Assert.Null(error);
        Assert.Equal("Department of Software Engineering", department!.Name);
        Assert.Equal("SE", department.ShortName);
        Assert.Equal(faculty.Id, department.FacultyId);
        Assert.Equal("Faculty of Informatics", department.FacultyName);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithDuplicateNameInSameFaculty_ReturnsNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = "Department of Software Engineering", ShortName = "OTHER" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentNameTaken, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithDuplicateShortNameInSameFaculty_ReturnsShortNameTaken()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = faculty.Id, Name = "Department of Systems Engineering", ShortName = "SE" });

        Assert.Null(department);
        Assert.Equal(AcademicStructureErrors.DepartmentShortNameTaken, error);
    }

    [Fact]
    public async Task CreateDepartmentAsync_WithSameNamesInAnotherFaculty_Succeeds()
    {
        await using var context = TestDbContextFactory.Create();
        var informatics = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddDepartment(context, informatics.Id, "Department of Mathematics", "DM");

        var (department, error) = await new DepartmentService(context).CreateDepartmentAsync(
            new CreateDepartmentRequest { FacultyId = physics.Id, Name = "Department of Mathematics", ShortName = "DM" });

        Assert.Null(error);
        Assert.Equal(physics.Id, department!.FacultyId);
    }

    [Fact]
    public async Task GetDepartmentsAsync_FilteredByFaculty_ReturnsOnlyThatFacultysDepartments()
    {
        await using var context = TestDbContextFactory.Create();
        var informatics = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var physics = TestData.AddFaculty(context, "Faculty of Physics", "FP");
        TestData.AddDepartment(context, informatics.Id, "Department of Software Engineering", "SE");
        TestData.AddDepartment(context, informatics.Id, "Department of Computer Engineering", "CE");
        TestData.AddDepartment(context, physics.Id, "Department of Optics", "DO");

        var departments = await new DepartmentService(context).GetDepartmentsAsync(informatics.Id);

        Assert.Equal(new[] { "Department of Computer Engineering", "Department of Software Engineering" }, departments!.Select(d => d.Name));
    }

    [Fact]
    public async Task GetDepartmentsAsync_ForUnknownFaculty_ReturnsNull()
    {
        await using var context = TestDbContextFactory.Create();

        var departments = await new DepartmentService(context).GetDepartmentsAsync(Guid.NewGuid());

        Assert.Null(departments);
    }

    [Fact]
    public async Task DeleteDepartmentAsync_WithGroups_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        TestData.AddGroup(context, department.Id);

        var (success, error) = await new DepartmentService(context).DeleteDepartmentAsync(department.Id);

        Assert.False(success);
        Assert.Equal(AcademicStructureErrors.DepartmentHasGroups, error);
        Assert.True(await context.Departments.AnyAsync(d => d.Id == department.Id));
    }

    [Fact]
    public async Task DeleteDepartmentAsync_WithoutGroups_RemovesDepartment()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);

        var (success, error) = await new DepartmentService(context).DeleteDepartmentAsync(department.Id);

        Assert.True(success);
        Assert.Null(error);
        Assert.False(await context.Departments.AnyAsync());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~DepartmentServiceTests"
```

Expected: build FAILS with `error CS0234: The type or namespace name 'Departments' does not exist in the namespace 'DiplomaTracker.Api.DTOs'`.

- [ ] **Step 3: Create the DTOs and interface**

`backend/DiplomaTracker.Api/DTOs/Departments/DepartmentResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Departments;

public class DepartmentResponse
{
    public Guid Id { get; set; }
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

`backend/DiplomaTracker.Api/DTOs/Departments/CreateDepartmentRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Departments;

public class CreateDepartmentRequest
{
    public Guid FacultyId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string ShortName { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/DTOs/Departments/UpdateDepartmentRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Departments;

public class UpdateDepartmentRequest
{
    public Guid FacultyId { get; set; }

    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string ShortName { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/Interfaces/IDepartmentService.cs`:

```csharp
using DiplomaTracker.Api.DTOs.Departments;

namespace DiplomaTracker.Api.Interfaces;

public interface IDepartmentService
{
    Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId);
    Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id);
    Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request);
    Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request);
    Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id);
}
```

- [ ] **Step 4: Implement the service**

`backend/DiplomaTracker.Api/Services/DepartmentService.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _dbContext;

    public DepartmentService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId)
    {
        if (facultyId.HasValue && !await _dbContext.Faculties.AnyAsync(f => f.Id == facultyId.Value))
        {
            return null;
        }

        var query = _dbContext.Departments.AsNoTracking().Include(d => d.Faculty).AsQueryable();
        if (facultyId.HasValue)
        {
            query = query.Where(d => d.FacultyId == facultyId.Value);
        }

        var departments = await query
            .OrderBy(d => d.Faculty.Name)
            .ThenBy(d => d.Name)
            .ToListAsync();

        return departments.Select(MapDepartment).ToList();
    }

    public async Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id)
    {
        var department = await _dbContext.Departments
            .AsNoTracking()
            .Include(d => d.Faculty)
            .FirstOrDefaultAsync(d => d.Id == id);

        return department is null ? null : MapDepartment(department);
    }

    public async Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(null, faculty.Id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        var now = DateTime.UtcNow;
        var department = new Department
        {
            Id = Guid.NewGuid(),
            FacultyId = faculty.Id,
            Faculty = faculty,
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Departments.Add(department);
        await _dbContext.SaveChangesAsync();

        return (MapDepartment(department), null);
    }

    public async Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request)
    {
        var department = await _dbContext.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department is null)
        {
            return (null, AcademicStructureErrors.DepartmentNotFound);
        }

        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(id, faculty.Id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        department.FacultyId = faculty.Id;
        department.Faculty = faculty;
        department.Name = name;
        department.ShortName = shortName;
        department.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (MapDepartment(department), null);
    }

    public async Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id)
    {
        var department = await _dbContext.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department is null)
        {
            return (false, AcademicStructureErrors.DepartmentNotFound);
        }

        if (await _dbContext.Groups.AnyAsync(g => g.DepartmentId == id))
        {
            return (false, AcademicStructureErrors.DepartmentHasGroups);
        }

        _dbContext.Departments.Remove(department);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private async Task<string?> FindConflictAsync(Guid? excludedId, Guid facultyId, string name, string shortName)
    {
        if (await _dbContext.Departments.AnyAsync(d => d.Id != excludedId && d.FacultyId == facultyId && d.Name == name))
        {
            return AcademicStructureErrors.DepartmentNameTaken;
        }

        if (await _dbContext.Departments.AnyAsync(d => d.Id != excludedId && d.FacultyId == facultyId && d.ShortName == shortName))
        {
            return AcademicStructureErrors.DepartmentShortNameTaken;
        }

        return null;
    }

    private static DepartmentResponse MapDepartment(Department department) => new()
    {
        Id = department.Id,
        FacultyId = department.FacultyId,
        FacultyName = department.Faculty.Name,
        Name = department.Name,
        ShortName = department.ShortName,
        CreatedAt = department.CreatedAt,
        UpdatedAt = department.UpdatedAt
    };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 44`.

---

### Task 12: Groups belong to a department

**Files:**
- Modify: `backend/DiplomaTracker.Api/DTOs/Groups/CreateGroupRequest.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Groups/UpdateGroupRequest.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Groups/GroupResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Services/GroupService.cs` (full replacement)
- Modify: `backend/DiplomaTracker.Api/Services/DbSeeder.cs` (full replacement)
- Test: `backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`

**Interfaces:**
- Consumes: `AcademicStructureErrors.DepartmentNotFound` (Task 10); `TestData` (Task 10); `IGroupService` signatures (unchanged).
- Produces:
  - `CreateGroupRequest` / `UpdateGroupRequest` gain `Guid DepartmentId`.
  - `GroupResponse` gains `Guid DepartmentId`, `string DepartmentName`, `Guid FacultyId`, `string FacultyName`.
  - `GroupsController` is unchanged: `DepartmentNotFound` falls through its existing default branch to `400 Bad Request`, which is correct for an invalid reference in a request body.

- [ ] **Step 1: Write the failing tests**

`backend/DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`:

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;
using DiplomaTracker.Api.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Tests.Services;

public class GroupServiceTests
{
    [Fact]
    public async Task CreateGroupAsync_ForUnknownDepartment_ReturnsDepartmentNotFound()
    {
        await using var context = TestDbContextFactory.Create();

        var (group, error) = await new GroupService(context).CreateGroupAsync(new CreateGroupRequest
        {
            DepartmentId = Guid.NewGuid(),
            Name = "SE-21",
            AcademicYear = "2026/2027"
        });

        Assert.Null(group);
        Assert.Equal(AcademicStructureErrors.DepartmentNotFound, error);
        Assert.False(await context.Groups.AnyAsync());
    }

    [Fact]
    public async Task CreateGroupAsync_MapsDepartmentAndFacultyNames()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var department = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");

        var (group, error) = await new GroupService(context).CreateGroupAsync(new CreateGroupRequest
        {
            DepartmentId = department.Id,
            Name = " SE-21 ",
            AcademicYear = "2026/2027"
        });

        Assert.Null(error);
        Assert.Equal("SE-21", group!.Name);
        Assert.Equal(department.Id, group.DepartmentId);
        Assert.Equal("Department of Software Engineering", group.DepartmentName);
        Assert.Equal(faculty.Id, group.FacultyId);
        Assert.Equal("Faculty of Informatics", group.FacultyName);
    }

    [Fact]
    public async Task UpdateGroupAsync_ToUnknownDepartment_ReturnsDepartmentNotFound()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        var existing = TestData.AddGroup(context, department.Id);

        var (group, error) = await new GroupService(context).UpdateGroupAsync(existing.Id, new UpdateGroupRequest
        {
            DepartmentId = Guid.NewGuid(),
            Name = existing.Name,
            AcademicYear = existing.AcademicYear
        });

        Assert.Null(group);
        Assert.Equal(AcademicStructureErrors.DepartmentNotFound, error);
    }

    [Fact]
    public async Task GetGroupsAsync_IncludesDepartmentAndFacultyNames()
    {
        await using var context = TestDbContextFactory.Create();
        var faculty = TestData.AddFaculty(context, "Faculty of Informatics", "FI");
        var department = TestData.AddDepartment(context, faculty.Id, "Department of Software Engineering", "SE");
        TestData.AddGroup(context, department.Id, "SE-21");
        context.ChangeTracker.Clear();

        var groups = await new GroupService(context).GetGroupsAsync();

        var group = Assert.Single(groups);
        Assert.Equal("Department of Software Engineering", group.DepartmentName);
        Assert.Equal("Faculty of Informatics", group.FacultyName);
    }

    [Fact]
    public async Task GetGroupStudentsAsync_ForTeacherWhoIsNotAReviewer_IsForbidden()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);
        var outsider = TestData.AddUser(context, "Teacher", "outsider@kpi.ua");

        var (students, error) = await new GroupService(context).GetGroupStudentsAsync(group.Id, "Teacher", outsider.Id);

        Assert.Null(students);
        Assert.Equal("Forbidden.", error);
    }

    [Fact]
    public async Task GetGroupStudentsAsync_ForAssignedReviewer_ReturnsStudents()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);
        var reviewer = TestData.AddUser(context, "Teacher", "reviewer@kpi.ua");
        context.GroupReviewers.Add(new GroupReviewer
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            ReviewerId = reviewer.Id,
            CreatedAt = TestData.Now
        });
        await context.SaveChangesAsync();

        var (students, error) = await new GroupService(context).GetGroupStudentsAsync(group.Id, "Teacher", reviewer.Id);

        Assert.Null(error);
        var student = Assert.Single(students!);
        Assert.Equal("student@kpi.ua", student.Email);
    }

    [Fact]
    public async Task DeleteGroupAsync_WithAssignedStudents_IsRefused()
    {
        await using var context = TestDbContextFactory.Create();
        var group = AddGroupWithOneStudent(context);

        var (success, error) = await new GroupService(context).DeleteGroupAsync(group.Id);

        Assert.False(success);
        Assert.Equal("Cannot delete group because students are assigned.", error);
        Assert.True(await context.Groups.AnyAsync(g => g.Id == group.Id));
    }

    private static Group AddGroupWithOneStudent(AppDbContext context)
    {
        var faculty = TestData.AddFaculty(context);
        var department = TestData.AddDepartment(context, faculty.Id);
        var group = TestData.AddGroup(context, department.Id);
        var supervisor = TestData.AddUser(context, "Teacher", "supervisor@kpi.ua");
        var student = TestData.AddUser(context, "Student", "student@kpi.ua");
        TestData.AddStudentProfile(context, student.Id, group.Id, supervisor.Id);
        return group;
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo --filter "FullyQualifiedName~GroupServiceTests"
```

Expected: build FAILS with `error CS0117: 'CreateGroupRequest' does not contain a definition for 'DepartmentId'`.

- [ ] **Step 3: Extend the group DTOs**

`backend/DiplomaTracker.Api/DTOs/Groups/CreateGroupRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Groups;

public class CreateGroupRequest
{
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/DTOs/Groups/UpdateGroupRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Groups;

public class UpdateGroupRequest
{
    public Guid DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
}
```

`backend/DiplomaTracker.Api/DTOs/Groups/GroupResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Groups;

public class GroupResponse
{
    public Guid Id { get; set; }
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = string.Empty;
    public Guid FacultyId { get; set; }
    public string FacultyName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AcademicYear { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

- [ ] **Step 4: Replace `backend/DiplomaTracker.Api/Services/GroupService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Groups;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class GroupService : IGroupService
{
    private const string DuplicateGroup = "Group with the same name and academic year already exists.";

    private readonly AppDbContext _dbContext;

    public GroupService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<GroupResponse>> GetGroupsAsync()
    {
        var groups = await _dbContext.Groups
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .OrderBy(g => g.Name)
            .ThenBy(g => g.AcademicYear)
            .ToListAsync();

        return groups.Select(MapGroup).ToList();
    }

    public async Task<GroupResponse?> GetGroupByIdAsync(Guid id)
    {
        var group = await _dbContext.Groups
            .AsNoTracking()
            .Include(g => g.Department)
            .ThenInclude(d => d.Faculty)
            .FirstOrDefaultAsync(g => g.Id == id);

        return group is null ? null : MapGroup(group);
    }

    public async Task<(GroupResponse? group, string? error)> CreateGroupAsync(CreateGroupRequest request)
    {
        var department = await FindDepartmentAsync(request.DepartmentId);
        if (department is null)
        {
            return (null, AcademicStructureErrors.DepartmentNotFound);
        }

        var normalizedName = request.Name.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        var exists = await _dbContext.Groups.AnyAsync(g => g.Name == normalizedName && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, DuplicateGroup);
        }

        var now = DateTime.UtcNow;
        var group = new Group
        {
            Id = Guid.NewGuid(),
            DepartmentId = department.Id,
            Department = department,
            Name = normalizedName,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            AcademicYear = normalizedAcademicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Groups.Add(group);
        await _dbContext.SaveChangesAsync();

        return (MapGroup(group), null);
    }

    public async Task<(GroupResponse? group, string? error)> UpdateGroupAsync(Guid id, UpdateGroupRequest request)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (null, "Group not found.");
        }

        var department = await FindDepartmentAsync(request.DepartmentId);
        if (department is null)
        {
            return (null, AcademicStructureErrors.DepartmentNotFound);
        }

        var normalizedName = request.Name.Trim();
        var normalizedAcademicYear = request.AcademicYear.Trim();

        var exists = await _dbContext.Groups.AnyAsync(g => g.Id != id && g.Name == normalizedName && g.AcademicYear == normalizedAcademicYear);
        if (exists)
        {
            return (null, DuplicateGroup);
        }

        group.DepartmentId = department.Id;
        group.Department = department;
        group.Name = normalizedName;
        group.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        group.AcademicYear = normalizedAcademicYear;
        group.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return (MapGroup(group), null);
    }

    public async Task<(bool success, string? error)> DeleteGroupAsync(Guid id)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == id);
        if (group is null)
        {
            return (false, "Group not found.");
        }

        var hasAssignedStudents = await _dbContext.StudentProfiles.AnyAsync(s => s.GroupId == id);
        if (hasAssignedStudents)
        {
            return (false, "Cannot delete group because students are assigned.");
        }

        _dbContext.Groups.Remove(group);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    public async Task<(IReadOnlyList<GroupStudentResponse>? students, string? error)> GetGroupStudentsAsync(Guid groupId, string role, Guid userId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, "Group not found.");
        }

        if (role == "Teacher")
        {
            var isReviewer = await _dbContext.GroupReviewers.AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == userId);
            if (!isReviewer)
            {
                return (null, "Forbidden.");
            }
        }

        var students = await _dbContext.StudentProfiles
            .AsNoTracking()
            .Include(s => s.User)
            .Include(s => s.Supervisor)
            .Where(s => s.GroupId == groupId && s.User.Role == "Student")
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .ToListAsync();

        return (students.Select(MapGroupStudent).ToList(), null);
    }

    public async Task<IReadOnlyList<GroupReviewerResponse>?> GetGroupReviewersAsync(Guid groupId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
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

    public async Task<(GroupReviewerResponse? reviewer, string? error)> AddGroupReviewerAsync(Guid groupId, AddGroupReviewerRequest request)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, "Group not found.");
        }

        var reviewer = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == request.ReviewerId);
        if (reviewer is null)
        {
            return (null, "Reviewer not found.");
        }

        if (reviewer.Role != "Teacher")
        {
            return (null, "Reviewer must be a teacher.");
        }

        if (!reviewer.IsActive)
        {
            return (null, "Reviewer must be active.");
        }

        var alreadyAssigned = await _dbContext.GroupReviewers
            .AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == request.ReviewerId);
        if (alreadyAssigned)
        {
            return (null, "Reviewer is already assigned to this group.");
        }

        var assignment = new GroupReviewer
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            ReviewerId = request.ReviewerId,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.GroupReviewers.Add(assignment);
        await _dbContext.SaveChangesAsync();

        assignment.Reviewer = reviewer;
        return (MapReviewer(assignment), null);
    }

    public async Task<(bool success, string? error)> RemoveGroupReviewerAsync(Guid groupId, Guid reviewerId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (false, "Group not found.");
        }

        var assignment = await _dbContext.GroupReviewers
            .FirstOrDefaultAsync(gr => gr.GroupId == groupId && gr.ReviewerId == reviewerId);
        if (assignment is null)
        {
            return (false, "Reviewer assignment not found.");
        }

        _dbContext.GroupReviewers.Remove(assignment);
        await _dbContext.SaveChangesAsync();
        return (true, null);
    }

    private Task<Department?> FindDepartmentAsync(Guid departmentId)
    {
        return _dbContext.Departments
            .Include(d => d.Faculty)
            .FirstOrDefaultAsync(d => d.Id == departmentId);
    }

    private static GroupResponse MapGroup(Group group) => new()
    {
        Id = group.Id,
        DepartmentId = group.DepartmentId,
        DepartmentName = group.Department.Name,
        FacultyId = group.Department.FacultyId,
        FacultyName = group.Department.Faculty.Name,
        Name = group.Name,
        Description = group.Description,
        AcademicYear = group.AcademicYear,
        CreatedAt = group.CreatedAt,
        UpdatedAt = group.UpdatedAt
    };

    private static GroupReviewerResponse MapReviewer(GroupReviewer groupReviewer) => new()
    {
        Id = groupReviewer.Id,
        GroupId = groupReviewer.GroupId,
        ReviewerId = groupReviewer.ReviewerId,
        FirstName = groupReviewer.Reviewer.FirstName,
        LastName = groupReviewer.Reviewer.LastName,
        Email = groupReviewer.Reviewer.Email,
        CreatedAt = groupReviewer.CreatedAt
    };

    private static GroupStudentResponse MapGroupStudent(StudentProfile profile) => new()
    {
        StudentProfileId = profile.Id,
        UserId = profile.UserId,
        FirstName = profile.User.FirstName,
        LastName = profile.User.LastName,
        Email = profile.User.Email,
        IsActive = profile.User.IsActive,
        DiplomaTopic = profile.DiplomaTopic,
        SupervisorId = profile.SupervisorId,
        SupervisorFirstName = profile.Supervisor?.FirstName,
        SupervisorLastName = profile.Supervisor?.LastName,
        SupervisorEmail = profile.Supervisor?.Email,
        CreatedAt = profile.CreatedAt,
        UpdatedAt = profile.UpdatedAt
    };
}
```

`GroupsController` compares against the literal `"Group with the same name and academic year already exists."`; the private constant holds the identical text, so no controller change is needed.

- [ ] **Step 5: Replace `backend/DiplomaTracker.Api/Services/DbSeeder.cs`**

The seeded group now needs a department, so the seeder creates the hierarchy first.

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public static class DbSeeder
{
    private static readonly string[] DefaultTaskTemplates =
    [
        "Choose diploma topic",
        "Submit diploma plan",
        "Submit introduction",
        "Submit literature review",
        "Submit practical part",
        "Submit first draft",
        "Submit final version",
        "Submit presentation"
    ];

    public static async Task SeedAsync(AppDbContext dbContext, IPasswordHasher passwordHasher)
    {
        var now = DateTime.UtcNow;

        await EnsureUserAsync(dbContext, passwordHasher, "admin@diploma.local", "System", "Admin", "Admin123!", "Admin", now);
        var teacher = await EnsureUserAsync(dbContext, passwordHasher, "teacher@diploma.local", "Demo", "Teacher", "Teacher123!", "Teacher", now);
        var student = await EnsureUserAsync(dbContext, passwordHasher, "student@diploma.local", "Demo", "Student", "Student123!", "Student", now);

        var faculty = await EnsureFacultyAsync(dbContext, "Faculty of Informatics and Computer Science", "FICS", now);
        var department = await EnsureDepartmentAsync(dbContext, faculty.Id, "Department of Software Engineering", "SE", now);
        var group = await EnsureGroupAsync(dbContext, department.Id, "Seed Group A", "Default seeded group", "2026/2027", now);

        await EnsureStudentProfileAsync(dbContext, student.Id, group.Id, teacher.Id, now);
        await EnsureTaskTemplatesAsync(dbContext, now);
    }

    private static async Task<AppUser> EnsureUserAsync(
        AppDbContext dbContext,
        IPasswordHasher passwordHasher,
        string email,
        string firstName,
        string lastName,
        string password,
        string role,
        DateTime now)
    {
        var existing = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (existing is not null)
        {
            return existing;
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FirstName = firstName,
            LastName = lastName,
            Email = email,
            PasswordHash = passwordHasher.HashPassword(password),
            Role = role,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync();
        return user;
    }

    private static async Task<Faculty> EnsureFacultyAsync(AppDbContext dbContext, string name, string shortName, DateTime now)
    {
        var existing = await dbContext.Faculties.FirstOrDefaultAsync(f => f.ShortName == shortName);
        if (existing is not null)
        {
            return existing;
        }

        var faculty = new Faculty
        {
            Id = Guid.NewGuid(),
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Faculties.Add(faculty);
        await dbContext.SaveChangesAsync();
        return faculty;
    }

    private static async Task<Department> EnsureDepartmentAsync(
        AppDbContext dbContext,
        Guid facultyId,
        string name,
        string shortName,
        DateTime now)
    {
        var existing = await dbContext.Departments.FirstOrDefaultAsync(d => d.FacultyId == facultyId && d.ShortName == shortName);
        if (existing is not null)
        {
            return existing;
        }

        var department = new Department
        {
            Id = Guid.NewGuid(),
            FacultyId = facultyId,
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Departments.Add(department);
        await dbContext.SaveChangesAsync();
        return department;
    }

    private static async Task<Group> EnsureGroupAsync(
        AppDbContext dbContext,
        Guid departmentId,
        string name,
        string description,
        string academicYear,
        DateTime now)
    {
        var existing = await dbContext.Groups.FirstOrDefaultAsync(g => g.Name == name && g.AcademicYear == academicYear);
        if (existing is not null)
        {
            return existing;
        }

        var group = new Group
        {
            Id = Guid.NewGuid(),
            DepartmentId = departmentId,
            Name = name,
            Description = description,
            AcademicYear = academicYear,
            CreatedAt = now,
            UpdatedAt = now
        };

        dbContext.Groups.Add(group);
        await dbContext.SaveChangesAsync();
        return group;
    }

    private static async Task EnsureStudentProfileAsync(
        AppDbContext dbContext,
        Guid userId,
        Guid groupId,
        Guid supervisorId,
        DateTime now)
    {
        if (await dbContext.StudentProfiles.AnyAsync(s => s.UserId == userId))
        {
            return;
        }

        dbContext.StudentProfiles.Add(new StudentProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            DiplomaTopic = "Seeded diploma topic",
            GroupId = groupId,
            SupervisorId = supervisorId,
            CreatedAt = now,
            UpdatedAt = now
        });

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureTaskTemplatesAsync(AppDbContext dbContext, DateTime now)
    {
        if (await dbContext.DiplomaTaskTemplates.AnyAsync())
        {
            return;
        }

        for (var i = 0; i < DefaultTaskTemplates.Length; i++)
        {
            dbContext.DiplomaTaskTemplates.Add(new DiplomaTaskTemplate
            {
                Id = Guid.NewGuid(),
                Title = DefaultTaskTemplates[i],
                Order = i + 1,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
dotnet test DiplomaTracker.Api.Tests --nologo -v q
```

Expected: `Passed! - Failed: 0, Passed: 51`.

---

### Task 13: Initial schema migration

**Files:**
- Delete: `backend/DiplomaTracker.Api/Migrations/*` (all 13 files)
- Create: `backend/DiplomaTracker.Api/Migrations/<timestamp>_InitialCreate.cs`, `<timestamp>_InitialCreate.Designer.cs`, `AppDbContextModelSnapshot.cs` (generated)

**Interfaces:**
- Consumes: the complete model from Tasks 5, 9 and 12.
- Produces: one migration, `InitialCreate`, describing the full schema. Nothing has been deployed, so no prior migration history needs preserving.

Design-time tooling runs `Program.cs` only up to `builder.Build()` (Task 4), so generating the migration needs no secrets. Dropping the local database does need the connection string, so that command passes `--environment Development` to load user-secrets.

- [ ] **Step 1: Remove the existing migrations and generate `InitialCreate`**

```bash
cd backend
rm -rf DiplomaTracker.Api/Migrations
dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations
```

Expected: `Done. To undo this action, use 'ef migrations remove'`.

- [ ] **Step 2: Verify the generated schema**

```bash
ls DiplomaTracker.Api/Migrations
M=$(ls DiplomaTracker.Api/Migrations/*_InitialCreate.cs)
grep -c 'name: "Faculties"\|name: "Departments"' "$M"
grep -A4 'name: "FK_Departments_Faculties_FacultyId"' "$M" | grep -c "ReferentialAction.Restrict"
grep -A4 'name: "FK_Groups_Departments_DepartmentId"' "$M" | grep -c "ReferentialAction.Restrict"
grep -c 'name: "IX_Departments_FacultyId_Name"\|name: "IX_Departments_FacultyId_ShortName"\|name: "IX_Faculties_Name"\|name: "IX_Faculties_ShortName"' "$M"
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: exactly three files listed (`*_InitialCreate.cs`, `*_InitialCreate.Designer.cs`, `AppDbContextModelSnapshot.cs`); a count of at least `2` for the table names; `1` for each restrict check; `4` for the indexes; and `No changes have been made to the model since the last migration.`

- [ ] **Step 3: Rebuild the local database**

```bash
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
dotnet run --project DiplomaTracker.Api --launch-profile http
```

Expected: `Dropping database 'DiplomaTrackerDb'` (or a message that it did not exist), then the API starts — applying `InitialCreate` and seeding — and logs `Now listening on: http://localhost:5000`.

- [ ] **Step 4: Verify seeding against the new schema**

In a second terminal:

```bash
API=http://localhost:5000
json() { node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); console.log($1)"; }
ADMIN=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@diploma.local","password":"Admin123!"}' | json d.token)
curl -s -H "Authorization: Bearer $ADMIN" $API/api/groups | json "d[0].name + ' | ' + d[0].departmentName + ' | ' + d[0].facultyName"
```

Expected: `Seed Group A | Department of Software Engineering | Faculty of Informatics and Computer Science`. Stop the API with Ctrl+C.

---

### Task 14: Faculty and department endpoints

**Files:**
- Create: `backend/DiplomaTracker.Api/Controllers/FacultiesController.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/DepartmentsController.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs` (service registrations)

**Interfaces:**
- Consumes: `IFacultyService` (Task 10), `IDepartmentService` (Task 11), `AcademicStructureErrors`.
- Produces the HTTP surface from spec §6:

| Method and route | Roles | Success | Errors |
|---|---|---|---|
| `GET /api/faculties` | any authenticated | 200 | — |
| `GET /api/faculties/{id}` | any authenticated | 200 | 404 |
| `GET /api/faculties/{id}/departments` | any authenticated | 200 | 404 unknown faculty |
| `POST /api/faculties` | Admin | 201 | 400 validation, 409 name/short name taken |
| `PUT /api/faculties/{id}` | Admin | 200 | 400, 404, 409 |
| `DELETE /api/faculties/{id}` | Admin | 204 | 404, 409 departments exist |
| `GET /api/departments?facultyId=` | any authenticated | 200 | 404 unknown faculty |
| `GET /api/departments/{id}` | any authenticated | 200 | 404 |
| `POST /api/departments` | Admin | 201 | 400 validation or unknown faculty, 409 |
| `PUT /api/departments/{id}` | Admin | 200 | 400, 404, 409 |
| `DELETE /api/departments/{id}` | Admin | 204 | 404, 409 groups exist |

A faculty referenced from a department request body that does not exist is a malformed request (400), whereas a faculty named in the URL that does not exist is a missing resource (404).

- [ ] **Step 1: Create `backend/DiplomaTracker.Api/Controllers/FacultiesController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/faculties")]
[Authorize]
public class FacultiesController : ControllerBase
{
    private readonly IFacultyService _facultyService;
    private readonly IDepartmentService _departmentService;

    public FacultiesController(IFacultyService facultyService, IDepartmentService departmentService)
    {
        _facultyService = facultyService;
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await _facultyService.GetFacultiesAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var faculty = await _facultyService.GetFacultyByIdAsync(id);
        return faculty is null ? NotFound() : Ok(faculty);
    }

    [HttpGet("{id:guid}/departments")]
    public async Task<IActionResult> GetDepartments(Guid id)
    {
        var departments = await _departmentService.GetDepartmentsAsync(id);
        return departments is null
            ? NotFound(new { message = AcademicStructureErrors.FacultyNotFound })
            : Ok(departments);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFacultyRequest request)
    {
        var (faculty, error) = await _facultyService.CreateFacultyAsync(request);
        return faculty is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = faculty.Id }, faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFacultyRequest request)
    {
        var (faculty, error) = await _facultyService.UpdateFacultyAsync(id, request);
        return faculty is null ? ToErrorResult(error) : Ok(faculty);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _facultyService.DeleteFacultyAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        AcademicStructureErrors.FacultyNotFound => NotFound(new { message = error }),
        AcademicStructureErrors.FacultyNameTaken
            or AcademicStructureErrors.FacultyShortNameTaken
            or AcademicStructureErrors.FacultyHasDepartments => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
```

- [ ] **Step 2: Create `backend/DiplomaTracker.Api/Controllers/DepartmentsController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/departments")]
[Authorize]
public class DepartmentsController : ControllerBase
{
    private readonly IDepartmentService _departmentService;

    public DepartmentsController(IDepartmentService departmentService)
    {
        _departmentService = departmentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? facultyId)
    {
        var departments = await _departmentService.GetDepartmentsAsync(facultyId);
        return departments is null
            ? NotFound(new { message = AcademicStructureErrors.FacultyNotFound })
            : Ok(departments);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var department = await _departmentService.GetDepartmentByIdAsync(id);
        return department is null ? NotFound() : Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDepartmentRequest request)
    {
        var (department, error) = await _departmentService.CreateDepartmentAsync(request);
        return department is null
            ? ToErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = department.Id }, department);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDepartmentRequest request)
    {
        var (department, error) = await _departmentService.UpdateDepartmentAsync(id, request);
        return department is null ? ToErrorResult(error) : Ok(department);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var (success, error) = await _departmentService.DeleteDepartmentAsync(id);
        return success ? NoContent() : ToErrorResult(error);
    }

    private IActionResult ToErrorResult(string? error) => error switch
    {
        AcademicStructureErrors.DepartmentNotFound => NotFound(new { message = error }),
        AcademicStructureErrors.DepartmentNameTaken
            or AcademicStructureErrors.DepartmentShortNameTaken
            or AcademicStructureErrors.DepartmentHasGroups => Conflict(new { message = error }),
        _ => BadRequest(new { message = error })
    };
}
```

- [ ] **Step 3: Register the services**

In `backend/DiplomaTracker.Api/Program.cs`, directly after:

```csharp
builder.Services.AddScoped<IGroupTaskService, GroupTaskService>();
```

add:

```csharp
builder.Services.AddScoped<IFacultyService, FacultyService>();
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
```

- [ ] **Step 4: Build, test and start the API**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo -v q
dotnet run --project DiplomaTracker.Api --launch-profile http
```

Expected: `Passed! - Failed: 0, Passed: 51`, then `Now listening on: http://localhost:5000`.

- [ ] **Step 5: Exercise the endpoints**

In a second terminal:

```bash
API=http://localhost:5000
JSON_HEADER="Content-Type: application/json"
UNKNOWN=00000000-0000-0000-0000-000000000001
json() { node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); console.log($1)"; }
login() { curl -s -X POST $API/api/auth/login -H "$JSON_HEADER" -d "{\"email\":\"$1\",\"password\":\"$2\"}" | json d.token; }
status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
AS_ADMIN="Authorization: Bearer $(login admin@diploma.local 'Admin123!')"
AS_STUDENT="Authorization: Bearer $(login student@diploma.local 'Student123!')"

echo " 1 anonymous list:           $(status $API/api/faculties)"
echo " 2 student list:             $(status -H "$AS_STUDENT" $API/api/faculties)"
echo " 3 student create:           $(status -X POST -H "$AS_STUDENT" -H "$JSON_HEADER" -d '{"name":"Faculty of Physics","shortName":"FP"}' $API/api/faculties)"
FACULTY=$(curl -s -X POST -H "$AS_ADMIN" -H "$JSON_HEADER" -d '{"name":"Faculty of Physics","shortName":"FP"}' $API/api/faculties | json d.id)
echo " 4 created faculty:          $FACULTY"
echo " 5 duplicate name:           $(status -X POST -H "$AS_ADMIN" -H "$JSON_HEADER" -d '{"name":"Faculty of Physics","shortName":"FP2"}' $API/api/faculties)"
echo " 6 blank name:               $(status -X POST -H "$AS_ADMIN" -H "$JSON_HEADER" -d '{"name":" ","shortName":"X"}' $API/api/faculties)"
DEPARTMENT=$(curl -s -X POST -H "$AS_ADMIN" -H "$JSON_HEADER" -d "{\"facultyId\":\"$FACULTY\",\"name\":\"Department of Optics\",\"shortName\":\"DO\"}" $API/api/departments | json d.id)
echo " 7 created department:       $DEPARTMENT"
echo " 8 dept for unknown faculty: $(status -X POST -H "$AS_ADMIN" -H "$JSON_HEADER" -d "{\"facultyId\":\"$UNKNOWN\",\"name\":\"Department of X\",\"shortName\":\"DX\"}" $API/api/departments)"
echo " 9 faculty departments:      $(curl -s -H "$AS_STUDENT" $API/api/faculties/$FACULTY/departments | json "d.map(x => x.shortName).join(',')")"
echo "10 unknown faculty depts:    $(status -H "$AS_ADMIN" $API/api/faculties/$UNKNOWN/departments)"
echo "11 delete faculty in use:    $(status -X DELETE -H "$AS_ADMIN" $API/api/faculties/$FACULTY)"
echo "12 delete department:        $(status -X DELETE -H "$AS_ADMIN" $API/api/departments/$DEPARTMENT)"
echo "13 delete faculty:           $(status -X DELETE -H "$AS_ADMIN" $API/api/faculties/$FACULTY)"
```

Expected, in order: `401`, `200`, `403`, a GUID, `409`, `400`, a GUID, `400`, `DO`, `404`, `409`, `204`, `204`. Leave the API running for Tasks 15 and 16.

---

### Task 15: Faculty and department administration page

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts` (append)
- Create: `frontend/diploma-tracker-web/src/api/facultiesApi.ts`
- Create: `frontend/diploma-tracker-web/src/api/departmentsApi.ts`
- Create: `frontend/diploma-tracker-web/src/pages/FacultiesPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/index.css` (append)
- Modify: `frontend/diploma-tracker-web/src/App.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/LayoutShell.tsx`

**Interfaces:**
- Consumes: the endpoints from Task 14; `apiRequest`, `isApiConflict` (Task 7); `ErrorModal`.
- Produces:
  - Types `Faculty`, `FacultyRequest`, `Department`, `DepartmentRequest`.
  - `facultiesApi.ts`: `getFaculties()`, `createFaculty(request)`, `updateFaculty(id, request)`, `deleteFaculty(id)`.
  - `departmentsApi.ts`: `getDepartments(facultyId?)`, `createDepartment(request)`, `updateDepartment(id, request)`, `deleteDepartment(id)`.
  - Route `/admin/faculties` (Admin only) and an Admin navigation link.

- [ ] **Step 1: Append the client types**

At the end of `src/api/types.ts` add:

```ts
export type Faculty = {
  id: string
  name: string
  shortName: string
  createdAt: string
  updatedAt: string
}

export type FacultyRequest = {
  name: string
  shortName: string
}

export type Department = {
  id: string
  facultyId: string
  facultyName: string
  name: string
  shortName: string
  createdAt: string
  updatedAt: string
}

export type DepartmentRequest = {
  facultyId: string
  name: string
  shortName: string
}
```

- [ ] **Step 2: Create the API modules**

`src/api/facultiesApi.ts`:

```ts
import { apiRequest } from './apiClient'
import type { Faculty, FacultyRequest } from './types'

export async function getFaculties(): Promise<Faculty[]> {
  return apiRequest<Faculty[]>('/api/faculties')
}

export async function createFaculty(request: FacultyRequest): Promise<Faculty> {
  return apiRequest<Faculty>('/api/faculties', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateFaculty(id: string, request: FacultyRequest): Promise<Faculty> {
  return apiRequest<Faculty>(`/api/faculties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteFaculty(id: string): Promise<void> {
  await apiRequest<void>(`/api/faculties/${id}`, {
    method: 'DELETE'
  })
}
```

`src/api/departmentsApi.ts`:

```ts
import { apiRequest } from './apiClient'
import type { Department, DepartmentRequest } from './types'

export async function getDepartments(facultyId?: string): Promise<Department[]> {
  const query = facultyId ? `?facultyId=${encodeURIComponent(facultyId)}` : ''
  return apiRequest<Department[]>(`/api/departments${query}`)
}

export async function createDepartment(request: DepartmentRequest): Promise<Department> {
  return apiRequest<Department>('/api/departments', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateDepartment(id: string, request: DepartmentRequest): Promise<Department> {
  return apiRequest<Department>(`/api/departments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteDepartment(id: string): Promise<void> {
  await apiRequest<void>(`/api/departments/${id}`, {
    method: 'DELETE'
  })
}
```

- [ ] **Step 3: Create `src/pages/FacultiesPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { isApiConflict } from '../api/apiClient'
import { createDepartment, deleteDepartment, getDepartments, updateDepartment } from '../api/departmentsApi'
import { createFaculty, deleteFaculty, getFaculties, updateFaculty } from '../api/facultiesApi'
import type { Department, Faculty } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type NameForm = {
  name: string
  shortName: string
}

const emptyForm: NameForm = { name: '', shortName: '' }

export function FacultiesPage() {
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [facultyForm, setFacultyForm] = useState<NameForm>(emptyForm)
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null)
  const [departmentForm, setDepartmentForm] = useState<NameForm>(emptyForm)
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  const selectedFaculty = faculties.find((faculty) => faculty.id === selectedFacultyId) ?? null

  const reportError = (err: unknown) => {
    if (isApiConflict(err)) {
      setModalMessage(err.message)
    } else {
      setError((err as Error).message)
    }
  }

  const loadFaculties = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await getFaculties()
      setFaculties(data)
      setSelectedFacultyId((current) => (data.some((faculty) => faculty.id === current) ? current : (data[0]?.id ?? '')))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadDepartments = useCallback(async (facultyId: string) => {
    if (!facultyId) {
      setDepartments([])
      return
    }

    try {
      setDepartments(await getDepartments(facultyId))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void loadFaculties()
  }, [loadFaculties])

  useEffect(() => {
    setEditingDepartmentId(null)
    setDepartmentForm(emptyForm)
    void loadDepartments(selectedFacultyId)
  }, [loadDepartments, selectedFacultyId])

  const submitFaculty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      if (editingFacultyId) {
        await updateFaculty(editingFacultyId, facultyForm)
      } else {
        await createFaculty(facultyForm)
      }
      setEditingFacultyId(null)
      setFacultyForm(emptyForm)
      await loadFaculties()
    } catch (err) {
      reportError(err)
    } finally {
      setIsSaving(false)
    }
  }

  const startFacultyEdit = (faculty: Faculty) => {
    setEditingFacultyId(faculty.id)
    setFacultyForm({ name: faculty.name, shortName: faculty.shortName })
  }

  const cancelFacultyEdit = () => {
    setEditingFacultyId(null)
    setFacultyForm(emptyForm)
  }

  const removeFaculty = async (faculty: Faculty) => {
    if (!window.confirm(`Delete ${faculty.name}?`)) {
      return
    }

    setError('')
    try {
      await deleteFaculty(faculty.id)
      await loadFaculties()
    } catch (err) {
      reportError(err)
    }
  }

  const submitDepartment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFacultyId) {
      return
    }

    setIsSaving(true)
    setError('')
    const request = { facultyId: selectedFacultyId, ...departmentForm }
    try {
      if (editingDepartmentId) {
        await updateDepartment(editingDepartmentId, request)
      } else {
        await createDepartment(request)
      }
      setEditingDepartmentId(null)
      setDepartmentForm(emptyForm)
      await loadDepartments(selectedFacultyId)
    } catch (err) {
      reportError(err)
    } finally {
      setIsSaving(false)
    }
  }

  const startDepartmentEdit = (department: Department) => {
    setEditingDepartmentId(department.id)
    setDepartmentForm({ name: department.name, shortName: department.shortName })
  }

  const cancelDepartmentEdit = () => {
    setEditingDepartmentId(null)
    setDepartmentForm(emptyForm)
  }

  const removeDepartment = async (department: Department) => {
    if (!window.confirm(`Delete ${department.name}?`)) {
      return
    }

    setError('')
    try {
      await deleteDepartment(department.id)
      await loadDepartments(selectedFacultyId)
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div className="faculties-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}
      {error && <p className="error-text">{error}</p>}

      <div className="faculties-layout">
        <section className="page-card">
          <h1>Faculties</h1>
          <form className="group-form" onSubmit={submitFaculty}>
            <div className="group-form-grid">
              <input className="field-input" placeholder="Faculty name" value={facultyForm.name} onChange={(e) => setFacultyForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <input className="field-input" placeholder="Short name" value={facultyForm.shortName} onChange={(e) => setFacultyForm((prev) => ({ ...prev, shortName: e.target.value }))} required />
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSaving}>{editingFacultyId ? 'Save Faculty' : 'Add Faculty'}</button>
              {editingFacultyId && <button className="secondary-button" type="button" onClick={cancelFacultyEdit} disabled={isSaving}>Cancel</button>}
            </div>
          </form>

          {isLoading && <p>Loading faculties...</p>}
          {!isLoading && faculties.length === 0 && <p>No faculties yet.</p>}
          <div className="card-stack">
            {faculties.map((faculty) => (
              <article
                key={faculty.id}
                className={faculty.id === selectedFacultyId ? 'entity-card card-selectable entity-card-selected' : 'entity-card card-selectable'}
                onClick={() => setSelectedFacultyId(faculty.id)}
              >
                <h3>{faculty.shortName}</h3>
                <p>{faculty.name}</p>
                <div className="actions-row">
                  <button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); startFacultyEdit(faculty) }}>Edit</button>
                  <button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); void removeFaculty(faculty) }}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="page-card">
          <h2>{selectedFaculty ? `Departments of ${selectedFaculty.shortName}` : 'Departments'}</h2>
          {!selectedFaculty && <p>Select or create a faculty to manage its departments.</p>}
          {selectedFaculty && (
            <>
              <form className="group-form" onSubmit={submitDepartment}>
                <div className="group-form-grid">
                  <input className="field-input" placeholder="Department name" value={departmentForm.name} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, name: e.target.value }))} required />
                  <input className="field-input" placeholder="Short name" value={departmentForm.shortName} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, shortName: e.target.value }))} required />
                </div>
                <div className="actions-row">
                  <button className="primary-button" type="submit" disabled={isSaving}>{editingDepartmentId ? 'Save Department' : 'Add Department'}</button>
                  {editingDepartmentId && <button className="secondary-button" type="button" onClick={cancelDepartmentEdit} disabled={isSaving}>Cancel</button>}
                </div>
              </form>

              {departments.length === 0 && <p>No departments in this faculty yet.</p>}
              <div className="card-stack">
                {departments.map((department) => (
                  <article key={department.id} className="entity-card">
                    <h3>{department.shortName}</h3>
                    <p>{department.name}</p>
                    <div className="actions-row">
                      <button className="secondary-button" type="button" onClick={() => startDepartmentEdit(department)}>Edit</button>
                      <button className="secondary-button" type="button" onClick={() => void removeDepartment(department)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the layout styles**

At the end of `src/index.css` add:

```css
.faculties-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

.faculties-layout .page-card {
  max-width: none;
}

.card-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.card-selectable {
  cursor: pointer;
}

.entity-card-selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 1px #2563eb;
}

@media (max-width: 900px) {
  .faculties-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Register the route and navigation link**

In `src/App.tsx`, after `import { GroupDetailsPage } from './pages/GroupDetailsPage'` add:

```tsx
import { FacultiesPage } from './pages/FacultiesPage'
```

and inside the Admin-only route group, directly before `<Route path="admin/groups" element={<GroupsPage />} />`, add:

```tsx
            <Route path="admin/faculties" element={<FacultiesPage />} />
```

In `src/components/LayoutShell.tsx`, directly before the `Groups` link (`<NavLink to="/admin/groups" ...>Groups</NavLink>`), add:

```tsx
              <NavLink to="/admin/faculties" className={({ isActive }) => isActive ? 'nav-link nav-link-active' : 'nav-link'}>Faculties</NavLink>
```

- [ ] **Step 6: Verify lint and build**

```bash
cd frontend/diploma-tracker-web
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `0 errors`; `✓ built in`.

- [ ] **Step 7: Verify in the browser**

With the API still running from Task 14, run `npm run dev`, open `http://localhost:5173` and sign in as `admin@diploma.local` / `Admin123!`. Then:

1. Click **Faculties**. `FICS` is listed and selected; the right panel shows `Departments of FICS` containing `SE`.
2. Add faculty `Faculty of Physics` / `FP`. It appears and can be selected; its department panel is empty.
3. Add faculty `Another Faculty` / `FP`. An error modal reads `Faculty with the same short name already exists.`
4. With `FP` selected, add department `Department of Optics` / `DO`, then edit it to `Department of Photonics`. The card updates.
5. Delete faculty `FP`. The modal reads `Cannot delete faculty because departments are assigned.`
6. Delete department `DO`, then delete faculty `FP`. Both disappear and `FICS` becomes selected again.
7. Sign out, sign in as `student@diploma.local` / `Student123!`, and confirm there is no **Faculties** link and that visiting `http://localhost:5173/admin/faculties` redirects away.

Leave the API and dev server running for Task 16.

---

### Task 16: Department selector on groups

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts` (`Group`, `CreateGroupRequest`, `UpdateGroupRequest`)
- Modify: `frontend/diploma-tracker-web/src/pages/GroupsPage.tsx`

**Interfaces:**
- Consumes: `getDepartments()` and `Department` (Task 15); the extended group contract from Task 12.
- Produces: `Group` gains `departmentId`, `departmentName`, `facultyId`, `facultyName`; both group request types gain a required `departmentId`.

- [ ] **Step 1: Extend the group types**

In `src/api/types.ts`, replace the `Group`, `CreateGroupRequest` and `UpdateGroupRequest` definitions with:

```ts
export type Group = {
  id: string
  departmentId: string
  departmentName: string
  facultyId: string
  facultyName: string
  name: string
  description: string | null
  academicYear: string
  createdAt: string
  updatedAt: string
}

export type CreateGroupRequest = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}

export type UpdateGroupRequest = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}
```

- [ ] **Step 2: Confirm the page no longer type-checks**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
```

Expected: FAIL with `src/pages/GroupsPage.tsx: ... Property 'departmentId' is missing in type 'CreateFormState'` (and the same for `EditFormState`).

- [ ] **Step 3: Add department state and loading to `GroupsPage.tsx`**

Replace the types import:

```tsx
import type { Group, GroupReviewer, Teacher } from '../api/types'
```

with:

```tsx
import { getDepartments } from '../api/departmentsApi'
import type { Department, Group, GroupReviewer, Teacher } from '../api/types'
```

Replace the form state types and empty values:

```tsx
type CreateFormState = {
  name: string
  description: string
  academicYear: string
}

type EditFormState = {
  name: string
  description: string
  academicYear: string
}

const emptyCreateForm: CreateFormState = {
  name: '',
  description: '',
  academicYear: ''
}

const emptyEditForm: EditFormState = {
  name: '',
  description: '',
  academicYear: ''
}
```

with:

```tsx
type CreateFormState = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}

type EditFormState = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}

const emptyCreateForm: CreateFormState = {
  departmentId: '',
  name: '',
  description: '',
  academicYear: ''
}

const emptyEditForm: EditFormState = {
  departmentId: '',
  name: '',
  description: '',
  academicYear: ''
}
```

Directly after `const [teachers, setTeachers] = useState<Teacher[]>([])` add:

```tsx
  const [departments, setDepartments] = useState<Department[]>([])
```

In `loadGroupsAndTeachers`, replace:

```tsx
      const [groupsData, teachersData] = await Promise.all([getGroups(), getTeachers()])
      setGroups(groupsData)
      setTeachers(teachersData)
```

with:

```tsx
      const [groupsData, teachersData, departmentsData] = await Promise.all([getGroups(), getTeachers(), getDepartments()])
      setGroups(groupsData)
      setTeachers(teachersData)
      setDepartments(departmentsData)
```

In `startEdit`, replace:

```tsx
    setEditForm({
      name: group.name,
```

with:

```tsx
    setEditForm({
      departmentId: group.departmentId,
      name: group.name,
```

- [ ] **Step 4: Add the selectors and department display**

In the create form, directly before:

```tsx
            <input className="field-input" placeholder="Group name" value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} required />
```

add:

```tsx
            <select className="field-input" value={createForm.departmentId} onChange={(e) => setCreateForm((prev) => ({ ...prev, departmentId: e.target.value }))} required>
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.facultyName} — {department.name}</option>
              ))}
            </select>
```

In the edit form, directly before:

```tsx
              <input className="field-input" placeholder="Group name" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required />
```

add:

```tsx
              <select className="field-input" value={editForm.departmentId} onChange={(e) => setEditForm((prev) => ({ ...prev, departmentId: e.target.value }))} required>
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.facultyName} — {department.name}</option>
                ))}
              </select>
```

In the group card, directly after:

```tsx
                <p><strong>Academic year:</strong> {group.academicYear}</p>
```

add:

```tsx
                <p><strong>Department:</strong> {group.departmentName} ({group.facultyName})</p>
```

- [ ] **Step 5: Verify type-check, lint and build**

```bash
npx tsc -b
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `tsc` prints nothing; lint `0 errors`; `✓ built in`.

- [ ] **Step 6: Verify in the browser**

Signed in as the administrator:

1. Open **Groups**. `Seed Group A` shows `Department: Department of Software Engineering (Faculty of Informatics and Computer Science)`.
2. Try to create a group without choosing a department. The browser blocks submission on the required selector.
3. Create group `SE-22` / `2026/2027` in `Faculty of Informatics and Computer Science — Department of Software Engineering`. The card shows that department.
4. Open **Faculties**, select `FICS`, and delete department `SE`. The modal reads `Cannot delete department because groups are assigned.`
5. Return to **Groups** and delete `SE-22`. It disappears.

Stop the dev server and the API.

---

### Task 17: Phase 2 verification and commit

**Files:** none new.

- [ ] **Step 1: Backend gates**

```bash
cd backend
dotnet test DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `Passed! - Failed: 0, Passed: 51`; `No changes have been made to the model since the last migration.`

- [ ] **Step 2: Frontend gates**

```bash
cd ../frontend/diploma-tracker-web
npm run lint
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: `0 errors`; `✓ built in`.

- [ ] **Step 3: Confirm no secrets are about to be committed**

```bash
cd ../..
grep -n '"Secret": "[^"]\|Password=[^;"]' backend/DiplomaTracker.Api/appsettings.json backend/DiplomaTracker.Api/appsettings.Development.json; echo "exit=$?"
```

Expected: no matching lines and `exit=1`.

- [ ] **Step 4: Stage exactly the phase 2 changes**

```bash
git add backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src
git status --short
git diff --cached --name-only | grep -E '/bin/|/obj/|\.user$|PROJECT_PAPER|README'; echo "exit=$?"
```

Expected: twelve `D` entries for the removed timestamped migration files, two `A` entries for `*_InitialCreate.cs` and `*_InitialCreate.Designer.cs`, an `M` entry for the regenerated `AppDbContextModelSnapshot.cs`, `A` entries for the other new backend and frontend files, and `M` entries for the modified ones; `PROJECT_PAPER.md` and `frontend/diploma-tracker-web/README.md` still `??`; the final grep prints nothing and `exit=1`.

- [ ] **Step 5: Commit**

```bash
git commit -m "Implement academic structure"
git log --oneline -3
```

Expected:

```
<hash> Implement academic structure
<hash> Implement platform foundations
3a3612c Add system design spec
```
