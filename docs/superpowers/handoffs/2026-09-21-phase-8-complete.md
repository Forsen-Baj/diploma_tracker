# Handoff: phase 8 complete and committed; four things still open

Read this in full, then `docs/superpowers/PROJECT_MEMORY.md`. It supersedes
`2026-09-21-phase-8-tasks-1-8.md` entirely — that document described an uncommitted working tree
that no longer exists.

**All 19 tasks of the hardening-and-polish plan are implemented and committed.** What is *not*
done is the work that comes after the plan: the whole-plan review, the test project, and four
defects in the check scripts. Those are §4.

## 1. Where things stand

Branch `phase7` (it holds phase 8 work; phase 7 stays deferred). Two new commits:

| Commit | What |
|---|---|
| `Implement hardening and polish` | Tasks 1-17 and 19 — everything |
| `f1571eb` | `Normalise line endings` — `.gitattributes` and ten pure line-ending rewrites, alone |
| `4559a99` | (base) the tasks 1-8 handoff |

**Design:** `docs/superpowers/specs/2026-09-21-hardening-and-polish-design.md` — binding authority,
amended in task 19 along with three earlier designs.
**Plan:** `docs/superpowers/plans/2026-09-21-hardening-and-polish.md` — 19 tasks.
**Ledger:** `.superpowers/sdd/2026-09-21-hardening-and-polish/progress.md` — every ruling and every
per-task note. **Git-ignored; it does not travel to the other machine.** Everything in it that
matters is reproduced here.

## 2. The first thing to do on the other machine

