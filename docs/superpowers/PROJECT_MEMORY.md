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
| Session handoffs (latest: `2026-09-19-phase-5-kickoff.md`) | `docs/superpowers/handoffs/` |
| Tests to write at the end of the project | `docs/superpowers/test-backlog.md` |
| Per-plan execution ledger, briefs, reports, review packages (git-ignored, local only) | `.superpowers/sdd/<plan-name>/` |
| End-to-end check scripts (committed since 2026-09-18) | `.superpowers/checks/` |
| Local dev server definitions (git-ignored) | `.claude/launch.json` — `api` on :5000, `web` on :5173 |

## Status

Delivery phases (spec §4): 1 Platform foundations · 2 Academic structure · 3 Design
system · 4 Thesis topics and reservation · 5 Submission and review · 6 Document templates
and generation · 7 Document preview and commenting. A user-onboarding increment (student
list import, registration toggle, profile and password management) sits between 2 and 3.

| Phase | State | Design | Plan |
|---|---|---|---|
| 1 Platform foundations | Done — `abffb34` | `2026-09-15-diploma-tracker-system-design.md` §5 | `2026-09-15-platform-foundations-and-academic-structure.md` |
| 2 Academic structure | Done — `65f190d`, review fixes `0e909bc` | same, §6 | same |
| User onboarding | Done — commit `Implement user onboarding` | `2026-09-16-user-onboarding-design.md` | `2026-09-17-user-onboarding.md` |
| 3 Design system | Done — commit `Implement design system and structure refinements` | `2026-09-17-design-system-design.md` | `2026-09-17-design-system.md` |
| Structure and administration refinements | Done — commit `Implement design system and structure refinements` | `2026-09-17-structure-and-administration-refinements-design.md` | `2026-09-17-structure-and-administration-refinements.md` |
| 4 Topics and reservation | Done — commit `Implement thesis topics and reservation` | `2026-09-17-topics-and-reservation-design.md` (amended 2026-09-18) | `2026-09-17-topics-and-reservation.md` |
| 5 Submission and review | Planned | `2026-09-17-submission-and-review-design.md` | `2026-09-17-submission-and-review.md` |
| 6 Document templates | Planned | `2026-09-17-document-templates-design.md` | `2026-09-17-document-templates.md` |
| 7 Document preview and commenting | Deferred by the owner; revisit after phase 6 | — | — |

Build order: onboarding → 3 → 4 → 5 → 6. Specs live in `docs/superpowers/specs/`, plans in
`docs/superpowers/plans/`. Each plan assumes the previous ones are implemented; execute them
in order with `superpowers:subagent-driven-development`.

How the plans are written: complete code for backend, shared frontend infrastructure and
verification scripts; page markup is specified (components, state, behaviour, full
translation blocks) and written by the frontend agent. Each plan recreates the local
database (single `InitialCreate` regenerated) and ends with exactly one commit.

Cross-design links worth knowing:
- Phase 3 introduces the `{ code, message }` error contract; every endpoint built before it
  (including onboarding) migrates in phase 3, and every later phase uses codes from the start.
- The optional patronymic on users arrives with onboarding (CSV column too); phase 6 markers
  use it.
- Phase 4 replaces the free-text student topic with `StudentProfile.TopicId`.
- **A change request is a `Pending` reservation held alongside an `Approved` one** — no separate
  entity, no flag. Hence two *separate* filtered unique indexes on `TopicReservations`
  (`StudentProfileId` where `Pending`, and where `Approved`), never one combined index.
- **Any operation replacing one of a student's reservations with another saves in two phases
  inside one transaction**: settle what is displaced, `SaveChanges`, write the replacement,
  `SaveChanges`, commit. A single save intermittently violates the filtered unique index because
  EF picks its own statement order. Phase 1 must also clear the holder's `TopicId`/`SupervisorId`
  before a displaced `StudentProposal` topic is deleted — that FK is `Restrict`.
- Administrator topic assignment is `PUT /api/students/{id}/topic`; it replaces rather than
  refuses. The selection deadline binds only a student who has no approved topic.
