# Handoff: phase 6 finished, phase 8 next

Read this in full, then `docs/superpowers/PROJECT_MEMORY.md`. It supersedes
`2026-09-19-phase-5-resume.md`, which is now historical.

Branch `phase6`, everything committed, nothing pushed:

| Commit | What |
|---|---|
| `33b51e8` | Add phase 8 design prompt (docs only) |
| `bd87117` | Implement document templates (phase 6) |
| `182caa1` | Fix template upload retry and fill a student's own topic (owner's manual-test findings) |

Base is `07b5025`, the owner's merge of phase 5 into `dev`.

## 1. Is phase 6 ready to merge?

Yes, from this session's side. Everything the plan asked for is implemented, reviewed, fixed and
verified, and the working tree is clean.

**Verified by the controller on 2026-09-20, all after the last commit:**
backend build 0 errors / 0 warnings, `DiplomaTracker.Api.Tests` 56/56, no pending model changes;
`templates-check.mjs` 61/61 twice; `workflow-check` 49/49, `fix-wave-backend-extra-check` 10/10,
`topics-check` 72/72, `refinements-check` 67/67, `onboarding-check` 54/54, `design-system-check`
13/13; frontend `tsc -b`, `lint` 0/0, `i18n:check` (570 keys), production build.

**The one thing nobody has looked at in the interface:** the student's *Download* dialog after the
`182caa1` change (no selector when the student holds one topic; the topic named as context; a
choice only with an approved topic plus a pending change request). The rule itself is proven at
the API — a student naming a catalogue topic gets `topic.notFound` — and the check script covers
it, but the owner had not yet seen the dialog. One student sign-in settles it.

**Local database state after the session** (local only, nothing in the repository): the seed
student holds a pending reservation for `Topic Four 086281`, the owner's `qwe` template is still
there, and the check scripts have left roughly 76 unarchived students and 15 topics in `SEED-A`
(phase 8 item 19; `templates-check.mjs` is the model — it cleans up after itself, even on
failure).

## 2. What phase 6 delivered

Word templates with a fixed 20-marker vocabulary (`{{group.code}}`, not `group.name`), per-template
audiences (groups, named teachers, all teachers, all students — the last administrators only),
upload validation (plain Word documents only; no macros, embedded objects, external relationships
beyond web and mail hyperlinks, attached templates or INCLUDE/LINK/DDE fields; 1,000 zip entries,
100 MB uncompressed, 20 MB of Word XML, depth 128; every `{{…}}` must be a known marker), filling
of body, tables, headers, footers, footnotes, endnotes and comments with split runs merged and the
starting run's formatting kept, author document properties cleared on generation, the Documents
page for every role, and `templates-check.mjs` (61 checks).

Reviews: whole-plan `code-reviewer` (opus) 0 Critical / 3 Important / 17 Minor; `security-auditor`
(opus) 0 Critical / 1 High / 2 Medium / 9 Low; one fix wave; one scoped re-review (sonnet) which
found two Important defects in the field-code check — both fixed and re-verified. All reports are
in `.superpowers/sdd/2026-09-17-document-templates/` (git-ignored, does **not** travel to the
other machine).

### Owner decisions taken this session — do not reopen

1. `.superpowers/sdd/2026-09-17-document-templates/PRE-FLIGHT-CONFLICTS.md` A1–A13 approved; D1 =
   the marker is `{{group.code}}`; D2 = the database drop was approved and done.
2. Security L7 **accepted**: no concurrency cap on generation or upload. L9 **kept**:
   `{{supervisor.email}}` stays visible to students. L8 **implemented**: generation clears the
   author's document properties and the editor reminds authors about comments and tracked changes.
3. The two Minor defects the phase 5 re-review found were fixed, not parked.
4. Parked items were triaged into phase 8 (see §4).

## 3. Two things learned that will bite again

- **`net::ERR_UPLOAD_FILE_CHANGED`.** Chrome refuses to send a `File` whose bytes changed on disk
  after it was picked. The template editor's natural loop — pick a file, get the unknown-marker
  refusal, fix it in Word under the same name, press Save — hit this on every retry, and `fetch`
  rejects with a plain `TypeError`, which the error mapper turned into "Cannot reach the server".
  The server never saw the request and logged nothing. Any future upload form must snapshot the
  bytes at submit (`await file.arrayBuffer()`, upload a fresh `File`) and treat a read failure as
  "the file changed on disk, choose it again" rather than a network error.
- **A subagent can be killed mid-task by a session limit.** It happened here to the backend fix
  wave: the tree was left half-edited with no report. The recovery that worked was a fresh
  implementer whose first instruction was *audit every scope row against the current code and
  write the audit before editing anything*. Use that shape whenever a dispatch dies.
- Subagents that run the API themselves (`dotnet run` … `taskkill //F //IM DiplomaTracker.Api.exe`)
  will kill the controller's preview server too. Expect to restart it, and do not run checks
  against port 5000 while an implementer is building.

## 4. What is next: phase 8

Phases 1–6 are done; phase 7 (document preview and commenting) stays deferred. The next piece of
work is **phase 8 "Hardening and polish"**, whose scope the owner settled on 2026-09-19. The
design prompt, ready to paste into a fresh session, is
`docs/superpowers/handoffs/2026-09-19-phase-8-design-prompt.md` — twenty numbered items across
security and access, features and UX, performance, data, template storage and the repository,
plus an explicit out-of-scope list. Phase 8 needs its own design document and plan before any code.

The accessibility pass stays parked until the owner has consulted on it, and is **not** in phase 8.

## 5. Continue prompt

> Start by reading `docs/superpowers/handoffs/2026-09-20-phase-6-complete.md` and
> `docs/superpowers/PROJECT_MEMORY.md` in full and follow them; they override the skill's defaults
> (no per-task reviews, no unit tests, no commits except each plan's final task, one whole-plan
> review with a single fix wave and one scoped re-review). Phases 1–6 are implemented and phase 6
> is committed on branch `phase6` (`bd87117`, `182caa1`); phase 7 is deferred. Next is phase 8
> "Hardening and polish": run the design prompt in
> `docs/superpowers/handoffs/2026-09-19-phase-8-design-prompt.md` with
> `superpowers:brainstorming`, then `superpowers:writing-plans`, and stop after committing the
> design and the plan on the working branch — do not start implementing until I say so. Use
> `dotnet-core-expert` (sonnet) for backend and `react-specialist` (sonnet) for frontend,
> `code-reviewer` (opus) for whole-plan reviews and (sonnet) for scoped re-reviews. Ask me every
> decision with clickable options, and write anything I need to approve to a file and ask me to
> review the file. Tell me before the local database is dropped, and never type a password — I
> sign in for browser walkthroughs; when you need one, ask with a clickable question instead of
> ending your turn. Once every 4 tasks ask me whether to proceed or stop and generate a handoff.
