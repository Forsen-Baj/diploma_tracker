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
| Session handoffs (latest: `2026-09-21-phase-8-complete.md`) | `docs/superpowers/handoffs/` |
| Tests to write at the end of the project | `docs/superpowers/test-backlog.md` |
| Per-plan execution ledger, briefs, reports, review packages (git-ignored, local only — does **not** travel between machines, so a handoff must be self-contained) | `.superpowers/sdd/<plan-name>/` |
| End-to-end check scripts (committed since 2026-09-18) | `.superpowers/checks/` |
| Local dev server definitions (git-ignored) | `.claude/launch.json` — `api` on :5000, `web` on :5173 |

## Status

Delivery phases (spec §4): 1 Platform foundations · 2 Academic structure · 3 Design
system · 4 Thesis topics and reservation · 5 Submission and review · 6 Document templates
and generation · 7 Document preview and commenting · 8 Hardening and polish. A
user-onboarding increment (student list import, registration toggle, profile and password
management) sits between 2 and 3.

| Phase | State | Design | Plan |
|---|---|---|---|
| 1 Platform foundations | Done — `abffb34` | `2026-09-15-diploma-tracker-system-design.md` §5 | `2026-09-15-platform-foundations-and-academic-structure.md` |
| 2 Academic structure | Done — `65f190d`, review fixes `0e909bc` | same, §6 | same |
| User onboarding | Done — commit `Implement user onboarding` | `2026-09-16-user-onboarding-design.md` | `2026-09-17-user-onboarding.md` |
| 3 Design system | Done — commit `Implement design system and structure refinements` | `2026-09-17-design-system-design.md` | `2026-09-17-design-system.md` |
| Structure and administration refinements | Done — commit `Implement design system and structure refinements` | `2026-09-17-structure-and-administration-refinements-design.md` | `2026-09-17-structure-and-administration-refinements.md` |
| 4 Topics and reservation | Done — commit `Implement thesis topics and reservation` | `2026-09-17-topics-and-reservation-design.md` (amended 2026-09-18) | `2026-09-17-topics-and-reservation.md` |
| 5 Submission and review | Done — commits `Added basic submission workflow`, `Complete submission and review` | `2026-09-17-submission-and-review-design.md` | `2026-09-17-submission-and-review.md` |
| 6 Document templates | Done — commit `Implement document templates` | `2026-09-17-document-templates-design.md` (amended 2026-09-19) | `2026-09-17-document-templates.md` |
| 7 Document preview and commenting | Deferred by the owner; revisit after phase 6 | — | — |
| 8 Hardening and polish | Done — commit `Implement hardening and polish` (line endings pinned separately in `Normalise line endings`) | `2026-09-21-hardening-and-polish-design.md` | `2026-09-21-hardening-and-polish.md` |

Build order: onboarding → 3 → 4 → 5 → 6 → 8. Specs live in `docs/superpowers/specs/`, plans in
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
- Tests to write in the end-of-project testing pass are collected in
  `docs/superpowers/test-backlog.md`, one section per phase.
- Closed by phase 8: the parked phase 8 scope itself, the template-replacement race (now a
  `RowVersion` on `DocumentTemplate`) and the 413 message that talked about student imports (now
  the neutral `request.tooLarge`).
- Still open from phase 6, deliberately: template generation and upload have **no concurrency
  cap** (owner accepted the risk 2026-09-19 — both are CPU-bound and any signed-in user can call
  generate); `{{supervisor.email}}` shows a student the supervisor of any catalogue topic they
  pick, although the topic list hides it (owner: intended, staff emails are public).
- Accessibility pass (request sequencing, modal initial focus, segmented-control keyboard
  behaviour, loading states announced, progress-matrix keyboard access): parked until the owner
  has consulted on it; not in phase 8.
