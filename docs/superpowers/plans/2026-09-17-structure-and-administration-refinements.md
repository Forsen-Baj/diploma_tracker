# Structure and Administration Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Tasks are specified, not transcribed: implementers write the code from the design and the task text.

**Goal:** Deliver `docs/superpowers/specs/2026-09-17-structure-and-administration-refinements-design.md` together with phase 3 (design system), in the phase 3 commit.

**Spec:** `docs/superpowers/specs/2026-09-17-structure-and-administration-refinements-design.md` (sections cited as §n).

**Prerequisite:** phase 3 Tasks 1–12 implemented in the working tree (error contract with `{ code, message }` and per-area catalogues, `ApiControllerBase.ErrorResult(code)`, `src/components/ui`, `src/components/layout`, `react-i18next` with `uk.json`/`en.json`, all pages migrated).

## Global Constraints

- `net8.0`; EF Core `8.0.8`; no new NuGet or npm packages.
- One regenerated `InitialCreate` migration (three files in `Migrations/`); `has-pending-model-changes` reports no changes. The local database is dropped and recreated (owner approved).
- Every new error is a code in the matching area catalogue with status and English message (§11), and has `uk` and `en` translations; `npm run i18n:check` passes.
- Services keep `(T? result, string? error)` with codes; read-only queries use `AsNoTracking()`; lists project to DTOs.
- Account events use `ILogger<T>` structured templates; never log passwords, hashes or student numbers.
- Pages follow the phase 3 page rules (`.superpowers/sdd/2026-09-17-design-system/pages-shared-rules.md`): components from `src/components/ui`, all text from translations, `ConfirmDialog` for confirmations, toasts for results.
- **No unit tests. No commits** — the phase 3 final task commits everything.
- Git Bash; quote paths; `node` instead of Python.

---

### Task R1: Model, groups, steps per faculty, timeline, late joiners (backend)

**Spec:** §3, §4, §5, §6, §9, §11 (group, taskTemplate, groupTask, faculty codes).

1. Entities and `AppDbContext`: `Group.Code` (required, 32) with unique index (`AcademicYear`, `Code`) replacing (`Name`, `AcademicYear`); `Group.Name` optional (200); `DiplomaTaskTemplate.FacultyId` (required FK, `Restrict`, index); `GroupTask.StartDate` (nullable); `StudentProfile.ArchivedAt` (nullable).
2. Seeder: step templates under faculty `FICS`; `Seed Group A` code `SEED-A` (existing databases are recreated, no data fix needed).
3. Groups: requests/responses with `code` and nullable `name`; `group.codeTaken`; student and group-student responses carry `groupCode`.
4. Faculties: deleting a faculty with templates → `faculty.hasTaskTemplates`.
5. Task templates: `facultyId` filter, required on create, `facultyId`/`facultyName` in responses, `taskTemplate.facultyNotFound`, `taskTemplate.inUse` on faculty change of an assigned template.
6. Group tasks: `startDate` on create/update/responses, `groupTask.startAfterDeadline`, `groupTask.templateFacultyMismatch`; *assign all* limited to the group's faculty's active templates. Student step responses (`/api/student-tasks/mine` and details) carry `startDate`.
7. Late joiners (§9): one service helper that, for given student profile ids, adds a `StudentTask` for each `GroupTask` of the student's current group that the student lacks (same initial status as assignment creates), called before save in: student create, student update and `PUT /api/students/{id}/group` when the group changes, import (for created students). Restore calls it in Task R2.
8. Regenerate `InitialCreate` (`rm -rf DiplomaTracker.Api/Migrations`, `dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations`); stop the API; `dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development`.
9. Gates: API build 0 warnings / 0 errors; Tests build 0 errors (constructor/compile fixes only); `has-pending-model-changes` clean; three migration files.

### Task R2: Administrators and archiving (backend)

**Spec:** §7, §8, §11 (admin, student codes).

