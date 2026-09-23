# Handoff: phase 8 closed

This supersedes `2026-09-21-phase-8-complete.md`: everything it listed as open is done. Read
`docs/superpowers/PROJECT_MEMORY.md` for the standing conventions.

## 1. First thing on any other machine

`InitialCreate` was regenerated once more on 2026-09-23 (wider archive name columns). Drop the
local database, start the API so it re-seeds, and load the demo data if you want it:

```
dotnet ef database drop --force --project backend/DiplomaTracker.Api -- --environment Development
node .superpowers/demo/seed-demo.mjs
```

The demo script needs the API running on :5000. Ask the owner before dropping.

## 2. Commits on `phase7` since the tasks 1-8 handoff

| Commit | What |
|---|---|
| `Implement hardening and polish` | Plan tasks 1-17 and 19 |
| `Normalise line endings` | `.gitattributes` and pure line-ending rewrites |
| `Fix test project and check scripts` | Test project compiles (56/56). Check scripts fixed and leak-free (`removeGroup`, `addLast`, and undo steps are judged by their API response). `DELETE /api/task-templates/{id}`. An EF fix for a second archiving of a reviewed group |
| `Apply whole-plan review fixes` | Review: 0 Critical, 3 Important, 14 Minor. All Important and nine Minor findings fixed; the scoped re-review found everything resolved. `InitialCreate` regenerated |
| `Require a topic before step work and add demo data` | Work on the steps is refused (`step.topicRequired`) until the student holds a topic. Ukrainian demo data and walkthrough |
| `Scope the teacher dashboard group table to reviewed groups` | Design §7.4, found in the owner's walkthrough |

The review, fix-wave briefs and reports are in `.superpowers/sdd/2026-09-21-hardening-and-polish/`.
That directory is git-ignored and exists only on the first machine; everything that matters from
it is in the design, `test-backlog.md` and this file.

## 3. State

- **Check scripts:** all eight pass, 362 checks, on a fresh seed. A full run leaves only
  deactivated staff accounts behind; the system cannot delete staff.
- **Walkthrough:** the owner walked through §6 in the browser as administrator, teacher and
  student on the demo data, which produced the two follow-up commits. The administrator's
  Archive, Groups (delete dialog), Steps (drag) and Review queue pages were not opened in the
  browser pane during that session.

## 4. Deferred by the owner, not scheduled

- **Phase 7:** document preview and commenting.
- **Accessibility pass:** parked until the owner has consulted on it.
- **Steps page delete button:** deletion exists in the API only.
- **Review Minors:**
  - M6: dashboards count steps left behind by students who moved group;
  - M7: the topic page hides *Cancel* by itself at the deadline;
  - M11: the overdue list says "and N more" past 20 rows;
  - M12: four admin tiles have no link.
- **Deferred minors D4, D5, D7:** name formatting, archived submissions in the backlog
  headline, and a plural form.

## 5. Next

The owner merges `phase7` and decides what comes next. Nothing is in progress.
