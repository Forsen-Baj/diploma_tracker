# Diploma Tracker — Structure and Administration Refinements Design

Date: 2026-09-17
Status: implemented
Delivered with: phase 3 (design system), in the same commit
Related designs: `2026-09-15-diploma-tracker-system-design.md` (§6 academic structure),
`2026-09-16-user-onboarding-design.md`, `2026-09-17-design-system-design.md`

## 1. Purpose

Groups are identified the way the university names them, workflow steps belong to the faculty
that defines them, steps carry a timeline, several administrators share the work, graduated
students are archived rather than deleted, and every student in a group has the group's steps
no matter when they joined. The interface gains tooltips and a simpler language switch.

## 2. Decisions

| Topic | Decision |
|---|---|
| Group identity | A required `Code` (e.g. `ТВ-52мп`), unique within an academic year. The code is the group's only identity — a group has no name |
| Academic year | A short, punctuation-only value (`2026/2027`): digits and `/ \ - .` and whitespace, at most 20 characters |
| Workflow steps | Each step template belongs to one faculty; a group is assigned only its faculty's steps |
| Step order | `Order` is unique within a faculty. A new step may not take an occupied position; moving an existing step shifts the steps between its old and new position |
| Step timeline | Deadline required; start date optional and informational (does not restrict submission) |
| Administrators | Administrators create, edit, set passwords for, deactivate and reactivate other administrators |
| Student deactivation | Removed. Students are archived instead, one by one, in batches, or per group |
| Archived students | Cannot sign in or claim; hidden by default; keep all their records; can be restored |
| Steps for late joiners | A student joining a group receives every step already assigned to it |
| Tooltips | Every icon-only action and every truncated label shows its full text on hover and keyboard focus |
| Language switch | One two-position toggle; a click anywhere on it switches to the other language |
| Database | The single `InitialCreate` migration is regenerated; the local database is recreated |

## 3. Data model

**`Group`**
- `Code` — required, at most 32 characters, stored trimmed. Unique together with `AcademicYear`.
- A group has **no name**. The code is the whole of its identity: everywhere a group is shown to
  users (lists, selectors, badges, headers, student and teacher pages, future documents) the code
  is the label, and nothing accompanies it.