- Rate limiting is built but switched off (`RateLimiting:Enabled` = `false` in `appsettings.json`) and stays that way by the owner’s decision (2026-09-19); it is not in phase 8. Before enabling: forwarded-headers handling for a reverse proxy, a per-IP budget that suits a classroom behind one NAT (login and claim share one budget), and whether `PUT /api/auth/password` needs a limit.
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
- Uploaded files are stored under `Storage:RootPath` (Development: `App_Data/uploads`, resolved
  against the content root to `backend/DiplomaTracker.Api/App_Data/uploads`, git-ignored as
  `App_Data/`); hosted deployments set `Storage__RootPath`. Startup validation refuses a
  missing or unwritable path.
- `DocumentFormat.OpenXml` 3.5.1 is referenced by the API for template scanning and generation
  (phase 6). Template uploads are also bounded before parsing: at most 1,000 zip entries, 100 MB
  uncompressed, 20 MB of `word/*.xml`, XML depth 128.
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
- **Lint baseline:** 0 errors, 0 warnings (since phase 5).
- **EF design-time tooling needs no secrets:** configuration validation runs after
  `builder.Build()`, where design-time host resolution stops.
- **Recreating the schema:** `dotnet ef database drop --force --project
  DiplomaTracker.Api -- --environment Development`, then start the API; it applies
  migrations and re-seeds. Hand-created rows are not recreated.
- **Every machine must drop its own database when `InitialCreate` is regenerated.** The new
  migration has a new id, so a database that recorded the old one fails at startup with
  "There is already an object named 'Faculties'" (`Program.cs` runs `MigrateAsync`). Ask the
  owner before dropping.
- **Student steps exist on join, never on read.** `GroupTaskService` creates a `StudentTask` row
  for every current member when a step is assigned, and `LateJoinerTaskAssigner` creates the
  missing rows when a student joins or moves into a group. Reads never create rows; a new
  path that adds a student to a group must call `LateJoinerTaskAssigner`.
- **Visibility** for teachers goes through `IAccessScope` (groups they review, or where they
  supervise a student); new group- or student-scoped queries must use it. A hidden resource
  answers exactly like a missing one — same status, code and message.
- **Never upload a picked `File` handle directly.** Chrome aborts with
  `net::ERR_UPLOAD_FILE_CHANGED` when the file's bytes changed on disk after it was picked (the
  natural "fix it in Word and press Save again" loop), and `fetch` rejects with a plain
  `TypeError` that looks like "no connection to the server" while the server never sees the
  request. Snapshot the bytes at submit (`await file.arrayBuffer()`, upload a fresh `File`) and
  map a read failure to "the file changed on disk, choose it again".
- **A new child row with a preset `Guid` key must be added through its `DbSet`, never only through a tracked parent's collection.** Reached through the navigation, EF takes it for an existing row and sends an `UPDATE` that affects nothing (`DbUpdateConcurrencyException`, a 500). This broke a second archiving of a reviewed group until 2026-09-22.
- **A step template can be deleted only while no group has it** (`DELETE /api/task-templates/{id}`, `taskTemplate.assigned` 409 otherwise); a faculty holding any step template still cannot be deleted.
- **Template markers** are matched per paragraph after joining its runs, in body, tables,
  headers, footers, footnotes, endnotes and comments; anything between `{{` and `}}` counts, so
  an unknown key is refused at upload. A new key needs an entry in `MarkerVocabulary` **and** in
  `templates.markerDescriptions` in both translation files. `{{group.code}}` is the group marker —
  there is no `group.name`.
- **A template upload is refused if it carries active or external content** (macros, embedded or
  ActiveX objects, altChunk, custom UI, external relationships other than http/https/mailto
  hyperlinks, an attached template, or INCLUDE/LINK/DDE fields), because every generated copy is
  handed to students and staff. Ordinary `HYPERLINK` fields and tables of contents are fine.
- **Every `DateTime` on the wire is UTC and ends in `Z`.** `UtcDateTimeJsonConverter` is
  registered globally in `Program.cs`; an offset-less value sent to the API is read as UTC, so
  the client must send UTC instants (the admin UI converts local input). Never introduce
  `DateTime.Now` or `ToLocalTime` on the server.
- **The InMemory provider enforces neither foreign keys nor unique indexes;** constraint
  behaviour is only proven against SQL Server.
- Subagents have no browser. Browser checks run from the controller session through the
  in-app browser, and sign-in there is done by the owner.
