# Handoff: Resume phase 2 (academic structure)

Read this in full before dispatching any subagent. It carries everything the previous
session learned that is not in the spec or the plan.

## 1. Read this first — execution is blocked on a database permission

Task 13 dropped the local development database, as its plan text specifies. The
application's SQL login (`diploma_smoke`) can drop a database but cannot create one, so
the API could not rebuild the schema and `DiplomaTrackerDb` does not currently exist.

Every remaining runtime check (Task 13 steps 3–4, Task 14's endpoint script, the browser
checks in Tasks 15–16) needs it back. Either command, run by the user as a SQL Server
admin, restores it:

```
sqlcmd -S localhost -E -Q "ALTER SERVER ROLE dbcreator ADD MEMBER diploma_smoke;"
```

```
sqlcmd -S localhost -E -Q "CREATE DATABASE DiplomaTrackerDb; ALTER AUTHORIZATION ON DATABASE::DiplomaTrackerDb TO diploma_smoke;"
```

Afterwards the API recreates the schema from `InitialCreate` and re-seeds on startup.
**Do not grant this yourself** — it is a security-settings change on the user's machine.
Confirm the database exists before resuming.

Also worth knowing: the drop removed rows the user had created by hand while testing (a
group `Test group1`, teachers named in Cyrillic). The seeder does not recreate those; it
creates only its own demo dataset. The user was told at the time.

## 2. The job

Finish phase 2 of the implementation plan:

- **Plan:** `docs/superpowers/plans/2026-09-15-platform-foundations-and-academic-structure.md`
- **Spec:** `docs/superpowers/specs/2026-09-15-diploma-tracker-system-design.md`
  (sections 3, 5, 6 are what the plan implements)

Remaining: Task 13 steps 3–4, then Tasks 14, 15, 16, 17. Phase 1 (Tasks 1–8) is
committed. Tasks 9–13 are implemented and uncommitted.

## 3. How the user wants this run — changed on 2026-09-16

These override the previous handoff and parts of the plan's own task text.

- **One review when the functionality is whole, not one per task.** The previous session
  reviewed every task individually. Do not. Implement the remaining tasks, then dispatch a
  single review over the finished phase. Cheap controller-side verification — checking what
  a commit contains, confirming a destructive step did what it should — is still worth doing
  inline.
- **Skip unit tests while implementing; cover everything in one pass at the end.** Core
  functionality first. Where the plan writes "write the failing tests" steps into a task,
  treat those steps as superseded. Plan an explicit testing increment after the
  functionality is complete. (The remaining tasks 14–17 contain almost no test-writing
  steps, so in practice this mostly means: do not add any, and schedule the testing pass.)
- **Commits: exactly one per phase.** Title line only — no body, no `Co-Authored-By`, no
  attribution of any kind. The phase 2 commit is `Implement academic structure` (Task 17).
  Subagents must not commit in any other task; tell each implementer explicitly
  "Do not run git commit or git add."
- **Documents read as a greenfield design.** Never frame docs as fixes to earlier broken
  code.
- Terse, direct communication. The user makes scope decisions; flag trade-offs rather than
  deciding them silently.

## 4. Repository state

- Branch `unit_tests`, no upstream. Remote `origin` has only `master`.
- History: `abffb34 Implement platform foundations` ← `fcf7b4d Add system design spec` ←
  `a92ca1f initial commit`. No amends, nothing pushed.
- `abffb34` was verified after the fact: single-line message, 44 files, no secrets in the
  committed settings files.
- Uncommitted (this is the phase 2 work, all of it): the new entities, services, DTOs and
  interfaces for the academic structure, the rewritten `GroupService.cs` and `DbSeeder.cs`,
  the regenerated `Migrations/` folder, and the test files.
