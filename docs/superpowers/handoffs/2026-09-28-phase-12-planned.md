# Handoff: phase 12 planned

Read `docs/superpowers/PROJECT_MEMORY.md` first for the standing conventions. Nothing in this handoff is implemented yet.

## 1. Where things are

| What | Path |
|---|---|
| Phase 12 design (approved, amended 2026-09-28 while planning) | `docs/superpowers/specs/2026-09-27-scoped-staff-roles-design.md` |
| Phase 12 plan | `docs/superpowers/plans/2026-09-28-scoped-staff-roles.md` |
| Branch | `phase11-12` (phase 11 committed at `80306d2`, walkthrough fixes at `de264f6`) |

## 2. How to start

1. Check out `phase11-12` and pull.
2. Execute the plan with `superpowers:subagent-driven-development`:
   - Tasks 1–3 (backend) go to `csharp-developer` (or `dotnet-core-expert`); each ends with a green build and test run.
   - Task 4 (check scripts and demo) goes to a general agent or the controller.
   - Tasks 5–6 (frontend) go to `react-specialist`.
   - No task needs the database until Task 7, which drops and regenerates it: **ask the owner first**.
   - Task 7 runs one `code-reviewer` pass over the whole phase and fixes its findings in one wave, before the single commit `Implement scoped staff roles`.
3. Stop after the commit, with the plain-language test list from the plan's last step. The owner tests by hand and reports bugs.

## 3. What the design review changed (spec amended 2026-09-28)

- **Group reviewers also assigned steps to their group and changed deadlines** (API only). That passes to administrators; group-step writes answer 403 to staff.
- **A group-level teacher could supervise nothing** under the first wording. Now: supervising a student needs a teacher role covering the student's group; publishing a catalogue topic needs one covering the topic's department.
- **Removal blockers were incomplete.** Topics a teacher supervises (available or asked for) and open extra-reviewer seats also block, or a submitted step could wait for someone who can no longer act. Coverage from the person's other assignments of the same role frees a removal.
- **The archive recorded no supervisor.** Archived files and reviews now carry `SupervisorId`.
- **Deleting a faculty, department or group** deletes the assignments scoped to it.
- **Coverage is checked when work is taken on,** never when held work is decided; a group move keeps the supervisor.
- **Topic approvals stay by person** (one approval fills every seat its author holds); a request appears in each role that holds a seat on it.
- The spec now has a table of what each role sees (§4.2).

## 4. Decisions that are easy to get wrong

- **The token's role claim is the acting role** (`Teacher`, `DirectionManager`, `StandardsController`, or `Staff` for none). `UserContext.IsTeacher` means *acting as* teacher; `IsStaff` means any staff account.
- **`/api/teachers` becomes `/api/staff`**, roles at `/api/staff/{id}/roles`, the picker at `/api/staff/options` with `role`, `groupId`, `departmentId`, `studentTaskId`.
- **Staff routes move to `/staff/*`** in the interface; a staff member acting in no role lands on `/documents`.
- **The check scripts create staff with `makeStaff` and roles with `grantRoles`,** and switch with `actAs` (`checkCleanup.mjs`). `giveTopic` grants the teacher the teacher and direction-manager roles for the department first.
- **O1 (phase 11 follow-up) is Task 3 Step 2:** `ReservationService.CompleteAsync` calls `RefreshStudentPanelsAsync` when the request replaces a held topic. `scoped-roles-check` O01–O04 prove it.

## 5. What comes after

- Phase 7, document preview and commenting, the last increment.
- Still deferred by the owner: the review minors listed in `PROJECT_MEMORY.md`, the accessibility pass, and the end-of-project unit-test pass (`test-backlog.md`).
