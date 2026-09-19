# Handoff: finish phase 5, then phase 6

Read this in full before dispatching any subagent, then read `docs/superpowers/PROJECT_MEMORY.md`.
This file supersedes `2026-09-19-phase-5-kickoff.md`, which is now historical except for its §2
(how work is run) and §6 (environment) — both still apply unchanged.

**Nothing is committed.** The entire phase 5 change is the working tree on branch `phase5`
(base `ccae341`). 37 modified/deleted files (873 insertions, 1849 deletions) plus 44 new files.

## 1. What is done

Tasks 1–9 of `docs/superpowers/plans/2026-09-17-submission-and-review.md` are implemented, and the
whole-plan review, the security audit and the single fix wave have all run.

| Step | State |
|---|---|
| Tasks 1–4 (domain/schema, storage, access scope, errors+DTOs) | Done, gates verified by the controller |
| Tasks 5–7 (workflow service, controllers, check script) | Done, gates verified by the controller |
| Task 8 (client contracts, API modules, navigation) | Done, gates verified by the controller |
| Task 9 (workflow components, pages, routes, i18n) | Done, gates verified by the controller |
| Whole-plan review — `code-reviewer` (opus) | Done: 0 Critical, 7 Important, 18 Minor |
| Security audit — `security-auditor` (opus) | Done: 0 Critical, 1 High, 3 Medium, 5 Low |
| Fix wave, frontend half | Done, gates **verified by the controller** |
| Fix wave, backend half | Done, gates **reported by the agent, NOT independently verified** |
| Scoped re-review | **Not started** |
| Browser walkthrough (owner signs in) | **Not started** |
| Task 10 (test-backlog, PROJECT_MEMORY, commit) | **Not started** |

### The owner's decisions taken during this session — do not reopen

1. All twelve pre-flight conflict resolutions in
   `.superpowers/sdd/2026-09-17-submission-and-review/PRE-FLIGHT-CONFLICTS.md` were approved and
   are implemented. **That file wins over the plan wherever they disagree.**
2. Dropping and regenerating the local database was approved and done.
3. `fix-wave-backend-extra-check.mjs`: the API is right, the script's expectation was stale. Fixed
   — it now expects the row-level `import.row.malformedQuote` with the line number. 10/10.
4. Fix-wave scope: all Important, all security findings, and the Minors that are genuine defects.
   **Deferred by the owner:** the progress-matrix keyboard accessibility (part of the parked
   accessibility pass), review-queue pagination, the spec §8 dashboard shortfalls, and deep OOXML
   container validation.
5. The UTC serialization fix was made **globally in `Program.cs`**, knowingly changing every date
   in the whole application, not only phase 5.
6. Orphaned upload files when a group is deleted: **parked**, with the owner's note that they would
   like an archive of them that an administrator can manage. Treat that as a small feature, not a
   bug fix.

## 2. Do this first, in order

### a. Verify the backend fix wave yourself — it was interrupted before verification

The agent reported these; **none were re-run by the controller.** Run them and trust nothing until
you have the output:

```bash
taskkill //F //IM DiplomaTracker.Api.exe 2>/dev/null
cd backend
dotnet build DiplomaTracker.Api --no-restore --nologo -v q
dotnet build DiplomaTracker.Api.Tests --no-restore --nologo -v q
dotnet test DiplomaTracker.Api.Tests --no-restore --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: 0 errors twice (the single `NU1900` warning is the private-feed environment artefact),
56/56 tests, no pending model changes.

Then start the API and run **all six** check scripts, twice in a row:
`workflow-check` (now 49 checks, was 43), `fix-wave-backend-extra-check` (10), `topics-check` (72),
`refinements-check` (67), `onboarding-check` (54), `design-system-check` (13).
The five non-workflow scripts are what prove the global UTC change broke nothing.

Also re-confirm the two things that were proved live before the fix wave and must now behave
differently:

- **Trailing-dot bypass.** A supporting file named `tool.exe.` (and `tool.exe `) must now be
  refused with `file.typeNotAllowed`. Before the fix it was accepted and stored as `tool.exe.`,
  served as `Content-Disposition: attachment; filename=tool.exe.`, which Windows browsers save as
  `tool.exe`. The check script now has cases `08a`/`08b` for this.
- **Timestamps.** `GET /api/groups` must return `"createdAt"` ending in `Z`. Before the fix it
  returned `"2026-09-19T00:38:38.1131332"` with no marker, which JavaScript parses as local time.

### b. Re-normalise line endings before anything is staged

Editing tools flip touched files to CRLF while most blobs in this repository are LF, which turned
the diff into 4304/5318 lines of noise earlier in this session. It was normalised **per file
against each file's own blob** — four files (`Services/GroupService.cs`,
`Services/GroupTaskService.cs`, `DiplomaTracker.Api.Tests/Services/GroupServiceTests.cs`,
`Migrations/AppDbContextModelSnapshot.cs`) are genuinely `i/crlf` in git history and must stay
CRLF; blanket conversion breaks them the other way.

As of this handoff `git diff --stat` and `git diff --stat --ignore-cr-at-eol` agree exactly
(873/1849), so the tracked files are clean — but **the fix wave added new untracked files that were
never checked**, and untracked files do not appear in `git diff`. Re-run the per-file normaliser
over both modified and untracked files, then confirm the two figures still match.

The durable fix is a `.gitattributes`; the repository has none, and adding one would restage
everything, so it was deliberately not done mid-phase. Worth doing between phases.

### c. Scoped re-review

`code-reviewer` (**sonnet**), scoped to the fix wave only — not a second whole-plan review. Give it
the list in §3 and ask it to confirm each finding is actually resolved and that no new defect was
introduced. Per the standing process this is the last review phase 5 gets.

### d. Browser walkthrough — the owner signs in

**No subagent and no controller ever types a password.** Put that prohibition in the dispatch
prompt itself, not just in your own head. Drive `api` (:5000) and `web` (:5173) from the controller
session's in-app browser; the owner signs in.

Plan Task 10 Step 1 has the seven-step script. Pay particular attention to dates and times, since
the UTC fix changed every one of them, and to the student's *My work* page, where a past deadline
on an unapproved step should be red and the step should **not** be flagged late until the server
says so.

### e. Task 10 — but correct the plan's draft first

The plan's Task 10 Step 3 drafts a `## Submission and review` section for
`docs/superpowers/test-backlog.md`. **Two lines of that draft are stale and must not be copied in
as written** — "on-demand creation of missing steps" and the matching `PROJECT_MEMORY` gotcha
"student steps are created on demand" both contradict approved resolution A1. `LateJoinerTaskAssigner`
creates the rows at membership time; `EnsureStudentTasksAsync` was deliberately never built.
Rewrite them as "steps exist on join" before appending. Add the extra test gaps in §4 below.

Then update `PROJECT_MEMORY.md` (status row, environment fact about `Storage:RootPath`, the
`IAccessScope` gotcha, the log line) and commit **once**: `Implement submission and review`.

Before staging, re-read the plan's `git add` list — it omits `.superpowers/checks/workflow-check.mjs`,
and check scripts have been committed since 2026-09-18.

## 3. What the fix wave changed — the re-review's scope

### Backend

- **F1 UTC serialization.** New `Configuration/UtcDateTimeJsonConverter.cs`, registered globally in
  `Program.cs`. **Note the agent's deviation:** `DateTime.Parse` with
  `AdjustToUniversal | RoundtripKind` throws `ArgumentException` at runtime — .NET rejects that
  combination — so it uses `DateTimeOffset.Parse(..., AssumeUniversal | AdjustToUniversal).UtcDateTime`
  instead. Confirm the round trip both ways.
- **F2 compensating delete.** Files are now deleted only on exceptions that prove nothing committed;
  every other exception leaves them on disk and logs the orphaned keys. Each delete is individually
  guarded against `IOException`. `LocalFileStorage.SaveAsync` deletes a partial file if the copy throws.