- **Never stage:** `PROJECT_PAPER.md` (the user's thesis paper),
  `frontend/diploma-tracker-web/README.md`, anything under `docs/`.
  Task 17's `git add` list is deliberately narrow — use it as written.
- The untracked plan and handoff documents under `docs/` are not part of either phase
  commit. Ask the user what to do with them after phase 2.

## 5. What is done, and what it is worth

Phase 1, committed in `abffb34`: secrets moved out of the repository into user-secrets,
startup configuration validation, the admin bootstrapper and development seeder, the
composition root, the workflow-step status enum, untracked read-only queries, and the
frontend configuration and auth-module split. A security audit over that work returned
"safe to commit": development seed accounts cannot reach a hosted environment, no path
starts the app with a weak or absent signing key, token validation is complete, CORS fails
closed, and no secret remains reachable in the repository.

Phase 2, implemented and uncommitted:

| Task | State |
|---|---|
| 9 | Faculty/Department entities, required department on Group, EF mapping with 4 unique indexes and both `Restrict` FKs |
| 10 | `AcademicStructureErrors`, faculty DTOs, `IFacultyService`, `FacultyService`, shared `TestData` builders |
| 11 | Department DTOs, `IDepartmentService`, `DepartmentService` (+5 tests added beyond the plan, see §7) |
| 12 | Groups require a department; `GroupService` and `DbSeeder` rewritten; group responses carry department and faculty names |
| 13 | **Steps 1–2 only.** 13 old migration files deleted, single `InitialCreate` generated and verified. Steps 3–4 blocked (§1). |

Task 13's verification is the load-bearing one and it passed: both foreign keys emit
`ReferentialAction.Restrict`, all four unique indexes are present, `StudentTasks.Status`
is `nvarchar(50)` rather than an int, exactly three files are in `Migrations/`, and
`has-pending-model-changes` reports no changes. That is the first evidence these
constraints reach real SQL — the model tests assert configuration only, and the InMemory
provider enforces neither foreign keys nor unique indexes.

Current suite: **56 passing**, no build warnings. Frontend: lint 0 errors (2 pre-existing
`react-hooks/exhaustive-deps` warnings are expected and allowed), `tsc -b` clean, build
succeeds.

## 6. What remains

1. **Task 13 steps 3–4** — once the database exists: drop (already done), start the API,
   confirm seeding. Expected: `Seed Group A | Department of Software Engineering |
   Faculty of Informatics and Computer Science`.
2. **Task 14** — `FacultiesController`, `DepartmentsController`, two DI registrations in
   `Program.cs`, then the scripted endpoint check. Expected sequence:
   `401, 200, 403, <guid>, 409, 400, <guid>, 400, DO, 404, 409, 204, 204`.
3. **Task 15** — client types, `facultiesApi.ts`, `departmentsApi.ts`, `FacultiesPage.tsx`,
   styles, route and nav link; then the browser walkthrough.
4. **Task 16** — department selector on groups; client `Group` types gain `departmentId`,
   `departmentName`, `facultyId`, `facultyName`; both group request types gain
   `departmentId`.
5. **Task 17** — gates, then the single phase 2 commit.
6. **Then:** the testing increment the user asked for (§3), and a single review over the
   whole phase.

## 7. Deviations from the plan text — carry these

- **Expected test totals are +5 from the plan's numbers.** The plan says 51 for Tasks 12,
  14 and 17; the real number is **56**. Five tests were added to `DepartmentServiceTests.cs`
  because the plan's test list omitted update coverage that spec §6 explicitly requires
  ("creation, **update**, deletion, rejection of duplicate names within a faculty, and
  refusal to delete a record that still has dependents"). Do not try to reconcile back to 51.
- Task 5's step 6 says the schema is regenerated in "Task 14"; it means Task 13.
- Task 17's expected `git log` shows `3a3612c` as the spec commit; it is `fcf7b4d`.
- The plan's per-task test steps and per-task reviews are superseded by §3.

## 8. Watch items for the remaining tasks

- **Task 14, check #5 (duplicate name → 409).** `FindConflictAsync` compares
  `f.Id != excludedId` with a null `excludedId` on create. Two reviewers and the controller
  agree this is correct on both providers (EF Core's relational null-semantics rewrite;
  `UseRelationalNulls` is not enabled anywhere). This check is the runtime proof. If it
  returns 201 instead of 409, that predicate is the cause.
- **Task 14 status mapping.** A faculty referenced in a request *body* that does not exist
  is a 400; a faculty named in the *URL* that does not exist is a 404.
  `GetDepartmentsAsync` returns null only when a faculty id was supplied and no such
  faculty exists — that null is what becomes the 404.
- **`GroupsController` stays unmodified.** Its 409 mapping compares against the literal
  `"Group with the same name and academic year already exists."`, and `GroupService`'s
  private constant holds that identical text. Keep them character-for-character equal.
- **Task 16 closes a frontend gap:** the client's `Group` types do not yet carry the
  fields the backend now returns.
- **Processes.** Tasks 13–16 share an API on :5000, and 15–16 also a Vite server on :5173.
  Have each task start and stop its own, or start them from the controller. `dotnet run`
  spawns a child `DiplomaTracker.Api.exe` that outlives its parent — kill it too and confirm
  with `netstat`. A running API locks the build output that `dotnet test` needs.
- Browser checks need a browser, which subagents do not have. The controller ran them in the
  previous session via the in-app browser and a `.claude/launch.json` (gitignored) that
  defines `api` on :5000 and `web` on :5173.

## 9. Environment facts and gotchas

- Windows 10; the Bash tool is Git Bash. The repo path contains **spaces and Cyrillic**:
  `C:\Users\c4pgt\Desktop\diplom snaps\маг\diploma_tracker`. Always quote paths; a `cd`
  carries over between Bash calls, so prefer absolute paths.
- .NET SDKs 7.0.302 and 9.0.313; SDK 9 builds the `net8.0` target fine.
- `dotnet-ef` 8.0.8 is a **local tool** via `.config/dotnet-tools.json` (now versioned) and
  works from any subdirectory.
- Node 20.5.1, npm 9.8.0, `node_modules` present. `openssl` available. Python is **not**
  installed — use `node -e` for JSON.
- User-secrets hold `ConnectionStrings:DefaultConnection` and a 64-character `Jwt:Secret`.
  Never print either. When listing secrets, pipe through a redactor.
- EF design-time tooling works without secrets: validation runs after `builder.Build()`,
  and EF's host resolution stops inside `Build()`. Verified by running
  `has-pending-model-changes` with no database contact.
- Frontend `npm run build` needs `VITE_API_BASE_URL` set, because `apiClient.ts` throws at
  module-evaluation time when it is missing.

## 10. Deferred items for the end-of-phase review

None of these blocked a task. Hand this list to whoever does the single review so it can
triage what must change before merge.

Security (scope decisions for the user):
- `ConnectionStrings:DefaultConnection` has no fail-fast validation like `Jwt`/`Cors`; a
  missing value surfaces as a lower-level EF/SqlClient error rather than an operator-facing
  message. Fails closed either way.
- No `IDesignTimeDbContextFactory<AppDbContext>`.

Backend:
- `AdminBootstrapper` measures password length in UTF-16 units, not graphemes.
- The "settings missing" message names both `Bootstrap__AdminEmail` and
  `Bootstrap__AdminPassword` even when only one is blank; the JWT message likewise names
  issuer and audience together.
- `ValidateCorsSettings` would throw a null-reference if `AllowedOrigins` were bound to an
  explicit null.
- No test covers an existing admin suppressing the short-password throw.
- `DbSeeder`'s existence lookups are tracked rather than `AsNoTracking` (their results are
  reused).
- `StudentService.GetStudentByIdAsync` stays tracked via a loader shared with update paths.
- `FacultyService.FindConflictAsync` issues two sequential round-trips.
- No test asserts `CreatedAt`/`UpdatedAt` in the faculty response mapping.
- `UpdateDepartmentAsync` lacks tests for cross-faculty reassignment and for trimming.
- `GetGroupByIdAsync` has no test asserting its department/faculty name mapping.
- `EnsureGroupAsync` does not re-point an existing group's department on re-run (dev-only
  seeder).