- Phase 5 defines teacher visibility (groups they review or where they supervise a student);
  phases 5 and 6 rely on it. Phase 5 also introduces `IFileStorage`, reused by phase 6.

Open product questions: none. Settled 2026-09-17: students cancel only while pending and
before the global selection deadline (phase 4); output is `.docx` only, no PDF (phase 6);
teachers see only relevant groups (phase 5).

Parked for later (not blocking):
- List reads use `Include` rather than projecting to DTOs in the query (`GroupService`,
  `DepartmentService`); revisit when the phase 4 topic catalogue enlarges lists.
- When a new faculty collides with two different existing faculties at once (one on name,
  one on short name), the 409 message may name the short name rather than the name.
- Tests to write in the end-of-project testing pass are collected in
  `docs/superpowers/test-backlog.md`, one section per phase.
- Rate limiting is built but switched off (`RateLimiting:Enabled` = `false` in `appsettings.json`) until the owner enables it. Before enabling: forwarded-headers handling for a reverse proxy, a per-IP budget that suits a classroom behind one NAT (login and claim share one budget), and whether `PUT /api/auth/password` needs a limit.
- Onboarding questions still open: student-number normalisation keeps internal spaces and does not fold Latin/Cyrillic lookalikes; administrators may change their own password to 8 characters; email + student number is weak proof of identity while registration is open.
- Drag-and-drop reordering of step templates: owner wants it in the final phase, after the core workflows.
- `fix-wave-backend-extra-check.mjs` has three failing checks that predate this work: it asserts a malformed CSV quote is a *file-level* error with `errors: []`, while `StudentImportService` reports it as a row-level `import.row.malformedQuote` carrying the line the quote opened on. The import still rejects the whole file (400, nothing created). Decide whether the script or the API is right when phase 5 touches uploads.
- Parked from the phase 3 review: a group whose students are all archived cannot be deleted; reviewer lists and the academic structure are readable by any signed-in user; tokens stay valid up to 60 minutes after archiving or deactivation; accessibility pass (request sequencing, modal initial focus, segmented-control keyboard behaviour, loading states announced).
- Parked from the phase 4 review, owner to decide: `IsSelectionOpenAsync` re-reads `PlatformSettings` on every call; `TopicService` repeats five identical correlated subqueries per topic row; `StudentProfile.TopicId` and the `Approved` reservation are two sources of truth for whether a student holds a topic; a rejection carrying **no** comment shows the student nothing at all on their *My topic* card (the spec ties that block to the comment); `selectionClosedRaw` is computed only at render, so a page left open across the deadline keeps offering the actions until something re-renders (the API refuses the call regardless).
- The interface ships **one theme only** — `src/index.css` defines a single set of `--color-*` values and there is no `prefers-color-scheme`, `data-theme` or toggle anywhere. Do not assume a dark mode exists when styling.

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
| Backend implementation (ASP.NET Core, EF Core, services, controllers) | `csharp-developer`, or `dotnet-core-expert` where that agent is not installed |
| Schema, indexes, migrations, query performance | `sql-pro` |
| Frontend implementation (React, TypeScript, pages, API modules) | `react-specialist` |
| Phase / feature review | `code-reviewer` |
| Auth, secrets, access-control review before merging security-sensitive work | `security-auditor` |
| Diagnosing failures | `debugger` |
| Final testing pass (end of project) | `test-automator` |
| Structural cleanup without behaviour change | `refactoring-specialist` |

## Environment facts

- The project is worked on from more than one machine, and the checkout path differs between
  them. On the first it is `C:\Users\c4pgt\Desktop\diplom snaps\маг\diploma_tracker` — spaces and
  Cyrillic, so always quote paths. On the second (Windows 11) it is `C:\GIT\diploma_tracker`.
  Never hard-code either; derive paths from the repository root.
- The Bash tool is Git Bash. Python is not installed; use `node` for JSON and scripting.
- .NET SDKs 7.0.302 and 9.0.313 (SDK 9 builds the `net8.0` target). `dotnet-ef` 8.0.8 is
  a local tool (`.config/dotnet-tools.json`).
