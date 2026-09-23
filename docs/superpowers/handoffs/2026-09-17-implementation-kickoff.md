# Handoff: Implementation of onboarding and phases 3–6

Read this in full before dispatching any subagent. Then read
`docs/superpowers/PROJECT_MEMORY.md` — it is the standing project memory and wins over
anything older (including `2026-09-16-resume-phase-2.md`, which is historical).

## 1. Where the project is

| Part | State | Spec | Plan |
|---|---|---|---|
| 1 Platform foundations | Done, merged to `master` | `specs/2026-09-15-diploma-tracker-system-design.md` §5 | `plans/2026-09-15-platform-foundations-and-academic-structure.md` |
| 2 Academic structure | Done, reviewed, fixes committed (`0e909bc`) | same, §6 | same |
| User onboarding | **Next to execute** | `specs/2026-09-16-user-onboarding-design.md` | `plans/2026-09-17-user-onboarding.md` |
| 3 Design system | Planned | `specs/2026-09-17-design-system-design.md` | `plans/2026-09-17-design-system.md` |
| 4 Topics and reservation | Planned | `specs/2026-09-17-topics-and-reservation-design.md` | `plans/2026-09-17-topics-and-reservation.md` |
| 5 Submission and review | Planned | `specs/2026-09-17-submission-and-review-design.md` | `plans/2026-09-17-submission-and-review.md` |
| 6 Document templates | Planned | `specs/2026-09-17-document-templates-design.md` | `plans/2026-09-17-document-templates.md` |
| 7 Preview and commenting | Deferred by the owner | — | — |

All paths are under `docs/superpowers/`. Every spec is approved. Nothing from the plans has
been implemented yet.

**Execute strictly in order.** Each plan assumes every earlier plan is implemented and
committed; later plans reference types, codes, components and endpoints created by earlier
ones.

## 2. Branching and stops

- Branches: `master` ← `dev` ← one branch per phase or increment. The owner creates branches
  and merges. Work on whatever branch is checked out; never merge, never push.
- Check `git branch --show-current` at session start and confirm it with the owner if it is
  not obviously the branch for this plan.
- **Each plan ends with exactly one commit** (title only, no body, no trailer). After that
  commit and the review cycle (§4), **stop and report** so the owner can merge and branch.
  Do not start the next plan in the same run unless the owner says so.

## 3. How to run a plan

