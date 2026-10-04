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
| Session handoffs (latest: `2026-09-28-phase-12-planned.md`) | `docs/superpowers/handoffs/` |
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
| 7 Document preview and commenting | Deferred by the owner; the last increment, after phase 12 | — | — |
| 8 Hardening and polish | Done — commit `Implement hardening and polish` (line endings pinned separately in `Normalise line endings`), follow-ups `Fix test project and check scripts`, `Apply whole-plan review fixes` | `2026-09-21-hardening-and-polish-design.md` | `2026-09-21-hardening-and-polish.md` |
| 9 Review panels | Done — commit `Implement review panels` (branch `feature-dms`) | `2026-09-24-review-panels-and-document-routing-design.md` §3 | `2026-09-24-review-panels.md` |
| 10 Document routing | Done — commit `Implement document routing` (branch `feature-dms`) | same, §4 | `2026-09-24-document-routing.md` |
| 11 Directions, topic approval and standards control | Done — commit `Implement directions, topic approval and standards control` (branch `phase11-12`) | `2026-09-27-directions-topic-approval-and-standards-control-design.md` | `2026-09-27-directions-topic-approval-and-standards-control.md` |
| 12 Scoped staff roles | Done — commit `Implement scoped staff roles` (branch `phase12`) | `2026-09-27-scoped-staff-roles-design.md` (amended 2026-09-28) | `2026-09-28-scoped-staff-roles.md` |

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
  (`StudentProfileId` where `Pending`, and where `Approved`), never one combined index. Task 7
  bug 9 (2026-09-24) blocks the *student-initiated* path to this state: `reserve`/`propose` now
  refuse outright (`reservation.topicHeld`) once `StudentProfile.TopicId` is set, so a student can
  no longer file a new competing Pending request. The mechanism itself (and the two indexes) is
  unchanged and still serves an already-pending legacy request, which can still be decided or
  cancelled, and an administrator's direct `PUT /api/students/{id}/topic` replacement.
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

