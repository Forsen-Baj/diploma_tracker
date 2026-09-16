# Handoff: Execute Phases 1 and 2

Read this in full before dispatching any subagent. It carries everything the previous
session learned that is not in the spec or the plan.

## 1. The job

Execute the implementation plan with the subagent-driven workflow:

- **Plan:** `docs/superpowers/plans/2026-09-15-platform-foundations-and-academic-structure.md`
  (17 tasks: phase 1 = tasks 1–8, phase 2 = tasks 9–17)
- **Spec:** `docs/superpowers/specs/2026-09-15-diploma-tracker-system-design.md`
  (sections 3, 5, 6 are what the plan implements)

The user approved both documents. Do not redesign; if a task turns out to be wrong,
stop and raise it with the user rather than improvising.

## 2. Project context

Diploma Tracker: ASP.NET Core 8 Web API + React 18/TypeScript/Vite SPA over SQL Server.
Students pick thesis topics, generate an application document, and move through
steps that reviewers approve. It is the user's master's thesis project, with a defense
in roughly 1–2 months. The target is hosting for one real department, while still
running fully locally for E2E testing.

Delivery phases, in priority order (lower ranks are dropped first if time runs short):

1. Platform foundations ← this handoff
2. Academic structure (Faculty → Department → Group) ← this handoff
3. Design system in the style of schedule.kpi.ua
4. Thesis topics and reservation
5. Submission and review
6. Document templates and generation (.docx, optional PDF)
7. Document preview and commenting (stretch)

A small "user onboarding" increment (student list import, registration toggle,
profile/password management) follows phase 2, before phase 3.

## 3. User preferences — non-negotiable

These are also saved in the project's auto-memory, but restate them to every subagent
that touches git or documents.

- **Commits: exactly one per phase.** The title line is the whole message: no body and
  no `Co-Authored-By` trailer. Commit attribution is disabled in
  `~/.claude/settings.json` (`"attribution": { "commit": "" }`). The plan's commits
  are `Implement platform foundations` (task 8) and `Implement academic structure`
  (task 17). **Subagents must not commit in any other task.** This overrides the
  subagent-driven-development skill's default of committing per task. Tell each
  implementer explicitly: "Do not run git commit or git add."
- **Documents read as a greenfield design.** Never frame docs as fixes to earlier broken
  code ("the review found", "PoC churn", and so on).
- Terse, direct communication. The user makes scope decisions; flag trade-offs and
  don't decide them silently.
- The user gets annoyed by long commit messages and by history that shows them. Don't
  amend or rewrite history unless asked.

## 4. Repository state at handoff

- Branch `unit_tests`, no upstream (never pushed). Remote `origin` has only `master`.
- History: `3a3612c Add system design spec` ← `a92ca1f initial commit`.
  - `3a3612c` still has a `Co-Authored-By` trailer. The user was offered an amend and
    hasn't answered. Leave it alone unless they ask.