- Node 20.5.1, npm 9.8.0.
- SQL Server on `localhost`, database `DiplomaTrackerDb`. The first machine uses the application
  login `diploma_smoke` (member of `dbcreator`, so the API can create the database on startup);
  the second uses integrated security (`Trusted_Connection=True;TrustServerCertificate=True`),
  which also creates the database on first start. Either is fine — the connection string is a
  user-secret, so each machine chooses its own.
- **On the second machine NuGet needs an explicit source.** A machine-wide private feed
  (`pkgs.dev.azure.com/FPipe/...`) answers 401 and fails every restore. Restore with
  `--source https://api.nuget.org/v3/index.json` and build with `--no-restore`; the resulting
  `NU1900` warning about that feed is an environment artefact, not a code warning.
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
- Subagents have no browser. Browser checks run from the controller session through the
  in-app browser, and sign-in there is done by the owner.
- **Rate limiter is off by configuration.** With `RateLimiting:Enabled` = `true`, `login` and `claim` allow 10 requests per minute per IP; scripted checks must then pace their calls or they receive 429.
- **Seed student number** is `SEED-0001`; imported and claimable test students need their own unique numbers.
- **`.superpowers/` is never committed:** `.superpowers/sdd/` has its own ignore file and `/.superpowers/checks/` is in `.gitignore`.
- **Error contract:** every API error is `{ code, message }` (`fields` for `validation.failed`, `errors` for import rows); codes live in per-area catalogues and are translated in `src/i18n/{uk,en}.json`. Never compare message text.
- **Check scripts** (`.superpowers/checks/`) run against the live local database. They are committed (they were git-ignored until 2026-09-18). Uniqueness across runs is carried by **codes, emails and student numbers**, never by the academic year — the year is a realistic `2026/2027` and the format rule now rejects stamped values. A script that creates groups deletes them at the end of a successful run; because a group cannot be deleted while any student points at it and students cannot be deleted at all, the script first restores, moves them into the seeded group and archives them there.
- **i18n:** `npm run i18n:check` validates that uk and en have the same keys and each language's own plural categories (uk one/few/many, en one/other).

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
- API errors are `{ code, message }`; a body reference that does not exist has its own 400 code, a URL resource that does not exist a 404 code.

## Log

- 2026-09-16 — Phase 2 committed (`65f190d`); branches reorganised to
  `master` ← `dev` ← `phase1-2`; this file created.
- 2026-09-17 — Designs for onboarding and phases 3–6 approved and committed; phase 7 deferred.
- 2026-09-17 — Implementation plans written for onboarding and phases 3–6.
- 2026-09-17 — User onboarding implemented: CSV import, account claiming, registration switch, password management.
- 2026-09-17 — Onboarding refined: an access reset reopens only that student's account (`ClaimReopened`), account events are logged, rate limiting switched off, group details show student number and claim status.
- 2026-09-18 — Design system and structure refinements implemented: `{ code, message }` error contract, Tailwind 4 + Headless UI component library, uk/en interface, group codes, steps per faculty with start dates, administrators page, student archiving, steps for late joiners.
- 2026-09-18 — Owner notes from the phase 3 browser test applied: academic year restricted to digits and `/ \ - .` (max 20, `validation.failed` with `format`), `Group.Name` removed entirely so the code is the only group identity, step template `Order` unique per faculty (`taskTemplate.orderTaken` on create; an update moves the step and shifts its neighbours), check scripts use realistic academic years and delete every group they create.
- 2026-09-19 — Phase 4 implemented: topic catalogue, reservations, student proposals, change requests for an approved topic, administrator assignment from the student form (`PUT /api/students/{id}/topic`), administrator amendment of a topic at any stage, and the global selection deadline on a new Settings page. Reviewed in two halves (backend 1 Critical / 8 Important, frontend 2 Critical / 9 Important); one fix wave and a scoped re-review returned 39 of 40 findings fixed with no new defects.