- **Rate limiter is off by configuration.** With `RateLimiting:Enabled` = `true`, `login` and `claim` allow 10 requests per minute per IP; scripted checks must then pace their calls or they receive 429.
- **Seed student number** is `SEED-0001`; imported and claimable test students need their own unique numbers.
- **`.superpowers/sdd/` is never committed** (it has its own ignore file, and it does not travel between machines — a handoff must be self-contained). `.superpowers/checks/` **is** committed, despite the stale-looking `.gitignore` entry: the scripts were added with `git add -f` on 2026-09-18 and tracked files stay tracked.
- **A bearer token is re-checked against the account on every request.** `SessionStateValidator` re-reads the user behind the token; an archived, deactivated, role-changed or access-reset account is refused at once with 401 rather than staying valid until the token expires. Never add a path that trusts the claims alone.
- **Uploads are an allowlist, inspected as packages.** One `OfficePackageInspector` serves every upload path: the file is opened and must carry the parts its extension claims. Supporting files are `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`/`.jpeg` and nothing else. A test fixture that is a few bytes of ZIP header is no longer a valid `.docx` — build genuine packages, as `hardening-check.mjs` does.
- **`StudentProfile.TopicId` is the single source of truth for a student's topic**; `TopicReservations` is history plus any pending change request. Never decide "this student holds this topic" from an `Approved` reservation.
- **The archive shares storage keys with live files** — it copies rows, never bytes. **A stored file is deleted only when nothing points at it any more**: `ArchiveService.PurgeGroupAsync` checks both `SubmissionFiles` and other groups' `ArchivedFiles` first. Deleting a still-referenced blob would destroy a live student's submitted work.
- **Group deletion deletes student accounts** — the only place in the system that does. A group with an active student is still refused; a group whose remaining students are all archived deletes their profiles and accounts after the archive has their full record. Irreversible by design.
- **Student identity is canonical, not literal.** `StudentProfile.StudentNumberCanonical` carries the uniqueness: whitespace and `-_/.` stripped, upper-cased, Cyrillic lookalikes folded to Latin. `KB 123` and Cyrillic `КВ123` are one student. The entered spelling is still what is displayed.
- **Check scripts clean up in a `finally`.** Every script registers each undo as it creates the thing, and `checkCleanup.mjs` drains the registry newest-first whether the run passed or failed. Never add a "skip cleanup when something failed" branch — a failed run is exactly when leftovers accumulate. **An undo must return its final API response**: the registry reports any error status except 404 by name, and an undo that returns nothing is counted as done whatever happened — that is how every script printed "nothing left behind" while leaking.
- **`.gitattributes` pins line endings**: LF in the repository, CRLF on checkout. Do not add editor settings that fight it.
- **Error contract:** every API error is `{ code, message }` (`fields` for `validation.failed`, `errors` for import rows); codes live in per-area catalogues and are translated in `src/i18n/{uk,en}.json`. Never compare message text.
- **Check scripts** (`.superpowers/checks/`) run against the live local database. They are committed (they were git-ignored until 2026-09-18). Uniqueness across runs is carried by **codes, emails and student numbers**, never by the academic year — the year is a realistic `2026/2027` and the format rule now rejects stamped values. Every student a script creates lives in a group the script created; `removeGroup` in `checkCleanup.mjs` archives them in place, deletes the group (which deletes their accounts, §4.7) and purges the archive entry. Faculties, departments and step templates go through `cleanup.addLast`, which runs after every other undo. Only deactivated staff accounts remain after a run — there is no staff deletion.
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

