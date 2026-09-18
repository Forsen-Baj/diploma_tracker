# Handoff: phase 5, then phase 6

Read this in full before dispatching any subagent, then read
`docs/superpowers/PROJECT_MEMORY.md` — it is the standing project memory and wins over anything
older, including `2026-09-18-phase-4-kickoff.md`, which is now historical.

## 1. Where the project is

| Part | State | Spec | Plan |
|---|---|---|---|
| 1 Platform foundations | Done | system design §5 | `2026-09-15-platform-foundations-and-academic-structure.md` |
| 2 Academic structure | Done | same, §6 | same |
| User onboarding | Done | `2026-09-16-user-onboarding-design.md` | `2026-09-17-user-onboarding.md` |
| 3 Design system + structure refinements | Done — `bc5d647` | `2026-09-17-design-system-design.md`, `2026-09-17-structure-and-administration-refinements-design.md` | matching plans |
| Owner notes from the phase 3 browser test | Done — `f55cab2` | folded into the refinements design | — |
| **4 Topics and reservation** | **Done — `ffa2468`** | `2026-09-17-topics-and-reservation-design.md` (amended 2026-09-18) | `2026-09-17-topics-and-reservation.md` |
| **5 Submission and review** | **Next to do** | `2026-09-17-submission-and-review-design.md` | `2026-09-17-submission-and-review.md` |
| 6 Document templates | Planned | `2026-09-17-document-templates-design.md` | `2026-09-17-document-templates.md` |
| 7 Preview and commenting | Deferred by the owner | — | — |

All paths are under `docs/superpowers/`. Everything is committed on branch `phase3-4`; the owner
merges and creates branches. The local database holds seeded data only.

## 2. How work is run (unchanged)

`superpowers:subagent-driven-development` with the owner's standing adjustments: no per-task
reviews; no unit tests (gaps go to `docs/superpowers/test-backlog.md`); no commits except each
plan's final task; batch consecutive same-area tasks into one dispatch; one whole-plan review,
one fix wave, one scoped re-review. **Every 4 tasks, ask the owner with a clickable question
whether to proceed or stop and hand off.** Anything to approve goes in a file, and the owner is
asked to review the file. Tell the owner before dropping the database.

Agents: `csharp-developer` (sonnet) for backend — **not installed on the `C:\GIT` machine, use
`dotnet-core-expert` (sonnet) there**; `react-specialist` (sonnet) for frontend; `code-reviewer`
(opus) for the whole-plan review; `code-reviewer` (sonnet) for the scoped re-review;
`security-auditor` (opus) before security-sensitive commits. Always pass the model explicitly.

A review package over ~8k lines is split into a backend and a frontend package with one reviewer
each. Phases 3 and 4 both did this.

**Browser walkthroughs: the owner signs in. No subagent and no controller ever types a password.**
Put that prohibition in the dispatch prompt itself — in phase 4 a frontend subagent signed in to
the local dev server with a seed password on its own initiative because the rule was only in the
controller's head.

## 3. What phase 4 actually delivered (beyond its original spec)

The design was amended on 2026-09-18 with three owner-requested capabilities. They are implemented
and the spec describes them as the design:

1. **Administrator assignment from the student form** — `PUT /api/students/{id}/topic`
   (`{ topicId }`, `null` clears), beside `/group` and `/supervisor`. It *replaces*: a pending
   request is cancelled and an approved topic released in the same transaction. There is no
   `POST /api/topics/{id}/assign`.
2. **Change requests** — a student with an approved topic may ask for another catalogue topic or
   propose a new one. Modelled as a `Pending` reservation held alongside the `Approved` one; no
   separate entity, no flag. One pending request at a time. **The selection deadline binds only a
   student who has no approved topic.**
3. **Administrator amendment at any stage** — administrators edit any topic at any status, and
   moving a `Reserved` or `Approved` topic to another supervisor moves the student's supervisor
   with it. Deleting stays limited to `Available` catalogue topics for everyone.

### Two invariants that cost real debugging — do not rediscover them

- **Two separate filtered unique indexes**, not one combined: `StudentProfileId` where `Pending`,
  and where `Approved`. EF identifies an index by its *property set*, so two plain
  `HasIndex(x => x.StudentProfileId)` calls are the same index and the second silently overwrites
  the first whatever `HasDatabaseName` says. Use the `HasIndex(expression, name)` overload.
- **Replacing one of a student's reservations with another saves in two phases inside one
  transaction**: settle what is displaced, `SaveChanges`, write the replacement, `SaveChanges`,
  commit. A single save violates the filtered unique index *intermittently*, because EF picks its
  own statement order — it passed one check run and failed the next. Phase 1 must also clear the
  holder's `TopicId`/`SupervisorId` before a displaced `StudentProposal` topic is deleted; that FK
  is `Restrict` and the delete otherwise 500s.