```
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

`InitialCreate` was regenerated in task 19 and has a new id. A database that recorded the old one
fails at startup with "There is already an object named 'Faculties'". This machine's database was
dropped with the owner's permission on 2026-09-21 and its `App_Data/uploads` folder emptied at the
owner's request, because the drop deleted every row that pointed at those files.

## 3. What was built

Tasks 1-8 are described in the previous handoff and are unchanged. Tasks 9-19:

| Task | What it delivered |
|---|---|
| 9 | The review queue returns one page — `{ items, page, pageSize, total }`, 25 by default and 100 at most. Ordered `SubmittedAt` then `Id`, so no row can appear on two pages or none. A bad page number is clamped, not refused. |
| 10 | A fifth cell state: **overdue** — past its deadline and neither approved nor awaiting a decision. `IsOverdue` is one shared rule, and every cell in one response is judged against the same instant. A student's late figure now counts *steps*, not submitted versions: three late attempts at one step is one late step. |
| 11 | Three real dashboard endpoints replacing three placeholder stubs. The overdue rule is spelled out inline in three SQL queries because a static method cannot be translated — those four places must stay in step. |
| 12 | `PUT /api/task-templates/order` takes a faculty's whole new order in one request and renumbers 1..n, closing gaps. Negate-then-assign inside a transaction, because a straight sequence of updates transiently violates the unique `(FacultyId, Order)` index. |
| 13 | The frontend foundation: types, five API modules, `Pagination`, `StatTile`, `ProportionBar`, and every uk/en translation key tasks 14-16 needed — they added none. |
| 14 | The overdue badge replaces the late badge (a step cannot be both), a five-state legend under the matrix, a rejection without a comment renders properly instead of as a bare title, and the topic page stops offering *Reserve* when the deadline passes with the page open. |
| 15 | The three dashboard pages, and a shared `GroupTable` used by two of them. |
| 16 | The archive pages, real paging controls on the queue, and drag-and-arrow reordering for step templates with rollback on failure. |
| 17 | `checkCleanup.mjs` and `hardening-check.mjs`; all seven existing scripts brought under the cleanup rule. **Four defects remain — §4.3.** |
| 18 | `.gitattributes`, its own commit. |
| 19 | `InitialCreate` regenerated, the database dropped and re-seeded, four design documents amended, `PROJECT_MEMORY.md` updated, the commit. |

## 4. What is open, in the order it should be picked up

### 4.1 The whole-plan review never ran

The plan ends with `code-reviewer` (opus) over the whole branch, one fix wave, and one scoped
re-review (sonnet). **None of it happened** — the session ran out of weekly budget at task 19.
This is the largest outstanding item and the reason to be careful about calling phase 8 finished.

Point the reviewer at the deferred-minor list in §5 so it can triage them alongside its own
findings.

### 4.2 The test project does not compile — unchanged since task 2

`dotnet build DiplomaTracker.Api.Tests` reports **202 errors (106 CS7036, 96 CS8130) across exactly
three files**: `DepartmentServiceTests.cs`, `FacultyServiceTests.cs`, `GroupServiceTests.cs`.

Every failure is a call site missing an argument — task 2 added `Guid administratorId` to 21
service methods and `ILogger<T>` to several constructors, and task 6 changed `GroupService`'s
constructor and `DeleteGroupAsync`'s signature. **Not one is an assertion about changed
behaviour.** Fix mechanically: a `Guid` for `administratorId`, `NullLogger<T>.Instance` for the
logger, `CancellationToken.None` and an administrator id for `DeleteGroupAsync`. No assertion
changes, no new tests.

Task 19's step 6 required this before the commit and it was not done. The commit was made anyway,
as a deliberate choice by the owner when the budget ran short: committing 19 tasks of finished work
beat leaving it in an uncommitted tree overnight. **Say so plainly rather than discovering it.**

### 4.3 Four check-script defects

The scripts were written in task 17 without a running API — the API could not start until task 19
regenerated the migration — so they were authored blind and run once, at the end. Results:

| Script | Result |
|---|---|
| `topics-check` | 72/72 |
| `onboarding-check` | 54/54 |
| `templates-check` | 50/50 |
| `design-system-check` | 13/13 |
| `fix-wave-backend-extra-check` | 10/10 |
| `hardening-check` | **46/48** |
| `workflow-check` | **5 failures** |
| `refinements-check` | **12 failures** |

**(a) `workflow-check` — stale fixtures, not a product bug.** Its `docx` fixture (line 42) is ten
bytes of ZIP local-file header. Task 3's inspector opens the file and requires the parts the
extension claims, so it is now correctly refused with `file.contentMismatch`. Because
`ValidateMainAsync` runs before `ValidateSupportingAsync`, that one bad main file explains all
five failures — checks 08, 08a, 08b and 09 never reach the supporting-file rules they are testing,
and check 11's legitimate submission is refused. `pdf` (line 43) is a 15-byte stub with the same
problem. **Fix:** build genuine packages the way `hardening-check.mjs` does, with its `docx()` and
`paragraph()` helpers. I verified this diagnosis; it is not a guess.

**(b) `refinements-check` — stale password expectation.** Check 20 creates an administrator with a
password shorter than 12 characters and expects 201. Task 1 raised the administrator policy to 12
(`password.policyElevated`), so it now answers 400 and every later check in that script fails on
the missing administrator. **Fix:** lengthen the password in the arrange step. One line; the other
eleven failures are consequences of it.

**(c) `hardening-check` check 35 — the template create is what fails, not the replace.** The PUT
answers 404 because `hardeningTemplateId` is `undefined`, which means the `POST /api/templates` at
line 458 did not return an id. The script then dies with "The first argument must be of type
string…" when it tries to unzip an undefined body. **Fix:** print `templateCreated.body` and find
out why the create was refused — it is the teacher, a `commonGroup` audience and a generated
`.docx`, so suspect the audience or the marker scan, not the package.

**(d) Three cleanup leaks.** Task 17's step 5 requires the seeded data to be identical before and
after a full run. It is not:

| | before | after |
|---|---|---|
| students in `SEED-A` | 1 | **2** |
| step templates | 8 | **18** |
| faculties | 1 | **4** |

Every script reported `Cleanup: nothing left behind.`, so the registry drains without error — the
undo steps simply do not cover everything. Note that the faculty leak is partly structural and was
flagged during task 17: a faculty holding a step template cannot be deleted, and there is no delete
endpoint for a step template. That needs a decision, not just a fix.

### 4.4 No browser walkthrough

The API could not start for the whole of tasks 1-18, so nothing in the interface has been clicked.
`tsc`, `lint`, `i18n:check` and a production build all pass, which proves the code compiles and the
translations match — nothing more. §6 is the list to walk through.

## 5. Deferred minors, for the whole-plan review to triage

From tasks 1-8 (unchanged): the bootstrap exception message says `Bootstrap:AdminPassword` where a
hosted operator sets `Bootstrap__AdminPassword`; `GroupTaskService.AssignAllTaskTemplatesAsync`
logs no administrator action; password resets and the deadline write both log `"Updated"` because
the vocabulary has no distinct value.

New in tasks 9-17:

- The review queue's student name is concatenated in SQL, so a patronymic stored as `""` rather
  than `NULL` would render a trailing space where `JoinName` trimmed it. Theoretical.
- `ReviewBacklogSummary.WaitingReviews`/`WaitingLate` count every undecided submission with no
  `ArchivedAt == null` filter, while the per-group rows do filter archived students. An archived
  student with an undecided submission appears in the headline number but in no group row. This is
  the plan's own code and is consistent with the admin's review queue; arguably correct.
- `progress.backToGroups` reads "Back to my groups" / "До моїх груп", and an administrator now
  reaches that page from the dashboard group table, where the groups are not "mine".
- `archive.purgeConfirm` is passed `count: details.files.length` where the brief said `fileCount`;
  check against `ArchivedGroupDetails`.
- Every run of `hardening-check.mjs` and `refinements-check.mjs` leaves a faculty behind (see
  §4.3d).

## 6. What to click, once the database is recreated

Sign in as each role. The seeded accounts are in `Services/DbSeeder.cs`.

**Administrator** — the dashboard is new end to end: the topic-selection bar with its deadline and
open/closed badge, three backlog tiles, nine structure tiles that link to their pages, the group
breakdown table (click a column header to sort, click a row to open that group's matrix), and the
group-progress card at the bottom. Then: *Archive* in the navigation, a group's archive detail and
its purge button; *Steps* with drag-and-drop and the ↑/↓ arrows; the review queue's page controls.

**Teacher** — the dashboard: waiting-reviews and groups tiles, the five latest submissions for
review, overdue steps with a days-overdue count, supervised students, the group breakdown, the
group-progress card. The archive without a purge button. The step list without drag handles.

**Student** — the dashboard: topic card, progress summary (the late figure now counts steps), and
the latest-decision card. On *My topic*, a rejection with no comment should render a proper block
rather than a bare title. On the topics page, leave it open past the selection deadline and watch
*Reserve* disappear by itself.

**The progress matrix, any role** — a step past its deadline with nothing submitted now shows a red
*Overdue* badge, and a five-state legend sits under the table.

## 7. How this session was run

`superpowers:subagent-driven-development` with the project's standing overrides: no per-task
reviews, no unit tests, commits only at tasks 18 and 19, owner checkpoint every four tasks.
`dotnet-core-expert` (sonnet) for backend, `react-specialist` (sonnet) for frontend, one agent per
task, dispatched with a brief extracted from the plan rather than the whole plan.

Three fix rounds were needed in tasks 9-17, all found by the controller reading the diff, because
this project has no per-task reviews. Budget for that. Two plan defects were found the same way and
are recorded as rulings in §8.

## 8. Rulings made on the owner's behalf in this session

1. **Task 17 cannot run its own check scripts; the plan is circular there.** Its steps 4-5 need a
   running API, which task 19 only makes possible, while task 19's verification needs
   `hardening-check.mjs`, which task 17 writes. Split by precondition: author the scripts, commit
   task 18, drop and regenerate, then run the scripts. — Cost if wrong: the scripts were authored
   blind, so their defects surfaced at the end rather than at task 17. That is §4.3, and it was
   unavoidable.
2. **Task 18's own method does not work.** `git diff --cached --ignore-cr-at-eol --name-only` lists
   every file regardless, because git 2.40 decides `--name-only` on blob-hash inequality and never
   runs the content comparison. The rule that works: unstage a path when
   `git diff --cached --ignore-cr-at-eol -- <path>` produces any output. — Cost if wrong: none; the
   result was verified empty before committing.
3. **Task 15's group rows pointed at a route that did not exist.** `/groups/{id}/progress` was not
   in `App.tsx`; `GroupProgressPage` was reachable only at `/teacher/groups/:id`, behind the
   Teacher guard, so every group row on the administrator's dashboard would have dead-ended. The
   route was added to the existing Admin+Teacher guard and the page's back link made role-aware. —
   Cost if wrong: one route line.
4. **`TeacherDashboardPage` reads `queue.total`, not `queue.items.length`.** The minimal stopgap
   showed the first page's length, capped at 25. — Cost if wrong: none.
5. **The two stale assertions in `workflow-check.mjs` were task 17's to fix**, not "pre-existing":
   its exit condition is that every script passes, and this plan caused both breakages. Fixed —
   `.body.items` for the paged queue, and `lateSteps` with the expected value changed from 2 to 1,
   because both of that script's submissions land on one step. — Cost if wrong: none.
6. **`DashboardService` relies on the controller's `[Authorize(Roles)]` for role scoping** rather
   than checking inside the service. It is what every other controller here does, and both
   role-specific reads are additionally scoped by `IAccessScope`. — Cost if wrong: none observable.
7. **`DataTable` gained an optional `rowProps`** so a row can be made draggable; the alternative
   was a second hand-rolled table. Spread before `onClick` and `className`, so no caller changes. —
   Cost if wrong: one optional prop.
8. **`MyTopicCard` renders the decision date**, which the brief's snippet omitted but its prose
   required. Reuses the existing `topics.decidedAt` key. — Cost if wrong: one muted line.
9. **Task 15's "seven columns" is a wording slip**; it enumerates eight, matching
   `DashboardGroupRow`. Eight implemented. — Cost if wrong: none.
10. **The commit was made without a green `dotnet test`**, which task 19 step 6 required. The owner
    chose this when the weekly budget ran short. See §4.2. — Cost if wrong: the test project's
    state is documented rather than discovered.

## 9. Continue prompt

> Read `docs/superpowers/handoffs/2026-09-21-phase-8-complete.md` and
> `docs/superpowers/PROJECT_MEMORY.md` in full and follow them. Phase 8 is implemented and
> committed on branch `phase7`. **Drop the local database first** — `InitialCreate` was
> regenerated and has a new id. Then, in order: fix the test project (§4.2, mechanical, 202
> errors in three files), fix the four check-script defects (§4.3, each one diagnosed), and run
> the whole-plan review with `code-reviewer` (opus) over the branch diff, one fix wave, one
> scoped re-review with `code-reviewer` (sonnet), pointing the reviewer at the deferred-minor
> list in §5. Ask me every decision with clickable options, write anything I need to approve to
> a file, tell me before anything destructive, and never type a password — I sign in for browser
> walkthroughs. §6 is what I want to click once the API starts.
