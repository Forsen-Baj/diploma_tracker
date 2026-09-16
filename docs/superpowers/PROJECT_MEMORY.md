# Project Memory

Shared, versioned working memory for the Diploma Tracker project. Read it at the start of
every session on any machine; append to it whenever something durable is learned.
Newest status first; keep entries short.

## Where things live

| What | Path |
|---|---|
| System design (binding authority) | `docs/superpowers/specs/2026-09-15-diploma-tracker-system-design.md` |
| Increment designs | `docs/superpowers/specs/<date>-<topic>-design.md` |
| Implementation plans | `docs/superpowers/plans/` |
| Session handoffs | `docs/superpowers/handoffs/` |
| Tests to write at the end of the project | `docs/superpowers/test-backlog.md` |
| Per-plan execution ledger, briefs, reports, review packages (git-ignored, local only) | `.superpowers/sdd/<plan-name>/` |
| Local dev server definitions (git-ignored) | `.claude/launch.json` — `api` on :5000, `web` on :5173 |

## Status

Delivery phases (spec §4): 1 Platform foundations · 2 Academic structure · 3 Design
system · 4 Thesis topics and reservation · 5 Submission and review · 6 Document templates
and generation · 7 Document preview and commenting. A user-onboarding increment (student
list import, registration toggle, profile and password management) sits between 2 and 3.

| Phase | State |
|---|---|
| 1 Platform foundations | Done — `abffb34` |
| 2 Academic structure | Done — `65f190d`; whole-phase review and its fixes on `phase1-2` |
| User onboarding | Designed — `docs/superpowers/specs/2026-09-16-user-onboarding-design.md`; plan next |
| 3–7 | Requirements only (spec §7–§11); each needs its own design and plan |

Open product questions:
- Under what conditions may a student cancel their own topic reservation? (phase 4)
- Is PDF output in scope? (phase 6)
- Should teachers see only the groups they review? `GET /api/groups`, `/api/groups/{id}`
  and `/api/groups/{id}/reviewers` are open to every teacher; only the group student list
  is filtered. Spec §6 (Testing) says "a teacher sees only the groups they review". Decide
  before phase 5 builds teacher pages on these endpoints.

Parked for later (not blocking):
- List reads use `Include` rather than projecting to DTOs in the query (`GroupService`,
  `DepartmentService`); revisit when the phase 4 topic catalogue enlarges lists.
- When a new faculty collides with two different existing faculties at once (one on name,
  one on short name), the 409 message may name the short name rather than the name.
- Tests to write in the end-of-project testing pass are collected in
  `docs/superpowers/test-backlog.md`, one section per phase.

## How work is run

- **Branches:** `master` ← `dev` ← one branch per phase or increment (first: `phase1-2`).
  The owner merges and creates branches. Work and commit on the checked-out branch;
  never merge or push.
- **Commits:** one bare title line, no body, no trailer. One commit per phase, plus
  follow-ups (review fixes, documents) as their own single-line commits.
- **Documents** (specs, plans, handoffs, this file) are committed on the working branch.
  They describe the system as a designed whole, not as corrections to earlier code.
- **Tests:** none during implementation. Unit tests are written in one pass once the
  whole project is done. Reviewers list test gaps separately for that pass.
- **Browser checks:** deferred until there are real workflows (topic reservation,
  submission and review), not simple CRUD pages.
- **Review:** one review per finished phase or feature, not per task. Findings are fixed
  in one batch, then re-checked once.
- **Stops:** after each phase commit, report and wait for the next branch.

### Agent presets

| Work | Agent |
|---|---|
| Design exploration, specs, plans | controller via `superpowers:brainstorming` → `superpowers:writing-plans` |
| API contract design (endpoints, status codes, DTO shapes) | `api-designer` |
| Backend implementation (ASP.NET Core, EF Core, services, controllers) | `csharp-developer` |
| Schema, indexes, migrations, query performance | `sql-pro` |
| Frontend implementation (React, TypeScript, pages, API modules) | `react-specialist` |
| Phase / feature review | `code-reviewer` |
| Auth, secrets, access-control review before merging security-sensitive work | `security-auditor` |
| Diagnosing failures | `debugger` |
| Final testing pass (end of project) | `test-automator` |
| Structural cleanup without behaviour change | `refactoring-specialist` |

