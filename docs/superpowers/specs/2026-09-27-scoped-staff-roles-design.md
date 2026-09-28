# Diploma Tracker — Scoped Staff Roles Design

Date: 2026-09-27
Status: approved (amended 2026-09-28 while planning: §3 acting value and scope deletion, §4
coverage rules, §4.1 step assignment and the archive record, §4.2 dashboards, §5 topic approvals,
§6 removal blockers)
Parent design: `2026-09-15-diploma-tracker-system-design.md`
Builds on: directions, topic approval and standards control (phase 11,
`2026-09-27-directions-topic-approval-and-standards-control-design.md`)

## 1. Purpose

Phase 11 gives teacher accounts two capabilities, *direction manager* and *standards
controller*, and they apply everywhere. Phase 12 turns teacher, direction manager and
standards controller into roles that an administrator assigns per faculty, department or
group. One person can hold different roles in different places: a teacher in one group and a
direction manager in another department.

Administrators and students stay outside this system; their account roles do not change.

## 2. Decisions

| Topic | Decision |
|---|---|
| Staff roles | Teacher, direction manager and standards controller, assigned per scope. One person may hold different roles in different places |
| Scope levels | Faculty, department or group. An assignment covers everything beneath it |
| Teacher role | Everything a teacher does today, limited to their scope |
| Interface | A role switcher: the user acts as one role at a time, and each role keeps its own tabs and dashboard |
| Who assigns | Administrators only |
| Group reviewers | Removed. Every duty they had belongs to a supervisor, a direction manager, a standards controller or an administrator (§4.1) |

## 3. Model

- `AppUser.Role` becomes `Admin`, `Staff` or `Student`. Teacher accounts become `Staff`
  accounts, and the phase 11 flags are removed.
- **`RoleAssignment`**:

  | Field | Rules |
  |---|---|
  | `Id` | Guid |
  | `UserId` | required; a `Staff` account |
  | `Role` | `Teacher`, `DirectionManager` or `StandardsController` (string) |
  | `ScopeKind` | `Faculty`, `Department` or `Group` (string) |
  | `ScopeId` | the faculty, department or group |
  | `CreatedById`, `CreatedAt` | the administrator and the time |

  Unique on (`UserId`, `Role`, `ScopeKind`, `ScopeId`).
- **Coverage.** A faculty assignment covers its departments and groups. A department
  assignment covers its groups. A person covers a place in a role when any of their assignments
  of that role covers it.
- **Direction manager scope.** A direction manager is assigned at faculty or department
  level only, because a direction lives in a department.
- **Deleting a place.** A faculty, department or group can be deleted only when nothing that an
  assignment protects is left in it (its groups, directions and students block the deletion as
  before). The assignments scoped to it are deleted with it: they have nothing left to cover.

## 4. Meaning of each role within its scope

- **Teacher.** Everything a teacher does in phase 11, limited to what the scope covers.
  - Publish catalogue topics under directions of covered departments. A catalogue topic's
    supervisor covers the topic's department.
  - Supervise a student in a covered group: through a catalogue topic, a proposal or an
    administrator's assignment. A student's proposal picker lists only teachers who cover the
    student's group, and an administrator names a supervisor who covers the student's group. A
    teacher assigned to one group therefore supervises proposals from that group but publishes no
    catalogue topics.
  - Be an extra reviewer on steps of students in covered groups.
  - Visibility: a teacher sees the students they supervise or sit on a panel for, and the
    groups those students are in. Scope limits what they may take on, not what they are shown.
- **Direction manager.** Create and manage directions in covered departments. Everything
  else follows from managing a direction, as in phase 11. An administrator names a manager who
  covers the direction's department, also when a direction moves to another department.
- **Standards controller.** Can be assigned to the steps of covered groups.
- **When coverage is checked.** Coverage is checked when someone takes something on: publishing
  a topic, becoming a supervisor, a direction manager, an extra reviewer or a group step's
  standards controller, and opening a direction. Work already held is not re-checked. A seat on a
  panel or a request is decided by whoever holds it, and a student moved to a group their
  supervisor does not cover keeps that supervisor. §6 keeps assignments from being removed from
  under work in progress.

