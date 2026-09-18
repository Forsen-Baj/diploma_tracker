# Handoff: refinement notes, phase 4 amendments, then phases 4–6

Read this in full before dispatching any subagent, then read
`docs/superpowers/PROJECT_MEMORY.md` — it is the standing project memory and wins over
anything older (including `2026-09-17-implementation-kickoff.md`, which is historical except
where this file repeats it).

## 1. Where the project is

| Part | State | Spec | Plan |
|---|---|---|---|
| 1 Platform foundations | Done, on `master` | system design §5 | `2026-09-15-platform-foundations-and-academic-structure.md` |
| 2 Academic structure | Done | same, §6 | same |
| User onboarding | Done — `58bead1`, follow-up `c2977ac` | `2026-09-16-user-onboarding-design.md` | `2026-09-17-user-onboarding.md` |
| 3 Design system | Done — `Implement design system and structure refinements` | `2026-09-17-design-system-design.md` | `2026-09-17-design-system.md` |
| Structure and administration refinements | Done — same commit | `2026-09-17-structure-and-administration-refinements-design.md` | `2026-09-17-structure-and-administration-refinements.md` |
| **Owner notes from the phase 3 browser test** | **Next to do** | this file, §3 | — |
| 4 Topics and reservation | Planned; spec and plan need the §4 amendments first | `2026-09-17-topics-and-reservation-design.md` | `2026-09-17-topics-and-reservation.md` |
| 5 Submission and review | Planned | `2026-09-17-submission-and-review-design.md` | `2026-09-17-submission-and-review.md` |
| 6 Document templates | Planned | `2026-09-17-document-templates-design.md` | `2026-09-17-document-templates.md` |
| 7 Preview and commenting | Deferred by the owner | — | — |

All paths are under `docs/superpowers/`. Everything is committed on branch `phase1-2`; the owner
merges and creates branches. The local database was rebuilt during phase 3, so it holds only
seeded data plus rows left behind by the check scripts.

## 2. How work is run (unchanged)

`superpowers:subagent-driven-development` with the owner's standing adjustments: no per-task
reviews; no unit tests (gaps go to `docs/superpowers/test-backlog.md`); no commits except each
plan's final task; batch consecutive same-area tasks into one dispatch; `csharp-developer`
(sonnet) for backend, `react-specialist` (sonnet) for frontend, `code-reviewer` (opus) for the
whole-plan review, `code-reviewer` (sonnet) for the scoped re-review of the fix wave,
`security-auditor` (opus) before security-sensitive commits. Always pass the model explicitly.
Tell the owner before dropping the database. **Every 4 tasks, ask the owner with a clickable
question whether to proceed or stop and hand off.** Anything to approve goes in a file, and the
owner is asked to review the file.

A whole-phase review package larger than ~8k lines is split into a backend and a frontend
package with one reviewer each (this is what phase 3 did).

Browser walkthroughs: the controller starts `api` (:5000) and `web` (:5173) from
`.claude/launch.json` in the in-app browser; **the owner signs in** (seed accounts are in
`Services/DbSeeder.cs`); the controller never types passwords. Stop both servers afterwards —
a running API locks the build output.

## 3. Owner notes from the phase 3 browser test — do these first

One increment, one commit, on whatever branch the owner has checked out. A spec amendment is
not needed; these are corrections to the refinements design, so update
`2026-09-17-structure-and-administration-refinements-design.md` (§3, §4, §5) as part of the work
and describe the result as the design, not as a fix list.

1. **Check scripts pollute the academic-year list.** `refinements-check.mjs` builds academic
   years as `RF-<stamp>-A`, so the Groups page shows values like `RF-077685-A`. Use realistic
   values (`2026/2027`, `2027/2028`) with uniqueness carried by the group code, and delete every
   group the script creates at the end of the run (archive or remove the students first). Check
   the other two scripts for the same habit.