- 2026-09-21 — Phase 8 implemented: per-request session validation and a 12-character administrator password, a security-event vocabulary applied across 14 services, one Office-package inspector for every upload with an allowlist for supporting files, a canonical student number that folds Cyrillic lookalikes, `StudentProfile.TopicId` as the single source of truth for a topic, the archive (three self-contained entities, shared storage keys, purge that deletes a blob only when nothing points at it), group deletion that deletes archived students' accounts, a row version on `DocumentTemplate`, projection-based reads, a paged review queue, overdue steps and lateness counted in steps, three real dashboards, step-template reordering, the archive pages, and check scripts that clean up in a `finally`. `InitialCreate` regenerated and the local database dropped with the owner's permission. **Every other machine must drop its own database when it next pulls** — the migration has a new id. Not done in this session and outstanding: the whole-plan review, the test project (202 mechanical compile errors from the signature changes in tasks 2 and 6), and four check-script defects — see `handoffs/2026-09-21-phase-8-complete.md`.
- 2026-09-16 — Phase 2 committed (`65f190d`); branches reorganised to
  `master` ← `dev` ← `phase1-2`; this file created.
- 2026-09-17 — Designs for onboarding and phases 3–6 approved and committed; phase 7 deferred.
- 2026-09-17 — Implementation plans written for onboarding and phases 3–6.
- 2026-09-17 — User onboarding implemented: CSV import, account claiming, registration switch, password management.
- 2026-09-17 — Onboarding refined: an access reset reopens only that student's account (`ClaimReopened`), account events are logged, rate limiting switched off, group details show student number and claim status.
- 2026-09-18 — Design system and structure refinements implemented: `{ code, message }` error contract, Tailwind 4 + Headless UI component library, uk/en interface, group codes, steps per faculty with start dates, administrators page, student archiving, steps for late joiners.
- 2026-09-18 — Owner notes from the phase 3 browser test applied: academic year restricted to digits and `/ \ - .` (max 20, `validation.failed` with `format`), `Group.Name` removed entirely so the code is the only group identity, step template `Order` unique per faculty (`taskTemplate.orderTaken` on create; an update moves the step and shifts its neighbours), check scripts use realistic academic years and delete every group they create.
- 2026-09-20 — Phase 6 implemented: Word templates with a 20-marker vocabulary, per-template audiences (groups, named teachers, all teachers, all students), upload validation (package safety, marker scanning, size and depth limits), generation filling body, tables, headers, footnotes and endnotes, the Documents page for every role, and `templates-check.mjs` (60 checks). Whole-plan review (0 Critical, 3 Important) and security audit (1 High, 2 Medium) fixed in one wave; the scoped re-review's two Important defects in the field-code check fixed; walkthrough passed with the owner opening generated documents in Word. Owner decisions: no concurrency cap (accepted risk), `{{supervisor.email}}` stays visible to students, generation clears author document properties.
- 2026-09-20 — Owner's manual test of phase 6 produced two fixes (commit `Fix template upload retry and fill a student's own topic`): a retried upload now snapshots the file's bytes at Save, so fixing a refused template in Word and pressing Save again works instead of failing with a misleading "no connection" message; and a student's document is filled from their own topic (approved or reserved) — naming a catalogue topic is refused, and the dialog offers a choice only when an approved topic and a pending change request both exist.
- 2026-09-19 — Parked items triaged by the owner: twenty go to phase 8 (prompt in `handoffs/2026-09-19-phase-8-design-prompt.md`); rate limiting stays off, registration identity proof and structure readability stay as they are, the walkthrough notes are dropped, the accessibility pass stays parked.
- 2026-09-19 — Phase 5 implemented: step submissions with a main document and up to three supporting files, versioned resubmission, reviewer approve (mark 0–100) / return (comment), strict step order, late flag, secured downloads, review queue, group progress matrix, student and teacher dashboards. Whole-plan review (0 Critical, 7 Important) and security audit (1 High, 3 Medium) fixed in one wave; the scoped re-review's two new Minors fixed; seven-step browser walkthrough passed. All API dates now serialise as UTC. Phase 8 "Hardening and polish" opened.
- 2026-09-19 — Phase 4 implemented: topic catalogue, reservations, student proposals, change requests for an approved topic, administrator assignment from the student form (`PUT /api/students/{id}/topic`), administrator amendment of a topic at any stage, and the global selection deadline on a new Settings page. Reviewed in two halves (backend 1 Critical / 8 Important, frontend 2 Critical / 9 Important); one fix wave and a scoped re-review returned 39 of 40 findings fixed with no new defects.