### 4.1 Group reviewers are removed

Until phase 11 an administrator could attach teachers to a group as *group reviewers*. Since
phase 9 they decide nothing: they watch the whole group (progress, every student's step pages
and files, the dashboard figures), add and remove extra reviewers on its panels, assign steps to
the group and change their deadlines, and keep read access to the group's archive. Phase 11's
direction managers and standards controllers, and phase 12's scoped roles, cover what is still
needed, so the role goes:

- The `GroupReviewers` and `ArchivedGroupReviewers` tables, their endpoints
  (`/api/groups/{id}/reviewers`), the group page's *Reviewers* section and the security events
  that log them are removed.
- **Panels.** Extra reviewers are added and removed by the student's supervisor, the direction
  manager of the student's topic and administrators.
- **Steps of a group.** Assigning steps to a group and changing their dates are the
  administrators'.
- **Visibility.** `IAccessScope` drops the group-reviewer clause. A teacher's groups are the
  groups of students they supervise, manage through a direction, or sit on a panel for; within
  such a group a row counts only those students. A teacher no longer opens other students of
  the group read-only.
- **Dashboards.** The teacher's group figures count only the caller's own students.
- **Archive.** An archived group is read by administrators, and by the supervisors recorded in
  it for their own students. The archive records each student's supervisor at the moment their
  work is archived, beside every file and decision, and a supervisor sees only those rows.
- The demo data and check scripts stop creating group reviewers.

### 4.2 What each role sees

Each acting role has its own tabs and a dashboard of the same shape, over what the role holds:

| Role | Students it works with | Tabs |
|---|---|---|
| Teacher | students they supervise, and students on whose steps they sit as an extra reviewer | Dashboard, Review, Groups, My topics, Documents, Archive, Steps |
| Direction manager | students whose topic is in one of their directions | Dashboard, Review, Groups, Directions, Documents |
| Standards controller | students of the group steps they control | Dashboard, Review, Groups, Documents |

A student is opened in full (every step, the panel) by their supervisor and by the manager of
their topic's direction. An extra reviewer and a standards controller open only the steps they sit
on.

## 5. Acting role

- A staff member acts as one role at a time. The user menu carries *Acting as: Teacher /
  Direction manager / Standards controller*, listing only roles they hold somewhere. At sign-in
  the first role they hold is chosen in that order; a staff member who holds none acts as none
  (the role claim `Staff`).
- Switching calls `POST /api/auth/acting-role` `{ role }`, which issues a new token with that
  role as its role claim. The existing `[Authorize(Roles = ...)]` attributes keep working,
  and each role keeps its own tabs and dashboard.
- `SessionStateValidator` refuses a token whose acting role the user no longer holds
  anywhere. Every scoped action also checks that the relevant faculty, department or group
  is covered (§4, *When coverage is checked*).
- Panel seats belong to roles. A direction manager's step seats and topic approvals appear
  while acting as direction manager, and a supervisor's while acting as teacher. On a step one
  person still holds one seat (phase 11), so the seat decides the role they act in. On a topic
  request one approval still fills every seat its author holds, whichever of their roles gave it.

## 6. Administration

- The Teachers page becomes *Staff*. Each person's page lists their assignments, with *Add
  role* (role plus a faculty, department or group picker) and *Remove*.
- Removing an assignment is refused while it is in use in that scope and no other assignment of
  the same person and role covers the same place. In use means:
  - **Teacher:** supervising an active student, supervising a topic that is available or asked
    for, or sitting as an extra reviewer on a step that is not approved;
  - **Direction manager:** managing a direction;
  - **Standards controller:** controlling a group step.

  The refusal lists what blocks it, and the administrator reassigns first. This matches every
  other deletion in the system.
- A staff member with no assignments can still sign in, but sees only *Account* and
  *Documents*.
- Administrators remain a separate account role, outside role assignments.

## 7. Delivery

One plan and one commit. `InitialCreate` is regenerated, and seeds, the demo data and the
check scripts move from flags to assignments.

## 8. Not included

- Roles assigned by anyone other than an administrator.
- Scoped administrators.
- Acting as several roles at once. The user switches.