## 4. Pre-flight notes for phase 5

Scan the plan for conflicts before dispatching, as phases 3 and 4 did:

- **`EnsureStudentTasksAsync`** (creating missing student steps on demand) is already implemented
  differently — steps are created when a student joins a group (`LateJoinerTaskAssigner`). Drop
  that part of the plan.
- Group tasks already carry an optional `StartDate` (informational only). `GroupTask` counts and
  fan-out exclude archived students.
- Services return **error codes**, not English text; controllers use `ErrorResult(code)`; new
  errors need a catalogue entry plus uk and en translations. Pages use `src/components/ui`,
  `useErrorMessage`, toasts and `ConfirmDialog`, and every visible string is a translation key in
  both files.
- A group's identity is its **code**; `Group.Name` does not exist. `StudentResponse` carries
  `claimReopened` and `archivedAt`. The Students page has no deactivate action.
- A student's topic is `StudentProfile.TopicId`, never free text.
- **The interface ships one theme only** — a single set of `--color-*` in `src/index.css`, no
  `prefers-color-scheme` and no toggle. Do not write dark-mode variants.
- The owner recommends a `security-auditor` (opus) pass over upload validation, download
  authorisation and visibility before the phase 5 commit.
- Rate limiting is off by owner decision (`RateLimiting:Enabled` = `false`). Do not re-enable it.

## 5. Open questions parked for the owner

From phase 4's review, not fixed by decision: `IsSelectionOpenAsync` re-reads `PlatformSettings`
on every call; `TopicService` repeats five identical correlated subqueries per topic row;
`StudentProfile.TopicId` and the `Approved` reservation are two sources of truth for whether a
student holds a topic; **a rejection carrying no comment shows the student nothing at all** on
their *My topic* card; `selectionClosedRaw` is computed only at render.

Older, still open: rate limiting before enabling; no security event logging for rate-limit
rejections; student-number normalisation; administrators may set their own password to 8
characters; email + student number is weak proof of identity while registration is open; a group
whose students are all archived cannot be deleted; reviewer lists and the academic structure are
readable by any signed-in user; tokens stay valid up to 60 minutes after archiving; an
accessibility pass.

`fix-wave-backend-extra-check.mjs` fails 3 of 10 checks and has since before phase 4: it asserts a
malformed CSV quote is a file-level error while `StudentImportService` reports it as a row-level
`import.row.malformedQuote` carrying the line the quote opened on. The import still rejects the
whole file. Decide which is right when phase 5 touches uploads.

## 6. Environment reminders

Full list in `PROJECT_MEMORY.md`. The ones that bite on the `C:\GIT\diploma_tracker` machine:

- **NuGet needs an explicit source.** A machine-wide private feed answers 401 and fails every
  restore: `dotnet restore <project> --source https://api.nuget.org/v3/index.json`, then build
  `--no-restore`. The resulting `NU1900` warning is an environment artefact, not a code warning.
- `dotnet run` leaves a child `DiplomaTracker.Api.exe` that locks the build output:
  `taskkill //F //IM DiplomaTracker.Api.exe`, then confirm port 5000 is free.
- The frontend build needs `VITE_API_BASE_URL=http://localhost:5000`.
- Editing tools flip files to CRLF, which makes a commit unreviewable. Normalise touched files
  back to LF before committing, or add a `.gitattributes`.
- Git Bash; quote paths; no Python — use `node`. Secrets live in user-secrets and are never
  printed. `.superpowers/sdd/` is never committed; `.superpowers/checks/` **is**.

## 7. Continue prompt

> Start by reading `docs/superpowers/handoffs/2026-09-19-phase-5-kickoff.md` and
> `docs/superpowers/PROJECT_MEMORY.md` in full and follow them; they override the skill's
> defaults (no per-task reviews, no unit tests, no commits except each plan's final task, one
> whole-plan review with a single fix wave and one scoped re-review). Execute phase 5 from
> `docs/superpowers/plans/2026-09-17-submission-and-review.md` against
> `docs/superpowers/specs/2026-09-17-submission-and-review-design.md`, applying the §4 pre-flight
> notes first and telling me about any conflict you find before you dispatch. Use
> `dotnet-core-expert` (sonnet) for backend, `react-specialist` (sonnet) for frontend,
> `code-reviewer` (opus) for the whole-plan review and `code-reviewer` (sonnet) for the scoped
> re-review, and a `security-auditor` (opus) pass over upload validation, download authorisation
> and visibility before the commit. Work in the current branch. Tell me before the local database
> is dropped, and never type a password — I sign in for browser walkthroughs. Once every 4 tasks
> ask me with clickable options whether to proceed or stop and generate a handoff with a continue
> prompt.