2. **Academic year accepts only** digits, `/`, `\`, `-`, `.` and whitespace, at most 20
   characters, trimmed, non-blank. Reject anything else with `validation.failed` (a validation
   attribute next to `ValidEmailAttribute`), and add the same pattern hint to the form field.
3. **Remove `Group.Name` entirely** — entity, DTOs, requests, responses, seeder, frontend types,
   forms, labels, translations, check scripts. The code is the only group identity. Regenerate
   the single `InitialCreate` migration and rebuild the database (tell the owner first).
4. **Step template `Order` is unique per faculty.** Reject duplicates with a new code
   (`taskTemplate.orderTaken`, 409) and translate it; decide and record whether reordering
   swaps or shifts the neighbours.
5. **Not now:** drag-and-drop reordering of step templates. The owner wants it in the final
   phase, after the core workflows.

## 4. Phase 4 needs spec and plan amendments before it runs

The owner asked for three topic capabilities that the current phase 4 design does not cover.
Write them into `2026-09-17-topics-and-reservation-design.md` and the matching plan, then ask
the owner to review the files before implementing:

1. An administrator assigns a topic to a student directly from the student form (a dropdown of
   selectable topics), which creates the approved reservation and sets the supervisor.
2. A student with an approved topic can request a change — to another available catalogue topic
   or as a new proposal to a chosen teacher — approved by the teacher who would supervise it, or
   by an administrator. Decide and record: one pending request at a time, and whether the
   selection deadline applies to change requests (the controller's draft answer: it does not,
   because changes happen later in the year).
3. An administrator can amend a topic at any stage, not only while it is `Available`; changing
   the supervisor of a reserved topic moves the student's supervisor with it.

Phase 4 also already plans to replace the free-text `StudentProfile.DiplomaTopic` with `TopicId`
and to move the registration switch to a new Settings page.

## 5. Pre-flight notes for the remaining plans

The plans for 4–6 were written before onboarding's fix wave, the onboarding follow-up and
phase 3. Scan each for conflicts before dispatching, as phase 3 did with `carry-forward.md`:

- **Every plan:** services now return **error codes**, not English text; controllers use
  `ErrorResult(code)`; new errors need a catalogue entry plus uk and en translations. Pages use
  the `src/components/ui` library, `useErrorMessage`, toasts and `ConfirmDialog`, and every
  visible string is a translation key in both files.
- **Phase 4:** group labels are the code (`Group.Name` disappears in §3 above); the Students page
  no longer has a deactivate action; `StudentResponse` carries `claimReopened` and `archivedAt`.
- **Phase 5:** its `EnsureStudentTasksAsync` (creating missing student steps on demand) is already
  implemented differently — steps are created when a student joins a group
  (`LateJoinerTaskAssigner`); drop that part of the plan. Group tasks already carry an optional
  `StartDate` (informational only). `GroupTask` counts and fan-out exclude archived students.
  The owner recommends a `security-auditor` pass over upload validation, download authorisation
  and visibility.
- **Phase 6:** documents show the group **code**; the optional patronymic exists on users.
- **Rate limiting is off** (`RateLimiting:Enabled` = `false` in `appsettings.json`) by owner
  decision, and phase 3's plan text about the limiter is already applied. Do not re-enable it.

## 6. Open questions parked for the owner

Rate limiting before enabling (forwarded headers for a reverse proxy, per-IP budget shared by a
classroom, login and claim sharing one budget, no limit on password change); no security event
logging for rate-limit rejections; student-number normalisation keeps internal spaces and does not
fold Latin/Cyrillic lookalikes; administrators may set their own password to 8 characters;
email + student number is weak proof of identity while registration is open; a group whose
students are all archived cannot be deleted; reviewer lists and the academic structure are
readable by any signed-in user; tokens stay valid up to 60 minutes after archiving or
deactivation; an accessibility pass (request sequencing, modal initial focus, segmented-control
keyboard behaviour, loading states announced to assistive technology).

## 7. Environment reminders

Full list in `PROJECT_MEMORY.md`. The ones that bite most: Git Bash, quoted paths (spaces and
Cyrillic), no Python — use `node`; `dotnet run` leaves a child `DiplomaTracker.Api.exe` that
locks the build output (`taskkill //F //IM DiplomaTracker.Api.exe`, then confirm port 5000 is
free); the frontend build needs `VITE_API_BASE_URL=http://localhost:5000`; secrets live in
user-secrets and are never printed or staged; `.superpowers/` is never committed.