- **F3 trailing dot/space.** One normalisation (`Path.GetFileName(...).TrimEnd('.', ' ')`) feeding
  both validators and `SafeOriginalName`. `SafeOriginalName` also now keeps the **head** of an
  over-long name on a surrogate-safe boundary, not the tail.
- **F4 upload buffering.** `[RequestFormLimits(ValueCountLimit = 8, MemoryBufferThreshold = 64KB)]`
  plus a new `Filters/StudentTaskOwnershipFilter.cs` (`IAsyncResourceFilter`) that rejects an
  unknown or foreign `studentTaskId` **before** the body is buffered, preserving the existing
  `{ code, message }` contract.
- **F5** archived test unified on `ArchivedAt == null`; the three `GroupTaskService` write paths
  return `group.notFound` instead of `access.forbidden`; `NextDeadline` includes overdue steps;
  a fractional mark returns `review.markOutOfRange` (`Mark` is now `decimal?`); dead
  `DTOs/GroupTasks/StudentTaskResponse.cs` deleted; `ILogger` added for decisions, downloads and
  orphaned keys.
- **F6** `workflow-check.mjs` grew from 43 to 49 checks.

### Frontend

Request-sequencing guards in `ReviewQueuePage`, `StepDetails`, `GroupProgressPage`; download
failures now raise a toast and disable the button; `getGroupProgress` pulled out of
`GroupDetailsPage`'s `Promise.all` so a failed matrix no longer blanks the page; `formatBytes`
returns `{ value, unitKey }` with `steps.fileSize.*` in both languages and `Intl.NumberFormat`;
`SubmitWorkForm` mirrors the trailing-dot trim and rejects a zero-byte main file; plus the guarded
route param, the object-URL revoke, cleared `DecisionPanel` errors, the de-duplicated reviewer
header with a responsive grid, the deleted dead `getStudentProgress` export, and `sr-only` text on
the two empty column headers.

**One controller-made change on top of the agent's work:** the agent's fix for the unguarded
translation lookup replaced the design's second-person block-reason copy ("Your work is under
review") with the generic error-catalogue copy, orphaning six approved strings. `StepDetails.tsx`
now has a `blockedMessage` helper that prefers `steps.blocked.*` when it exists and falls back to
`codeMessage(reason)` otherwise — keeping both the approved copy and the robustness. Gates re-run
clean after it.

## 4. Findings NOT fixed — carry these forward

Deferred by the owner in this session, on top of everything already parked in `PROJECT_MEMORY.md`:

- **Security M1** — the content check is four bytes of ZIP magic, so a `.jar` (explicitly on the
  supporting blocklist) passes as a `.docx`. The blocklist's `.jar` entry is decorative. Bounded,
  because the file is served back with a document name and a benign content type behind
  `attachment` + `nosniff`. A real fix opens the stream as a `ZipArchive` and requires
  `[Content_Types].xml` plus the `word/`/`ppt/` prefix, with a compression-ratio cap so the
  validation is not itself a bomb target. **The spec's §5 wording should stop implying the
  blocklist covers `.jar`.**
- **Security L1** — `studentTask.notFound` vs `studentTask.notYours` (and the submission pair) are
  existence oracles, contradicting §6's non-disclosure principle. §7 mandates both codes, so this
  is a spec-level choice. Unexploitable: all ids are random v4 GUIDs. The **file** endpoint gets
  this right — a forbidden file is indistinguishable from a nonexistent one.
- **Security L5 / suspected, needs a test** — `IsLate` compares `DateTime.UtcNow` against a
  deadline whose `Kind` was unverified. The F1 converter should have settled this, but nobody has
  traced what the admin UI actually sends. Set a deadline, submit just before local midnight, check
  the flag. `IsLate` is academically consequential.
- **Review Minor 16** — the review queue is unpaginated; an administrator gets every undecided
  submission. Fine now, note it before a real cohort.