## Environment facts

- Windows 10. The repository path contains spaces and Cyrillic
  (`C:\Users\c4pgt\Desktop\diplom snaps\маг\diploma_tracker`): always quote paths.
- The Bash tool is Git Bash. Python is not installed; use `node` for JSON and scripting.
- .NET SDKs 7.0.302 and 9.0.313 (SDK 9 builds the `net8.0` target). `dotnet-ef` 8.0.8 is
  a local tool (`.config/dotnet-tools.json`).
- Node 20.5.1, npm 9.8.0.
- SQL Server on `localhost`, database `DiplomaTrackerDb`, application login
  `diploma_smoke` (member of `dbcreator`, so the API can create the database on startup).
- Secrets (`ConnectionStrings:DefaultConnection`, `Jwt:Secret`) live in user-secrets,
  never in `appsettings*.json`. Never print them.
- Development seed accounts: `admin@diploma.local`, `teacher@diploma.local`,
  `student@diploma.local` (passwords in `Services/DbSeeder.cs`). Seeded data: faculty
  `FICS`, department `SE`, group `Seed Group A`, eight task templates.

## Gotchas

- **`curl … | node -e "readFileSync(0)"` yields empty stdin in Git Bash** ("Unexpected end
  of JSON input"). Write endpoint checks as a node script using global `fetch`.
- **`dotnet run` spawns a child `DiplomaTracker.Api.exe` that outlives its parent.** Kill it
  too (`taskkill //F //IM DiplomaTracker.Api.exe`) and confirm with
  `netstat -ano | grep ":5000 .*LISTEN"`. A running API locks the build output that
  `dotnet build`/`dotnet test` need.
- **Frontend build needs `VITE_API_BASE_URL`** (`apiClient.ts` throws at module load
  without it): `VITE_API_BASE_URL=http://localhost:5000 npm run build`.
- **Lint baseline:** 0 errors, 2 `react-hooks/exhaustive-deps` warnings
  (`GroupDetailsPage.tsx`, `GroupsPage.tsx`).
- **EF design-time tooling needs no secrets:** configuration validation runs after
  `builder.Build()`, where design-time host resolution stops.
- **Recreating the schema:** `dotnet ef database drop --force --project
  DiplomaTracker.Api -- --environment Development`, then start the API; it applies
  migrations and re-seeds. Hand-created rows are not recreated.
- **The InMemory provider enforces neither foreign keys nor unique indexes;** constraint
  behaviour is only proven against SQL Server.
- `GroupsController` maps 409 by comparing against the literal
  `"Group with the same name and academic year already exists."`; `GroupService`'s
  constant must stay character-for-character equal.
- Subagents have no browser. Browser checks run from the controller session through the
  in-app browser, and sign-in there is done by the owner.

## Decisions (do not reopen)

- Layered backend (Controllers → Services → EF Core), evolved rather than rewritten.
- Single `InitialCreate` migration; nothing deployed yet.
- Hierarchy is Faculty → Department → Group. No specialty, degree level, or institute.
- Teachers are not linked to departments; department is attached to topics (phase 4).
- Faculty and department have no `IsActive` flag; deleting one with dependents is refused
  (409), and foreign keys are `Restrict`.
- Services return `(T? result, string? error)`; error strings live in shared error
  classes (e.g. `AcademicStructureErrors`).
- Status mapping: an unknown id in a request body → 400; an unknown id in the URL → 404;
  uniqueness conflicts and blocked deletions → 409.
- Configuration validation runs after `builder.Build()` so `dotnet ef` works without
  secrets.
- Workflow step status is an enum persisted as a string (`nvarchar(50)`).

## Log

- 2026-09-16 — Phase 2 committed (`65f190d`); branches reorganised to
  `master` ← `dev` ← `phase1-2`; this file created.