- **Deployment:** Docker Compose (`docker-compose.yml`, guide `docs/deploy.md`) on a shared university Ubuntu 24.04 server — about 40 other students' containers, our login is in the `docker` group without sudo, and our one public port is **4047**. Only `web` (nginx) is published; it serves the bundle and proxies `/api` to `api`; `db` is SQL Server 2022 Express capped at 2 GB. Settings live in a git-ignored `.env` (template `.env.example`). `VITE_API_BASE_URL` is baked in at build time from `PUBLIC_URL`. Locally the stack runs in WSL (Ubuntu-22.04, Docker Engine, no Docker Desktop) from the Windows checkout. The server cannot read the private repositories, so a branch is packed with `git archive` and copied with `scp` (`docs/deploy.md`); the owner runs every server command themselves. Copies of `master` and `dev` also live in the university repo `github.com/2026-TV-52mp/Cherniak_VP` (remote `university`; the owner is not its admin, so no deploy keys).

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
- **Visibility** for staff goes through `IAccessScope`, by acting role: a supervisor (teacher) and the manager of a student's topic's direction open the student in full (`ReviewableStudents`); an extra reviewer and a standards controller open only their step. A staff member's groups are the groups of the students they work with (`ReviewOverviewStudents`). New group- or student-scoped queries must use it. A hidden resource answers exactly like a missing one — same status, code and message.
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
- **A student submits work only while holding a topic** (`StudentProfile.TopicId` set), refused with `step.topicRequired` otherwise. A check script whose students submit gives each one a topic first, via `giveTopic` in `checkCleanup.mjs`.
- **Demo data** for walkthroughs and the defence: `.superpowers/demo/seed-demo.mjs` (Ukrainian faculty ФІОТ beside the seed, every demo password `Demo2026!`, accounts and a walkthrough in `.superpowers/demo/README.md`). Run it on a freshly seeded database; after a check-script run, drop and re-seed first if the demo should not show the deactivated test accounts.
- **Real department data** (what the server and `docs/qa/test-cases.md` use): `.superpowers/demo/seed-kpi.mjs` loads кафедра ІПЗЕ (ННІАТЕ) with groups ТВ-51мп/ТВ-52мп, 32 students and topics from the October 2026 practice-defence list, 16 supervisors, 8 directions and 11 thesis steps. E-mails are `staffN@test.data` / `studentN@test.data` (never real addresses in the repo), student numbers random. Admin-only and resumable; runs against the server via `API_URL=http://SERVER_IP:4047`. Students have no password until they claim; topics are admin-assigned with direction-manager and supervisor seats pending. Claude may not type passwords into the server, so the owner runs it.
- **`StudentProfile.TopicId` is the single source of truth for a student's topic**; `TopicReservations` is history plus any pending change request. Never decide "this student holds this topic" from an `Approved` reservation.
- **The archive shares storage keys with live files** — it copies rows, never bytes. **A stored file is deleted only when nothing points at it any more**: `ArchiveService.PurgeGroupAsync` checks both `SubmissionFiles` and other groups' `ArchivedFiles` first. Deleting a still-referenced blob would destroy a live student's submitted work.
- **Group deletion deletes student accounts** — the only place in the system that does. A group with an active student is still refused; a group whose remaining students are all archived deletes their profiles and accounts after the archive has their full record. Irreversible by design.
- **Student identity is canonical, not literal.** `StudentProfile.StudentNumberCanonical` carries the uniqueness: whitespace and `-_/.` stripped, upper-cased, Cyrillic lookalikes folded to Latin. `KB 123` and Cyrillic `КВ123` are one student. The entered spelling is still what is displayed.
- **Check scripts clean up in a `finally`.** Every script registers each undo as it creates the thing, and `checkCleanup.mjs` drains the registry newest-first whether the run passed or failed. Never add a "skip cleanup when something failed" branch — a failed run is exactly when leftovers accumulate. **An undo must return its final API response**: the registry reports any error status except 404 by name, and an undo that returns nothing is counted as done whatever happened — that is how every script printed "nothing left behind" while leaking.
- **`.gitattributes` pins line endings**: LF in the repository, CRLF on checkout. Do not add editor settings that fight it.
- **Error contract:** every API error is `{ code, message }` (`fields` for `validation.failed`, `errors` for import rows); codes live in per-area catalogues and are translated in `src/i18n/{uk,en}.json`. Never compare message text.
- **Check scripts** (`.superpowers/checks/`) run against the live local database. They are committed (they were git-ignored until 2026-09-18). Uniqueness across runs is carried by **codes, emails and student numbers**, never by the academic year — the year is a realistic `2026/2027` and the format rule now rejects stamped values. Every student a script creates lives in a group the script created; `removeGroup` in `checkCleanup.mjs` archives them in place, deletes the group (which deletes their accounts, §4.7) and purges the archive entry. Faculties, departments and step templates go through `cleanup.addLast`, which runs after every other undo. Only deactivated staff accounts remain after a run — there is no staff deletion.
- **i18n:** `npm run i18n:check` validates that uk and en have the same keys and each language's own plural categories (uk one/few/many, en one/other).
- **A step’s review panel is derived, never stored.** It is the student’s current supervisor plus `StudentTaskReviewers`. `ReviewPanel.Evaluate` decides from the facts `StudentWorkflowService.LoadPanelFactsAsync` loads. Approvals stick across versions; an extra seat counts only approvals given after it was added. Group reviewers watch and change panels but never decide. A reviewer whose seat reopened on a version they already decided (removed and re-added, or moved to another seat) re-decides by overwriting their `SubmissionReview` row, because of the unique (submission, reviewer) index. A resubmission that finds every seat already approved is approved at once.
- **Every decision and panel change touches `StudentTask.UpdatedAt`**, so the step’s `RowVersion` serialises them. A new write path on a step must do the same.
- **Routed documents are visible to participants only** — the owner and everyone in the timeline. Administrators have no special access. Every write, delete included, carries `expectedSequence`; a stale view gets `document.changed`.
- **Account deletion releases documents first.** `DocumentService.ReleaseForDeletedAccountsAsync` runs inside `GroupService.DeleteGroupAsync`'s transaction. It deletes the student's own documents, returns documents they hold to the owners, and nulls their ids in other timelines; the user foreign keys are `NoAction` because SQL Server refuses a second cascade path. Blobs go only after the commit. It uses `ExecuteDelete`/`ExecuteUpdate`, which the InMemory provider cannot run.
- **`templates.title` is "Templates";** the *Documents* page is a shell over four sections, and `?section=` selects one.
- **"Your decision" means a seat on the panel.** `isMyDecision`, the *Waiting for my decision* filter and the dashboards' "mine" lists count only steps where the caller is the supervisor or an extra reviewer with an undecided seat. An administrator's stand-in power never counts (`ReviewPanel.SeatFor(..., allowAdminStandIn: false)`).
- **A student who holds a topic cannot reserve or propose another** (`reservation.topicHeld`, 409); only an administrator changes it. A change request already pending may still be decided or cancelled.
- **A staff dashboard's groups are `VisibleGroups` for the acting role, and each row counts only the students the caller works with in that role.** Every group view splits *My students* from *Others*; others never open.
- **A topic request is open while `Pending` or `Returned`,** and it becomes the student's topic only when `TopicApprovalPanel` finds all three seats satisfied: any administrator, the current direction manager and the current supervisor, each by an `Approved` or `Edited` `ReservationDecision` no older than `ContentChangedAt`. The creator's seats start approved. Completion happens in the save of the approval that fills the last seat, or through `CompleteSatisfiedRequestsAsync` after a change of supervisor, direction or manager. The student's `SupervisorId` is written only at completion.
- **A catalogue topic gets its wording back when its request ends without approval** (rejected or cancelled): `TopicReservation.TopicTitle`/`TopicDescription` are the snapshot. A release keeps the current wording.
- **Step panel seats are Supervisor, DirectionManager, Extra and StandardsControl, one per person, first match wins.** The direction manager comes from the student's topic's direction and the standards controller from `GroupTask`. Neither is ever copied to the student step, so late joiners and manager changes need nothing stored — but a manager change or an administrator's move of an approved topic calls `RefreshStudentPanelsAsync`, which touches the affected unapproved steps and completes those now satisfied. The standards control seat never carries a mark. An approved step shows only its satisfied seats (`PanelState.AsApproved()`), so a seat added later never reads as *Waiting*.
- **Staff roles are assignments, and a session acts in one.** `AppUser.Role` is `Admin`, `Staff` or `Student`; a staff member's roles are `RoleAssignment` rows (role + faculty/department/group). The token's role claim is the acting role (`Teacher`, `DirectionManager`, `StandardsController`, or `Staff` for none), switched with `POST /api/auth/acting-role`. `SessionStateValidator` refuses a staff claim the account no longer holds anywhere. Every visibility rule, queue, panel seat and topic-request seat keys on the acting role; `UserContext.IsStaff` means any staff account.
- **Coverage is checked when work is taken on, never when held work is decided.** `RoleCoverage.CoversGroupAsync` / `CoversDepartmentAsync` (active staff only; a faculty covers its departments and groups, a department its groups). A caller outside their own scope gets `scope.notCovered`; naming someone who does not cover gets the field's `…Invalid` code. Removing an assignment is refused (`roleAssignment.inUse`, with `errors: [{ kind, label }]`) while work in its scope depends on it and no other assignment of the same role covers it. Deleting a place deletes its assignments.
- **Check scripts create staff with `makeStaff` and roles with `grantRoles`** (`checkCleanup.mjs`); both undo in the late phase. `giveTopic` gives the given teacher the teacher and direction-manager roles for the department first. Scripts act in another role with `actAs`.
- **The archive is read by the supervisors recorded in it.** `ArchivedFile.SupervisorId` / `ArchivedReview.SupervisorId` are the student's supervisor at archiving time; an acting teacher sees only those rows. There are no group reviewers any more. Both archiving paths (`StudentService.ArchiveStudentsAsync`, `GroupService.ArchiveGroupStudentsAsync`) snapshot supervisors **before** settling reservations, because settling clears `StudentProfile.SupervisorId`.
- **Port 5000 on the first machine** can be taken by `CS_GO_Arx_Applet.exe` (Logitech Arx). If the API will not start, ask the owner to close it.

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