- **Review Minor 18** — spec §8 shortfalls: the student dashboard omits "the most recent decision";
  the teacher dashboard shows a group **count** where §8 asks for "progress of visible groups".
- **Migration note** — the old `InitialCreate` was deleted and replaced. Any database that recorded
  the old id will fail at startup, because `Program.cs` runs `Database.MigrateAsync()`. Harmless
  today (`PROJECT_MEMORY` records nothing is deployed), but it must be a deliberate note rather
  than a first-run surprise.

Extra test gaps for the end-of-project pass, beyond the plan's draft:

- SQL-Server-only: concurrent submit against one `StudentTask`, and concurrent approve/return on
  one submission. Neither is provable on InMemory and neither is in any check script.
- `SubmitAsync` failure paths with an injected throwing `IFileStorage` — assert what survives on
  disk versus in the database.
- `SubmissionFileRules` name normalisation: `"x.exe "`, `"x.exe."`, `"x.EXE"`, a 300-character name
  with a surrogate pair on the 255-boundary.
- `BuildSteps` truth table, including a **missing** `StudentTask` row for an intermediate step —
  the only residual risk from dropping `EnsureStudentTasksAsync`.
- `SubmitWorkForm.validate()` against `SubmissionFileRules` — the extension lists, the 20 MB
  constant and the max-3 count are duplicated across the language boundary with nothing tying them
  together. A table-driven test is the cheapest insurance against drift.
- `parseFileName` in `apiClient.ts`; `DecisionPanel` mark validation; the request-sequencing guards.

## 5. The nice-to-haves question the owner raised

There is **no nice-to-haves phase** in the plan of record. Phases are 1–7; 7 is deferred; nothing
after 6 exists. "The final phase" appears once in `PROJECT_MEMORY.md` (drag-and-drop step
reordering) but is never specified. Roughly 19 items have accumulated with nowhere to land: six
security/hardening (rate limiting and its prerequisites, security logging, the 8-character admin
password, weak identity proof during registration, the 60-minute token window, world-readable
reviewer lists and academic structure), five UX (step reordering, the accessibility pass, a
comment-less rejection showing the student nothing, `selectionClosedRaw` computed only at render,
and the orphaned-upload archive), four performance, three data niggles, and dead code.

**Recommendation put to the owner and still open: name a phase 8 "Hardening and polish" and give it
a design document like every other phase.** The six security items gate a hosted deployment with
real students — they are not polish. The orphaned-upload archive is a feature and wants a design
paragraph of its own.

## 6. Continue prompt

> Start by reading `docs/superpowers/handoffs/2026-09-19-phase-5-resume.md` and
> `docs/superpowers/PROJECT_MEMORY.md` in full and follow them; they override the skill's defaults
> (no per-task reviews, no unit tests, no commits except the plan's final task, one whole-plan
> review with a single fix wave and one scoped re-review). Phase 5 from
> `docs/superpowers/plans/2026-09-17-submission-and-review.md` is implemented through task 9 and its
> fix wave; `.superpowers/sdd/2026-09-17-submission-and-review/PRE-FLIGHT-CONFLICTS.md` records the
> approved deviations and wins over the plan. Pick up at §2: verify the backend fix wave yourself
> (it was never independently verified), re-normalise line endings including the new untracked
> files, then run the scoped re-review with `code-reviewer` (sonnet) over the fix wave only, then
> the browser walkthrough, then task 10 — correcting the two stale "steps created on demand" lines
> in its test-backlog draft before appending them. Use `dotnet-core-expert` (sonnet) for backend and
> `react-specialist` (sonnet) for frontend. Work in the current branch. Tell me before the local
> database is dropped, and never type a password — I sign in for browser walkthroughs. Once every 4
> tasks ask me with clickable options whether to proceed or stop and generate a handoff with a
> continue prompt. Also tell me whether you want to open a phase 8 for the nice-to-haves in §5.