Use `superpowers:subagent-driven-development` with these standing adjustments (they
override the skill's defaults and any per-task wording in the plans):

- **No per-task reviews.** Implement all tasks of the plan, then one review over the whole
  plan (§4).
- **No unit tests.** Plans already contain no test-writing steps; do not add any. Existing
  test projects must keep compiling. Test gaps go to `docs/superpowers/test-backlog.md`
  (the final task of each plan does this).
- **No commits except the plan's final task.** Tell every implementer explicitly:
  "Do not run git commit or git add."
- **Batch tasks** by area to save dispatches: consecutive backend tasks in one
  `csharp-developer` dispatch, consecutive frontend tasks in one `react-specialist`
  dispatch, when the plan's tasks are sequential and independent of a browser step.
- **Check scripts** (`.superpowers/checks/*.mjs`, git-ignored) are part of the backend
  batch: the implementer starts the API, runs the script, stops the API, and reports the
  pass line. A failing check is a finding for the same implementer, not a reason to edit
  the expected value — unless the expectation itself is wrong, which the controller rules
  on and records.
- **Page tasks are specs, not code.** The frontend agent writes page TSX from the component
  APIs and the translation blocks in the plan. Shared components, API modules and i18n
  setup are given as complete code and must be transcribed.
- **Browser walkthroughs** (final tasks of plans 4, 5, 6) are run by the controller in the
  in-app browser with `.claude/launch.json` (`api` on :5000, `web` on :5173). The owner
  signs in; the controller never types passwords.
- **Rulings:** when the plan and reality disagree (a library behaves differently, a name
  does not exist), keep the task's intent, record the ruling in the ledger and in the
  final report to the owner.

### Agent presets

| Work | Agent | Model |
|---|---|---|
| Backend tasks (entities, services, controllers, migrations, check scripts) | `csharp-developer` | sonnet |
| Frontend tasks (components, API modules, i18n, pages) | `react-specialist` | sonnet |
| Whole-plan review | `code-reviewer` | opus |
| Fix wave after the review | `csharp-developer` / `react-specialist` (split by area) | sonnet |
| Scoped re-review of the fix wave | `code-reviewer` | sonnet |
| Security review — **recommended for onboarding** (claiming, rate limiting, password reset) and phase 5 (file upload/download) | `security-auditor` | opus |
| Diagnosing a stuck failure | `debugger` | sonnet |
| Schema or query performance questions | `sql-pro` | sonnet |

Always pass the model explicitly.

## 4. Review cycle per plan

1. After the last implementation task (before the plan's commit step), build a review
   package of the working tree against `HEAD` (as done for phase 2: `git diff -U10 HEAD`
   plus untracked files, written to the plan's `.superpowers/sdd/<plan>/` workspace).
2. Dispatch one `code-reviewer` (opus) with: the package path, the spec, the plan, and the
   rule that missing tests go into a separate "Test gaps" section, not the fix list.
3. Fix Critical, Important and cheap Minor findings in **one** fix wave (backend and
   frontend agents may run in parallel — they touch disjoint trees). Park scope questions
   for the owner.
4. One scoped re-review of the fix diff.
5. Add the test gaps to `test-backlog.md`, then run the plan's final commit task.
6. Report to the owner: commit, review outcome, parked items, rulings.

The owner may prefer to commit first and review after (as in phase 2). Ask once at the start
of a plan if unclear.

## 5. Things to watch, per plan

**User onboarding**
- `AuthService` gains a constructor parameter; the plan updates `AuthServiceTests` only for
  compilation.
- The check script paces itself around the 10-per-minute rate limit; expect ~3 minutes.
- The database is dropped and rebuilt (hand-entered local data is lost; tell the owner).

**Design system**
- New npm packages: Tailwind 4, `@tailwindcss/vite`, Headless UI 2, lucide-react, i18next,
  react-i18next, `@fontsource/exo-2`. Node is 20.5.1; if a package refuses that version,
  stop and tell the owner rather than upgrading Node.
- Between the shell task and the page migrations, `tsc` fails in unmigrated pages; that is
  expected until Tasks 9–12 finish.
- The visual reference is schedule.kpi.ua; tokens in the plan were sampled from it.
- `tsconfig.app.json` has `verbatimModuleSyntax` and `erasableSyntaxOnly`: type-only
  imports use `import type`, no enums, no parameter properties.

**Topics and reservation**
- `TopicService` projects active-reservation data through correlated subqueries; if EF
  cannot translate one, split the query rather than loading whole graphs.
- The Students page loses the registration switch (moved to the new Settings page).
- First real workflow: controller walkthrough with the owner at the end.

**Submission and review**
- Adds `Storage:RootPath` (Development: `App_Data/uploads`, git-ignored). Startup fails when
  the path is unusable.
- `EnsureStudentTasksAsync` creates missing student steps on demand — required because
  students imported after steps were assigned have none.
- Recommended: `security-auditor` pass over upload validation, download authorisation and
  visibility.

**Document templates**
- New NuGet package `DocumentFormat.OpenXml` 3.x.
- The check script writes and reads `.docx` zips itself; check 18 assumes the seed teacher
  is `Demo Teacher` → `Teacher D.`.
- Walkthrough needs a real Word template prepared by the owner.

## 6. Environment reminders

Full list in `PROJECT_MEMORY.md`. The ones that bite most:
- Git Bash; quoted paths (spaces and Cyrillic); no Python — use `node`.
- `curl | node -e readFileSync(0)` loses stdin; checks are Node `fetch` scripts.
- `dotnet run` leaves a child `DiplomaTracker.Api.exe`; kill it and confirm port 5000 is
  free before building or testing.
- Frontend build needs `VITE_API_BASE_URL=http://localhost:5000`.
- Secrets live in user-secrets; never print them; never stage `appsettings*.json` secret
  values, `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md` or `App_Data/`.

## 7. Workspace housekeeping

`.superpowers/sdd/2026-09-15-platform-foundations-and-academic-structure/` (git-ignored)
holds the finished phase 1–2 ledger, briefs and review packages. Its review cycle is closed;
it may be deleted when the owner agrees. Each new plan gets its own workspace via the
skill's `sdd-workspace` script.

## 8. Owner preferences (summary)

- Terse, direct reports; decisions and trade-offs flagged, not buried.
- Ask questions with clickable options; put anything to be approved in a file and ask for a
  review of the file.
- Documents describe the system as designed, never as fixes to earlier code.
- Commit messages: one bare title line.