- 2026-10-02 — Practice report (Ukrainian, ~45 pages, uncommitted for the owner to review) in `docs/practice-report/` (only the .docx and the PDF are kept in the repository). Its generator lives outside the repository, on the first machine only, in `..\practice-report-sources\` next to the checkout: `src/*.js` (one module per chapter, sources numbered by first citation) with `node src/build.js <out.docx>` (needs the `docx` npm package on NODE_PATH), then `src/finalize.ps1` makes Word fill the table of contents and export the PDF. Diagrams are HTML rendered by `figures/render.sh`; screenshots come from the dev servers with demo data. Base of practice: ОКБ «Шторм» НДЧ КПІ (facts from its 2019 regulation, order № 7/68).
- 2026-10-02 — First server deployment live on port 4047 from `master` (commit `Add Docker deployment`, merged via `dev`): built and started on the university server, admin sign-in works from outside. `master` and `dev` pushed to the university repo with full history. `docs/deploy.md` switched from `git clone` to the archive-and-copy route.
- 2026-10-02 — Real department data replaces the fictional demo for the server and the QA docs: `seed-kpi.mjs` added, `docs/qa/test-cases.md` rewritten around real accounts (claim flow in ТК-01, admin-assigned topics approved in ТК-03, a four-seat panel in ТК-05; expected marks 92 and 91 confirmed by a local API run), user manual §11 updated. Loaded on the server (77.47.192.6:4047) the same day from the browser as admin: the owner typed the 16 staff passwords, everything else went through the page's API calls. Typos in the source list were corrected in the data (Олесандрович, единоi, Latin С in «Cистема», «транспорті», Пироговска/Володимірівна).

- 2026-10-01 — Docker deployment added (uncommitted on `phase12`; the owner moves it to `dev` after merging): three-container compose stack, Dockerfiles, nginx config, `.env.example`, `docs/deploy.md`, LF rules for deployment files in `.gitattributes` (the repo-wide `eol=crlf` would otherwise give the server CRLF `.env` files). Verified in WSL on port 4047: health 200, admin sign-in through nginx, uploads volume writable, data survives `down`/`up`. Rate limiting stays off behind the proxy until the API reads `X-Forwarded-For`.
- 2026-09-29 — Phase 12 implemented (commit `Implement scoped staff roles`, branch `phase12`): role assignments per faculty/department/group for teacher, direction manager and standards controller; the acting role as the token's role claim with a switcher in the user menu; `/api/staff` and the *Staff* pages with add/remove role and removal blockers; coverage checked when work is taken on; group reviewers removed (group-step writes are the administrators'); the archive stamped and read by supervisor; one tab set and dashboard per role. O1 from phase 11 is fixed (`ReservationService.CompleteAsync` refreshes the student's steps on a replacement). `InitialCreate` regenerated, so **every machine must drop its database**. All twelve check scripts pass, 561 checks: scoped-roles 49 (new), directions-approval 70, topics 73, review-panels 38, workflow 47, hardening 64, document-routing 40, templates 50, refinements 53, onboarding 54, design-system 13, fix-wave-backend-extra 10. Running the scripts found one real defect: archiving settled reservations before stamping the supervisor, so every archived row recorded none. Whole-phase review: 0 Critical, 1 Important (pickers offering people and departments the server refuses, and a 20-item cap on managers), 11 Minor; the Important and six Minors (m1, m2, m4, m6, m8, m10) fixed in one wave, and the scoped re-review found all fixed with nothing new. Deferred minors: m3 (a direction move can leave catalogue topics with supervisors who do not cover the new department), m5 (the template "named teachers" audience offers fewer people than the server accepts), m7 (a standards controller's step visibility and student list disagree after a group move), m9 (the extra-reviewer picker does not check the caller can see the step), m11 (losing the acting role ends the session instead of switching roles).
- 2026-09-28 — Phase 12 plan written (`2026-09-28-scoped-staff-roles.md`, seven tasks, one commit) with handoff `2026-09-28-phase-12-planned.md`. The design was double-checked and amended: group reviewers also assigned steps (now the administrators' only); supervision follows the student's group and publishing the topic's department, so a group-level teacher supervises proposals but publishes nothing; removal is also blocked by supervised topics and open extra-reviewer seats, and freed by another assignment of the same role; the archive stamps each row's supervisor; deleting a place deletes its assignments; coverage is checked only when work is taken on; topic approvals stay by person. Planning rulings: the acting role is the token's role claim (`Staff` for none), `/api/teachers` becomes `/api/staff`, staff routes move to `/staff/*`, one `/api/dashboard/teacher` serves the three staff roles. The plan also carries phase 11's O1 (Task 3 Step 2). Nothing implemented yet.

- 2026-09-27 — Phase 11 walkthrough follow-ups (commit `Apply phase 11 walkthrough fixes`): the supervisor seat reads *Науковий керівник*; topic lists under *Topics* and *Directions* show *Approve* on rows waiting for the caller (`useWaitingApprovals`, `TopicApproveButton`); direction counts reload after topic changes; the request history strikes out approvals older than `ContentChangedAt` (now on `ReservationResponse`) and shows the student's resubmission; the group page's *Start date (optional)* sits in line with its neighbours. The phase 12 design now removes group reviewers (§4.1). `directions-approval-check` 70/70 and `topics-check` 73/73 after the change.

- 2026-09-27 — Phase 11 implemented (commit `Implement directions, topic approval and standards control`): directions under departments with a manager, the two capability flags on teachers, a three-seat topic approval with return, reject, wording edits and resubmission, and direction-manager and standards-control seats on step panels. `InitialCreate` regenerated, so **every machine must drop its database**. All eleven check scripts pass (511 checks, 70 in the new `directions-approval-check.mjs`; `topics-check` 73). Whole-phase review: 0 Critical, 3 Important, 13 Minor; all Important and twelve Minors fixed in one wave (M11 needed no change: groups have no archived state), and the scoped re-review found all fixed with nothing new. Parked: M5 (approve/return/reject answer `approval.notApprover` rather than 404 to an unrelated teacher, as the spec says); O1 (completing an administrator's topic replacement moves the supervisor and manager step seats without refreshing the student's steps — fix by calling `RefreshStudentPanelsAsync` from `CompleteAsync` phase 2) — fixed in phase 12; O2 (an approved step whose supervisor later changed can show an empty panel card); O3 (a controller absorbed into an earlier seat never counts as *passed standards control*); O4 (`MapGroupTask` leaves the new counters at 0, unused).

- 2026-09-27 — Phase 11 plan written (`2026-09-27-directions-topic-approval-and-standards-control.md`, seven tasks, one commit) with handoff `2026-09-27-phase-11-planned.md`. Planning rulings: `Topic.CreatedById` is null for proposals; two extra codes (`direction.departmentInvalid`, `department.hasDirections`); adding a step's direction manager or standards controller as an extra reviewer answers `panel.reviewerExists`; `giveTopic` opens a direction per call. Nothing implemented yet.
- 2026-09-27 — After the demo the owner asked for direction managers with directions, a three-way topic approval and standards controllers (phase 11), and scoped staff roles (phase 12). Both designed and approved in separate files. Owner decisions: in phase 11 the two new responsibilities are **flags on teacher accounts** (phase 12 replaces them with role assignments per faculty/department/group); a direction lives in a department and every topic has one; a reserved topic needs approval from any administrator, the direction manager and the supervisor, and the creator's own seats start approved; an approver may **return** (the student edits the wording, catalogue topics included, and resubmits) or **reject**; an approver's wording edit keeps their approval and resets the others, edits after approval are admin-only and reopen nothing; administrator assignment carries the admin's approval but still needs the other seats; the direction manager sits on every step panel of their direction's students with a mark; the standards controller is set per **group step** from the *Steps* tab (derived seat, late joiners included) and approves without a mark. Phase 12: role switcher, admins assign, a scoped teacher can do everything a teacher does today within scope.
- 2026-09-24 — Owner's pre-demo test produced nine fixes (commit `Fix pre-demo review, dashboard and topic issues`): no "Your decision" tag for administrators or watching group reviewers; the tags and badges sit in their own columns; every group view splits My students / Others; dashboard groups include supervised students' groups, so the tile, the table and the Groups tab agree; a new *Waiting for review past the deadline* block; the document page's back link moved top-left; the Pass on dialog's picker and segmented control keep their rounded highlights; a student with a topic can no longer reserve or propose another. This replaces the 2026-09-23 rule that the dashboard lists only reviewed groups, and the phase 4 student change request. Whole-change review: 0 Critical, 6 Important (all fixed), 9 Minor (7 fixed). All ten check scripts pass (436). Browser walkthrough passed for admin, Петренко, Шевчук and Бондаренко.
- 2026-09-24 — Owner follow-ups to phase 9 (commit `Guard topic removal and list students on the review page`): a topic can no longer be released or cleared once the student has submitted any step (`reservation.hasSubmissions`, 409; replacing it with another topic is still allowed); a step opened from a group view returns to that group (router state, `/review` fallback); the *Review* tab lists the caller's students with their current step, status, late/overdue flag and a state filter (`GET /api/review/students`, rows waiting for the caller's decision first, a row is clickable only when the caller can open that step). `/api/review/queue` is kept for the dashboards and scripts. All ten check scripts pass (440).
- 2026-09-24 — Phase 10 implemented (commit `Implement document routing`): routed documents with one holder at a time, hand-offs for review or signing, reject to an earlier holder, recall, versions, a numbered timeline, participant-only visibility, `expectedSequence` on every write, account deletion that releases documents, the *Documents* page split into four sections with a badge, and a document page. `InitialCreate` regenerated, so **every machine must drop its database**. All ten check scripts pass (440 checks, 40 in the new `document-routing-check.mjs`). Whole-phase review: 0 Critical, 2 Important, 17 Minor; both Important and eleven Minors fixed in one wave, and the scoped re-review found all fixed with nothing new. Deferred minors: M3 (an owner edit does not move the sequence), M5 (default reject target right after a rejection), M12 (a race during account deletion becomes a 500), M13–M15 (an extra query per released document, whole user rows loaded, no cancellation tokens).
- 2026-09-24 — Phase 9 implemented (commit `Implement review panels`): review panels with the supervisor plus extra reviewers per student step, sticky approvals, the rounded average mark, a staff picker, step-level visibility for extra reviewers, archived reviews. `InitialCreate` regenerated, so **every machine must drop its database**. All nine check scripts pass (400 checks, 38 in the new `review-panels-check.mjs`). Whole-phase review: 0 Critical, 2 Important, 12 Minor; both Important and ten Minors fixed in one wave, and the scoped re-review found all 13 fixed with nothing new. Parked: a topic change that absorbs the last open extra seat while the step is `Submitted` leaves it waiting (workaround: add and remove any reviewer); the staff picker returns emails (staff emails are public); an absorbed extra row stays hidden and revives if the supervisor changes back.
- 2026-09-24 — Owner asked for two features before the demo: several reviewers per step, and a document routing system under the *Documents* tab. Designed together (`2026-09-24-review-panels-and-document-routing-design.md`) and planned as phase 9 (review panels) and phase 10 (document routing), each with its own plan and single commit. Owner decisions:
  - **Panels:** the supervisor always reviews; extra reviewers are added per student step by the supervisor, group reviewers or administrators; every reviewer marks or returns; approvals stick after a return; the mark is the rounded average; group reviewers only watch.
  - **Documents:** every role has them; one holder at a time; each hand-off is for review or for signing; signing means uploading the signed copy; the existing *Documents* page is split into four sections.
  - **Order:** phase 7 (preview and commenting) is the very last increment. The review minors (M6, M7, M11, M12, D4, D5, D7) stay deferred.
  - **Status:** nothing is implemented yet; the owner wants every document finished first, so that subagents can start from the files.

- 2026-09-23 — Phase 8 closed out. The test project compiles again (56/56), and all eight check scripts pass (347 checks, 358 with the review's additions) and leave the seeded data exactly as they found it: students live in per-script groups removed through `removeGroup`, step templates are deleted (new `DELETE /api/task-templates/{id}`), and only deactivated staff accounts remain. The scripts exposed a real 500 when a reviewed group was archived twice (fixed). Whole-plan review: 0 Critical, 3 Important, 14 Minor. All three Important findings were fixed in one wave: group deletion archives every file it removes, including work that crossed groups; archiving a whole group's students settles their reservations; and the delete dialog names the accounts and files involved (`GET /api/groups/{id}/deletion-preview`). Nine Minors were fixed too. The scoped re-review found every item resolved and nothing new. `InitialCreate` was regenerated for wider archive name columns, so **every machine must drop its database again**. Deferred by the owner: M6 (dashboards count moved students' old steps), M7 (Cancel at the deadline), M11, M12, and deferred minors 4, 5 and 7. The review report's test list is in `test-backlog.md`.
- 2026-09-23 — The owner's walkthrough with Ukrainian demo data (`.superpowers/demo/`) led to two changes. First, a student can start work on the steps only once they hold a topic (`step.topicRequired`). Second, the teacher dashboard's group table lists only the groups the teacher reviews (§7.4), so its figures agree with the overdue list. All eight check scripts pass: 362 checks. **Superseded 2026-09-24 (task 7, bug 4/6 and its review's I5):** the group set widened to every group `IAccessScope.VisibleGroups` returns (reviewed, or a supervised student in it), and each row's figures narrow to the caller's own reviewable students for a group they only supervise in — so the "agrees with the overdue list" property is now per-group rather than "reviewed groups only".
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