- Uncommitted or untracked when the previous session ended:
  - `M .gitignore`: the user's own additions, which ignore `/.config`,
    `/.claude`, and two `.github` folders. Task 1 removes only the `/.config` line.
  - `M backend/DiplomaTracker.Api/appsettings.json`: **contains a live SQL
    password and JWT secret.** Task 1 copies the connection string into user-secrets
    and then blanks the file. Never stage this file before Task 1 is done.
  - `?? backend/DiplomaTracker.Api.Tests/`: existing test project (9 passing tests).
    It gets committed in phase 1.
  - `?? PROJECT_PAPER.md`: the user's thesis paper. **Never stage.**
  - `?? frontend/diploma-tracker-web/README.md`: **Never stage.**
  - `?? docs/superpowers/plans/...` and this handoff: not part of either phase
    commit (the plan's `git add` lists deliberately exclude `docs/`). Ask the user what
    to do with them after phase 2.

## 5. Environment facts and gotchas

- Windows 10, and the Bash tool is Git Bash. The repo path contains **spaces and
  Cyrillic**: `C:\Users\c4pgt\Desktop\diplom snaps\маг\diploma_tracker`. Always quote
  paths. A `cd` inside one Bash call carries over to later calls in that session and
  confused the previous session twice; prefer absolute paths.
- .NET SDKs 7.0.302 and 9.0.313 are installed; SDK 9 builds the `net8.0` target fine.
- `dotnet-ef` 8.0.8 is a **local tool** via `.config/dotnet-tools.json` at the repo
  root. It works from any subdirectory.
- Node 20.5.1, npm 9.8.0, `node_modules` present. `openssl` is available in Git Bash.
  Python is **not** installed (use `node -e` for JSON handling).
- A local SQL Server is required for the runtime checks (tasks 4, 7, 13–16). Its
  connection string is the one currently in the working-tree `appsettings.json`
  (login `diploma_smoke`). If it isn't reachable, tell the user rather than skipping
  the manual verification steps.
- Baselines measured before the plan was written:
  - `dotnet test backend/DiplomaTracker.Api.Tests`: 9 passed.
  - `npm run build`: succeeds.
  - `npm run lint`: 3 errors and 2 warnings. Task 7 fixes the errors; the two
    `react-hooks/exhaustive-deps` warnings are pre-existing and allowed to remain.
- The frontend has no unit test runner. Frontend tasks are verified with
  `tsc`, lint, build, and the scripted browser checks in the plan.

## 6. Plan caveats for reviewers

The plan was written against the code as read, but never executed. Watch these points:

- **Task 1, step 1** reads the connection string with
  `require('./DiplomaTracker.Api/appsettings.json')`. If that file has a UTF-8 BOM,
  `require` throws. In that case, copy the value by hand into `dotnet user-secrets set`.
- **Task 5, step 6** expects `has-pending-model-changes` to report no changes after the
  enum conversion. If it reports a difference, do **not** add a migration. Task 13
  regenerates the schema from scratch.
- **Task 6** edits by line number. Several target lines are textually identical to
  lines in update methods that must stay tracked. Reviewers should check the task's
  step-2 grep output, not trust the implementer's summary.
- **Line numbers in tasks 5 and 6** assume the files as they were on 2026-09-15.
  Task 5's replacements are single-line and don't shift them, but confirm before editing.
- Expected test totals are cumulative. After tasks 3, 5, 9, 10, 11 and 12 they are
  20, 22, 26, 35, 44 and 51. A different number means a test was skipped or duplicated.
- Tasks 13–16 share a running API process, and 15–16 also share `npm run dev`.
  With subagents, either have the controller start them or have each task start and
  stop its own. Don't leave orphaned processes on ports 5000 and 5173.

## 7. Available agents and skills

Installed at both project level (`.claude/agents/`, gitignored) and user level
(`~/.claude/agents/`):

`dotnet-core-expert`, `csharp-developer`, `react-specialist`, `sql-pro`,
`api-designer`, `test-automator`, `code-reviewer`, `security-auditor`, `debugger`,
`refactoring-specialist`

Suggested use within subagent-driven development:

- Backend implementers (tasks 1–6, 9–14): `csharp-developer`
- Frontend implementers (tasks 7, 15, 16): `react-specialist`
- Code-quality review between tasks: `code-reviewer`
- Extra pass on tasks 1–4 (secrets, JWT, bootstrap admin): `security-auditor`

Also available:

- `/custom-code-review`: project skill that reviews `git diff master...HEAD` for
  .NET/EF Core/async/authorization issues and delegates to `code-reviewer`. Useful
  after each phase commit.
- The Superpowers plugin (`superpowers:*` skills).

## 8. Decisions already made — don't reopen

- Keep and evolve the existing layered backend; no rewrite.
- Collapse all migrations into one `InitialCreate` (task 13). Nothing is deployed.
- Teachers are **not** linked to departments; department lives on topics (phase 4).
- No specialty, degree level, or institute/faculty distinction in the hierarchy.
- Faculty and department have no `IsActive` flag; deletion is blocked while dependents exist.
- Keep the `(T? result, string? error)` service pattern. Error strings for the new
  services live in `AcademicStructureErrors` constants.
- Config validation runs **after** `builder.Build()` so `dotnet ef` works without
  secrets (task 4 explains why).

## 9. After phase 2

1. Report both commits to the user and suggest running `/custom-code-review`.
2. Ask what to do with the untracked plan and handoff documents.
3. The next step is brainstorming the user-onboarding increment, then the phase 3
   design system (via `superpowers:brainstorming`). Two things are still undecided:
   whether a student may cancel their own topic reservation (and under what
   restrictions), and whether PDF output is in scope for phase 6.
