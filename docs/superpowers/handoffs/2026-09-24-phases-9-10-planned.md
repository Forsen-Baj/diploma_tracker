# Handoff: phases 9 and 10 designed and planned

Read `docs/superpowers/PROJECT_MEMORY.md` first for the standing conventions. Nothing in this handoff is implemented yet.

## 1. Where things are

| What | Path |
|---|---|
| Design (approved) | `docs/superpowers/specs/2026-09-24-review-panels-and-document-routing-design.md` |
| Phase 9 plan — review panels | `docs/superpowers/plans/2026-09-24-review-panels.md` |
| Phase 10 plan — document routing | `docs/superpowers/plans/2026-09-24-document-routing.md` |
| Branch | `feature-dms` (branched from `master` at `f889e3f`, where `dev` and `master` were equal) |

## 2. How to start

1. Check out `feature-dms` and pull.
2. Execute the phase 9 plan with `superpowers:subagent-driven-development`:
   - Backend tasks go to `csharp-developer` (or `dotnet-core-expert`).
   - Frontend tasks go to `react-specialist`.
   - Tasks 1–4 need no database. Task 5 drops and regenerates the database: **ask the owner first**.
   - After Task 5, run one `code-reviewer` pass over the whole phase and fix its findings in one wave.
3. Stop after the phase 9 commit (`Implement review panels`) with the plain-language test list the plan's last step gives. The owner tests by hand and reports bugs.
4. Then do the same for the phase 10 plan (`Implement document routing`). It assumes phase 9 is committed.

## 3. Decisions that are easy to get wrong

- **Group reviewers stop deciding in phase 9.** They still see their groups and can add extra reviewers, but only the supervisor, the extra reviewers and an administrator standing in decide. Two existing check scripts change for this (`workflow-check` check 16, and the queue block of `hardening-check`), and so does the demo seed. The plan gives exact edits.
- **Approvals stick.** After a return, only reviewers who have not yet approved decide on the next version.
- **Routed documents are visible to participants only.** Administrators have no special access.
- **Every document write carries `expectedSequence`.** A stale page gets `document.changed`.
- **Group deletion** now releases documents inside its transaction, using `ExecuteDelete`/`ExecuteUpdate` (the InMemory test provider cannot run these).
- **The *Documents* page is split into four sections**, and `templates.title` becomes "Templates" / "Шаблони".

## 4. What comes after

- **Phase 7, document preview and commenting:** the owner wants it as the very last increment. It has no design yet; start with `superpowers:brainstorming`.
- **Still deferred by the owner:** review minors M6, M7, M11, M12 and deferred minors D4, D5, D7; the Steps page delete button; the accessibility pass; the end-of-project unit-test pass (`test-backlog.md`).
