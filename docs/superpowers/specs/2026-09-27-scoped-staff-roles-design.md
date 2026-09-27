# Diploma Tracker — Scoped Staff Roles Design

Date: 2026-09-27
Status: approved (design only; planned after phase 11 is delivered and tested)
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
  assignment covers its groups.
- **Direction manager scope.** A direction manager is assigned at faculty or department
  level only, because a direction lives in a department.

## 4. Meaning of each role within its scope

- **Teacher.** Everything a teacher does in phase 11, limited to what the scope covers.
  - Publish topics under directions of covered departments.
  - Be the supervisor of a topic in a covered department. A student's proposal picker lists
    only teachers who cover the student's group.
  - Be an extra reviewer on steps of students in covered groups.
  - Visibility: a teacher sees the students they supervise or sit on a panel for, and the
    groups those students are in. Scope limits what they may take on, not what they are shown.
- **Direction manager.** Create and manage directions in covered departments. Everything
  else follows from managing a direction, as in phase 11.
- **Standards controller.** Can be assigned to the steps of covered groups.

### 4.1 Group reviewers are removed

Until phase 11 an administrator could attach teachers to a group as *group reviewers*. Since
phase 9 they decide nothing: they watch the whole group (progress, every student's step pages
and files, the dashboard figures), add and remove extra reviewers on its panels, and keep read
access to the group's archive. Phase 11's direction managers and standards controllers, and
phase 12's scoped roles, cover what is still needed, so the role goes:

- The `GroupReviewers` and `ArchivedGroupReviewers` tables, their endpoints
  (`/api/groups/{id}/reviewers`), the group page's *Reviewers* section and the security events
  that log them are removed.
- **Panels.** Extra reviewers are added and removed by the student's supervisor, the direction
  manager of the student's topic and administrators.
- **Visibility.** `IAccessScope` drops the group-reviewer clause. A teacher's groups are the
  groups of students they supervise, manage through a direction, or sit on a panel for; within
  such a group a row counts only those students. A teacher no longer opens other students of
  the group read-only.
- **Dashboards.** The teacher's group figures count only the caller's own students.
- **Archive.** An archived group is read by administrators, and by the supervisors recorded in
  it for their own students.
- The demo data and check scripts stop creating group reviewers.

## 5. Acting role

- A staff member acts as one role at a time. The user menu carries *Acting as: Teacher /
  Direction manager / Standards controller*, listing only roles they hold somewhere.
- Switching calls `POST /api/auth/acting-role` `{ role }`, which issues a new token with that
  role as its role claim. The existing `[Authorize(Roles = ...)]` attributes keep working,
  and each role keeps its own tabs and dashboard.
- `SessionStateValidator` refuses a token whose acting role the user no longer holds
  anywhere. Every scoped action also checks that the relevant faculty, department or group
  is covered.
- Panel seats belong to roles. A direction manager's step seats and topic approvals appear
  while acting as direction manager, and a supervisor's while acting as teacher.

## 6. Administration

- The Teachers page becomes *Staff*. Each person's page lists their assignments, with *Add
  role* (role plus a faculty, department or group picker) and *Remove*.
- Removing an assignment is refused while it is in use in that scope: supervising a student,
  managing a direction, or controlling a group step there. The refusal
  lists what blocks it, and the administrator reassigns first. This matches every other
  deletion in the system.
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