1. `AdminsController` + `IAdminService`/`AdminService` per §7 (acting admin id from the authenticated principal, as `StudentsController` does); password policy from `PasswordPolicy`; logs per §7.
2. Archiving per §8: `POST /api/students/archive`, `POST /api/groups/{groupId}/students/archive`, `POST /api/students/restore` (restore calls the R1 late-joiner helper); remove the student deactivate endpoint and service method; `GET /api/students?archived=`; `archivedAt` in student responses; exclude archived from group student lists; `student.archived` on edit, group move, supervisor change and reset access of an archived student; import skip rule; logs per §8.
3. Checks (`.superpowers/checks/`, git-ignored): update `onboarding-check.mjs` and `design-system-check.mjs` for group `code` and the removed deactivate endpoint (keep what they verify). Add `refinements-check.mjs` covering: group code uniqueness per year (409 `group.codeTaken`) and same code in another year allowed; template faculty filter and `groupTask.templateFacultyMismatch`; `groupTask.startAfterDeadline`; a student created in a group that already has assigned steps immediately has those steps (`/api/student-tasks/mine` after claiming or via admin listing, whichever the API exposes); admins create / duplicate email 409 / set password 204 / deactivate self 400 / deactivate last active 409 (create a second admin, deactivate it, then try the seed admin) / activate 204; archive two students → `{ archived: 2 }`, they vanish from `GET /api/students` and appear with `?archived=true`, archived student login 401, edit → 409 `student.archived`, restore → `{ restored: 2 }`; group archive count. Use unique values per run.
4. Run the API (console to `.superpowers/sdd/2026-09-17-design-system/refinements-api.log`), run all three check scripts, grep the log for admin and archive events and confirm no password text, stop the API, confirm port 5000 free.
5. Gates as in R1.

### Task R3: Tooltips, language toggle, title, My steps filter (frontend)

**Spec:** §10.

1. `src/components/ui/Tooltip.tsx` (no new package): wraps a trigger; shows after ~300 ms hover, immediately on focus, hides on leave/blur/Escape; rendered above the trigger; `role="tooltip"` linked via `aria-describedby`.
2. `Button`: when it has an `icon` and no visible children, it renders inside `Tooltip` with its `aria-label` text — so every icon-only action in every page gets a tooltip without page edits.
3. `src/components/ui/TruncatedText.tsx`: renders text with `truncate`; measures overflow (on mount and resize) and wraps in `Tooltip` with the full text only when truncated. Use it wherever pages truncate labels (DataTable cells that truncate, card titles, faculty/department names, group codes/names, selectors' selected text where truncated).
4. Language switch in the shell: one toggle button (`role="switch"`, `aria-checked` = English) showing `UK` and `EN` with a sliding thumb; click anywhere toggles; track and thumb use the `pill` radius.
5. `index.html` title `Diploma Tracker`.
6. `StudentMyTasksPage`: restore the status filter (All + one per step status) using existing components and translation keys (add keys if missing).
7. Gates: `npx tsc -b`, `npm run lint` (0 errors), `npm run i18n:check`, `VITE_API_BASE_URL=http://localhost:5000 npm run build`.

### Task R4: Pages for group code, steps per faculty, timeline, administrators, archiving (frontend)

**Spec:** §4–§8, §11. Contracts exactly as in the spec.

1. Types and API modules: groups (`code`, nullable `name`), students (`groupCode`, `archivedAt`, `archived` query, archive/restore calls, group archive), task templates (`facultyId`, `facultyName`, filter), group tasks and my steps (`startDate`), new `adminsApi.ts`; remove the student deactivate call.
2. Groups page and group details: code as primary label, name secondary; forms with required code; group details *Archive all students* with `ConfirmDialog` (group code and count) and toast with the archived count; step list shows the period (§6); assign-step form with optional start date and required deadline.
3. Every group selector/label across pages (students, import, filters, teacher/student pages) shows the code (and name when present).
4. Task templates page: faculty `Select` above the list (defaults to the first faculty), list and create scoped to it; faculty shown in edit.
5. Students page (§8): status column = claim state only; row checkboxes + header checkbox; *Archive selected (n)*; *Current* / *Archived* view switch; archived view shows archive date and *Restore selected (n)*; remove the deactivate action; confirmation texts state the count and effect.
6. My steps / step details: show the period (§6).
7. Administrators page and route (Admin only) with navigation tab: `DataTable`, create/edit `Modal`, set-password `Modal` with confirmation, deactivate/activate with `ConfirmDialog`; no deactivate on the signed-in admin's row.
8. Translations (uk + en) for every new label, confirmation, toast and the error codes in §11.
9. Gates as in R3.