- `AcademicYear` — required, stored trimmed, at most 20 characters, and composed only of ASCII
  digits, `/`, `\`, `-`, `.` and whitespace. Letters of any alphabet are rejected. The rule is a
  validation attribute alongside `ValidEmailAttribute`, so a violation is the ordinary
  `validation.failed` (400) with `academicYear` reported as `format` rather than an error code of
  its own. `2026/2027` is the intended shape; the rule is deliberately loose enough for
  `2026-2027` or `2026.2027`.
- `Description` — optional, at most 1000 characters.

**`DiplomaTaskTemplate`**
- `FacultyId` — required, foreign key to `Faculty`, `Restrict` on delete. A faculty holding
  step templates cannot be deleted (409).
- Titles need not be unique across faculties.
- `Order` — unique within a faculty, across active and inactive templates alike, enforced by a
  unique index on (`FacultyId`, `Order`). §5 describes what happens when a step is moved.

**`GroupTask`**
- `Deadline` — required (unchanged).
- `StartDate` — optional; when present it must not be later than the deadline.

**`StudentProfile`**
- `ArchivedAt` — optional UTC timestamp. A student is *archived* when it is set. Archiving also
  sets the user's `IsActive` to `false`; restoring clears `ArchivedAt` and sets `IsActive` to
  `true`.

The development seeder assigns the eight seeded step templates to faculty `FICS` at orders 1–8 and
gives the seeded group the code `SEED-A` in academic year `2026/2027`.

## 4. Groups

- Create and update require `code`, `academicYear` and `departmentId`; `description` is optional.
  A duplicate code within the academic year → 409 `group.codeTaken`. An academic year outside the
  format in §3 → 400 `validation.failed` with `fields.academicYear = ["format"]`.
- Group responses carry `code`. Group student responses, student responses and group-task
  responses carry `groupCode`.
- The Groups page shows the code as the card or row title; the group selector in student forms,
  the import panel and filters list the code with the academic year. The academic-year field
  carries a hint naming the allowed characters and `2026/2027` as an example.

## 5. Workflow steps per faculty

- `GET /api/task-templates?facultyId=` — administrators see all templates or one faculty's;
  responses carry `facultyId` and `facultyName`.
- Create requires `facultyId` (unknown → 400 `taskTemplate.facultyNotFound`). The faculty of an
  existing template can be changed only while the template is assigned to no group
  (otherwise 409 `taskTemplate.inUse`).
- Assigning a template to a group requires the template's faculty to equal the group's
  department's faculty (otherwise 400 `groupTask.templateFacultyMismatch`). *Assign all* assigns
  the active templates of the group's faculty only.
- Task templates page: a faculty selector above the list (required choice; the list shows that
  faculty's steps in order); the create form uses the selected faculty.

**Step order.** `Order` is unique within a faculty (§3), which makes the position of a step
unambiguous and the list stable.

- Creating a step at a position another step in that faculty already holds is refused with
  409 `taskTemplate.orderTaken`.
- Changing an existing step's `Order` is a **move**, not a collision: the step takes the requested
  position and the steps between its old and new position **shift by one** to close the gap it
  left and open the gap it needs. Moving a step down from 7 to 2 turns 2…6 into 3…7; moving it up
  from 2 to 7 turns 3…7 into 2…6. The relative order of every other step is preserved, and no
  step is ever swapped past another. A position beyond the end of the list simply shifts a shorter
  block; the list is never renumbered wholesale.
- Moving a step to a different faculty is only possible while it is assigned to no group
  (`taskTemplate.inUse`, above). It is inserted into the target faculty by the same shift rule
  and leaves its old faculty's numbering untouched — the gap it leaves there is not closed, because
  the remaining steps' positions relative to each other have not changed.
- Activating or deactivating a step does not move it.

## 6. Step timeline

- Group task create and update accept `startDate` (optional) and `deadline` (required);
  `startDate` later than `deadline` → 400 `groupTask.startAfterDeadline`.
- Responses for group tasks and student steps carry `startDate` (nullable) and `deadline`.
- The group's steps list and the student's *My steps* page show the period as
  `start – deadline` when a start date exists, otherwise the deadline alone. The start date
  never blocks viewing or submitting.

## 7. Administrators

| Method | Route | Behaviour |
|---|---|---|
| GET | `/api/admins` | All administrator accounts: id, names, patronymic, email, active flag, created/updated |
| POST | `/api/admins` | Body: first name, last name, optional patronymic, email, password (password policy) → 201; duplicate email → 409 `user.emailTaken` |
| PUT | `/api/admins/{id}` | Names and email → 204 |
| PUT | `/api/admins/{id}/password` | Body `{ password }` → 204 |
| POST | `/api/admins/{id}/deactivate` | → 204; own account → 400 `admin.cannotDeactivateSelf`; the last active administrator → 409 `admin.lastActive` |
| POST | `/api/admins/{id}/activate` | → 204 |

All routes require the Admin role; an id that is not an administrator → 404 `admin.notFound`.
Administrators page (Admin, in the navigation): table of administrators with create, edit,
set password (with confirmation field), deactivate and reactivate actions; the signed-in
administrator's own row has no deactivate action. Account events are logged like the onboarding
events: administrator created, password set, deactivated, reactivated — each with the target
user id and the acting administrator id.

## 8. Archiving students

| Method | Route | Behaviour |
|---|---|---|
| POST | `/api/students/archive` | Body `{ studentIds: [...] }` (1–500 ids) → 200 `{ archived }` (count of students newly archived; already archived ids are ignored); an unknown id → 404 `student.notFound` and nothing is archived |
| POST | `/api/groups/{groupId}/students/archive` | Archives every non-archived student of the group → 200 `{ archived }`; unknown group → 404 `group.notFound` |
| POST | `/api/students/restore` | Body `{ studentIds: [...] }` → 200 `{ restored }`; unknown id → 404 `student.notFound` |

Each error code carries one status throughout the API, so an unknown student id is 404 wherever
it appears, in a URL or in a batch body.

- The student deactivate endpoint is removed.
- `GET /api/students` returns non-archived students; `?archived=true` returns archived ones
  (responses carry `archivedAt`). Group student lists exclude archived students.
- Archived students cannot sign in (inactive) or claim, and cannot be edited, reset or moved:
  those actions → 409 `student.archived`. Their steps, and later their topics, submissions and
  files, are kept.
- Import: a row whose email and student number both match an archived student is skipped like
  any existing student; the report lists it. The mismatch rules are unchanged.
- Archiving, restoring and group archiving are logged at Information with the count, the student
  ids (or group id) and the acting administrator id.

**Students page** — the status column shows only the claim state (*Claimed*, *Not claimed*,
*Reopened*). Rows have checkboxes and a header checkbox for the visible rows; with a selection,
an *Archive selected (n)* button opens a confirmation stating the count and that archived
students cannot sign in until restored. A view switch *Current* / *Archived* shows archived
students with their archive date, row checkboxes and a *Restore selected (n)* action.

**Group details page** — an *Archive all students* action with a confirmation naming the group
code and the number of students.

## 9. Steps for students who join later

Whenever a student becomes a member of a group — created individually, imported, moved to
another group, or restored — the student receives a `StudentTask` for every `GroupTask` of that
group that they do not already have, in the same save. Steps from a previous group are kept
as they are. This replaces the on-demand creation planned for phase 5.

## 10. Interface refinements

- **Tooltips** — a `Tooltip` component (shows after a short delay on hover and immediately on
  keyboard focus, positioned above the element, closes on Escape). Every icon-only `Button`
  shows its accessible label as a tooltip. Text that is truncated with an ellipsis (table cells,
  card titles such as faculty and department names, selectors) shows the full text in a tooltip
  only when it is actually truncated.
- **Language switch** — one toggle labelled `UK` and `EN` with a sliding thumb; clicking
  anywhere on the control switches to the other language. The track and thumb are fully
  rounded (`pill` radius); no square corners.
- **Browser tab title** — `Diploma Tracker`.
- **Student *My steps*** — keeps its status filter (all, and one per step status) above the list.

## 11. Error codes added

`group.codeTaken` (409), `taskTemplate.facultyNotFound` (400), `taskTemplate.inUse` (409),
`taskTemplate.orderTaken` (409),
`faculty.hasTaskTemplates` (409), `groupTask.templateFacultyMismatch` (400),
`groupTask.startAfterDeadline` (400), `admin.notFound` (404), `admin.cannotDeactivateSelf` (400),
`admin.lastActive` (409), `student.archived` (409). Each has uk and en translations.

## 12. Not included

- Deleting student accounts or their records. A consequence worth naming: because a group cannot
  be deleted while any student — archived or not — still points at it, a group that ever held a
  student can only be retired by moving its students elsewhere first.
- Restricting submission before a step's start date.
- Reordering steps by dragging them. The order is edited as a number on the step's form; the
  drag-and-drop gesture belongs to the final phase, after the core workflows.
- Per-department step templates.
- Topic assignment, topic change requests and administrator topic amendments — these extend
  phase 4 (`2026-09-17-topics-and-reservation-design.md`).