- Department-not-found takes precedence over duplicate-group-name; untested either way.
- The startup scope uses `using` rather than `await using`, and nothing logs which of
  seed-vs-bootstrap ran.
- `Status_RoundTripsThroughTheContext` is redundant on the InMemory provider — it would
  pass without the string conversion. The requirement is genuinely asserted by
  `Status_IsMappedAsEnumPersistedAsString`.

Frontend:
- `apiClient.ts` throws at module-evaluation time when `VITE_API_BASE_URL` is unset and
  there is no `.env.production`, so a production build without that variable would fail to
  render at all. This is the plan's intended fail-fast design; it belongs to whichever task
  wires production/CI configuration.
- `apiRequest` guards JSON parsing only on the error path; a malformed body on a 2xx
  response still throws uncaught (pre-existing).
- The `.csproj` gained a UTF-8 byte-order mark from `dotnet user-secrets init`.

## 11. Decisions already made — don't reopen

- Keep and evolve the existing layered backend; no rewrite.
- All migrations collapsed into one `InitialCreate`. Nothing is deployed.
- Teachers are **not** linked to departments; department lives on topics (phase 4).
- No specialty, degree level, or institute/faculty distinction in the hierarchy.
- Faculty and department have no `IsActive` flag; deletion is blocked while dependents
  exist.
- Keep the `(T? result, string? error)` service pattern; error strings live in
  `AcademicStructureErrors`.
- Config validation runs **after** `builder.Build()` so `dotnet ef` works without secrets.

## 12. The working directory from the previous session

`.superpowers/sdd/2026-09-15-platform-foundations-and-academic-structure/` (git-ignored)
holds the ledger (`progress.md`), one brief per task, every implementer report, and every
review package. The ledger records each task's outcome, every ruling made, and the tree
hashes below. Keep it until the phase is reviewed and committed.

Because this project commits once per phase, per-task diffs were taken as git *tree*
snapshots rather than commits — `snap.sh` writes a tree from the working copy through a
temporary index without touching HEAD or the real index, and `pkg.sh` diffs two trees into
a review package. Both scripts live in that directory. Phase 2's base tree (the state at
commit `abffb34`) is `ab9de8b`; Task 12's head is `f369bdb`; Task 13's head is `3289a83`.

## 13. After phase 2

1. Report the commit to the user and suggest running `/custom-code-review`.
2. Ask what to do with the untracked plan and handoff documents.
3. The testing increment (§3), then brainstorming the user-onboarding increment, then the
   phase 3 design system (via `superpowers:brainstorming`). Two things are still undecided:
   whether a student may cancel their own topic reservation, and whether PDF output is in
   scope for phase 6.
