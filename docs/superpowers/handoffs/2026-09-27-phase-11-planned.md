# Handoff: phase 11 designed and planned, phase 12 designed

Read `docs/superpowers/PROJECT_MEMORY.md` first for the standing conventions. Nothing in this handoff is implemented yet.

## 1. Where things are

| What | Path |
|---|---|
| Phase 11 design (approved) | `docs/superpowers/specs/2026-09-27-directions-topic-approval-and-standards-control-design.md` |
| Phase 11 plan | `docs/superpowers/plans/2026-09-27-directions-topic-approval-and-standards-control.md` |
| Phase 12 design (approved, not planned) | `docs/superpowers/specs/2026-09-27-scoped-staff-roles-design.md` |
| Branch | `phase11-12` (from `dev` at `e06f1f6`) |

## 2. How to start

1. Check out `phase11-12` and pull.
2. Execute the phase 11 plan with `superpowers:subagent-driven-development`:
   - Tasks 1–3 (backend) go to `csharp-developer` (or `dotnet-core-expert`).
   - Task 4 (check scripts and demo) goes to a general agent or the controller.
   - Tasks 5–6 (frontend) go to `react-specialist`.
   - No task needs the database until Task 7, which drops and regenerates it: **ask the owner first**.
   - Task 7 runs one `code-reviewer` pass over the whole phase and fixes its findings in one wave, before the single commit.
3. Stop after `Implement directions, topic approval and standards control`, with the plain-language test list from the plan's last step. The owner tests by hand and reports bugs.
4. Phase 12 is planned only after that, with `superpowers:writing-plans` on its design.

## 3. Decisions that are easy to get wrong

- **In phase 11, direction manager and standards controller are checkboxes on teacher accounts,** not roles. Phase 12 replaces them with role assignments per faculty, department or group.
- **A topic request needs three approvals:** any administrator, the direction's current manager and the topic's current supervisor. The creator's own seats start approved, and a student's proposal starts with none. One person holding two seats approves once.
- **Return vs reject:** a return (comment required) lets the student edit the wording, catalogue topics included, and resubmit, which clears every approval. A rejection ends the request. A rejected or cancelled catalogue topic gets its original wording back.
- **An approver's wording edit counts as their approval and resets the others.** After final approval only an administrator edits, and nothing reopens.
- **The administrator's assignment carries the administrator's approval but still waits for the other seats.** A topic the student already holds stays theirs until the new one completes. Several `topics-check` expectations change for this; the plan rewrites the script.
- **The direction manager sits on every step panel of their direction's students, with a mark. The standards controller sits on every student step of the group step they are assigned to, without a mark.** Both seats are derived, never copied.
- **`giveTopic` in `checkCleanup.mjs` opens a direction per call**, managed by the given teacher (the seeded teacher is a direction manager), so existing scripts keep their expectations.

## 4. What comes after

- Phase 12, scoped staff roles; then phase 7, document preview and commenting, the last increment.
- Still deferred by the owner: the review minors listed in `PROJECT_MEMORY.md`, the accessibility pass, and the end-of-project unit-test pass (`test-backlog.md`).
