# Diploma Tracker — Directions, Topic Approval and Standards Control Design

Date: 2026-09-27
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md`
Builds on: topics and reservation (phase 4), review panels (phase 9)
Followed by: scoped staff roles (phase 12, `2026-09-27-scoped-staff-roles-design.md`)

## 1. Purpose

Phase 11 adds three responsibilities alongside the teacher's:

- The **direction manager** (керівник напрямку) opens directions: named research areas inside
  a department. Every topic belongs to a direction, and a student who proposes a topic picks
  one.
- A reserved topic becomes the student's only after three people approve it: an
  administrator, the direction's manager and the supervising teacher.
- The **standards controller** (нормоконтролер) checks that submitted work follows the
  formatting standard. An administrator assigns one to a group's step, and the controller
  then sits on the review panel of every student on that step.

The direction manager also sits on the review panel of every step of every student whose
topic is in their direction, as the supervisor does.

In this phase both responsibilities are capabilities of a teacher account. Phase 12 turns
them, and the teacher role itself, into roles assigned per faculty, department or group.

## 2. Decisions

| Topic | Decision |
|---|---|
| New responsibilities | Two capabilities on teacher accounts: *direction manager* and *standards controller*. An administrator ticks them on the Teachers page. One account can hold both. Phase 12 turns them into scoped roles |
| Direction | Belongs to one department. Created by a direction manager, who manages it, or by an administrator, who names the manager |
| Topic and direction | Every topic has exactly one direction. A topic's department is its direction's department |
| Who publishes topics | A teacher, under any direction, as its supervisor. A direction manager, under their own direction, for any teacher. An administrator, anywhere, for any teacher |
| Who manages a direction | Its manager and any administrator. An administrator can hand a direction to another manager |
| Topic approval | A reserved topic needs three approvals: any administrator, the direction's manager, and the topic's supervisor |
| Creator's approval | Whoever created the topic has already approved it in every seat they hold. A student's proposal starts with no approvals |
| One person, several seats | One approval fills every seat that person holds. A direction manager who supervises the topic approves once |
| Rejecting and returning | Each approver can **return** the request for changes (comment required) or **reject** it (comment optional). A returned student edits the topic's title and description and resubmits. A rejection ends the request |
| Editing during approval | An approver may edit the title and description while the request waits for approvals. The edit counts as the editor's approval, and every other approval must be given again. A student's resubmission clears every approval |
| Editing after approval | Only an administrator, and it does not reopen approval |
| Administrator assignment | Reserves the topic with the assigning administrator's approval. The other seats still approve |
| Direction manager on steps | Sits on every step's panel of every student whose topic is in their direction. Approves with a mark that counts in the average, or returns |
| Standards controller on steps | Assigned by an administrator to one group's step from the *Steps* tab. Sits on the panel of every student on that step, including students who join later. Approves without a mark, or returns |

## 3. Staff capabilities

`AppUser` gains two flags, used only on accounts with the `Teacher` role:

| Field | Meaning |
|---|---|
| `IsDirectionManager` | May create and manage directions, and approves topics and steps in them |
| `IsStandardsController` | May be assigned as a group step's standards controller |

- An administrator sets both on the teacher form (create and edit). The teacher list shows
  them as badges.
- A flag cannot be cleared while it is in use: `staff.managesDirections` (409) while the
  teacher manages a direction, and `staff.controlsSteps` (409) while they are the standards
  controller of any group step. Deactivating the teacher is refused for the same reasons, with
  the same codes. The administrator first reassigns the directions or steps.
- The server reads the flags from the account on every request, like the role. It never
  trusts a copy in the token. `GET /api/auth/me` returns them so the interface can show the
  matching tabs.
- `GET /api/staff/options` gains `capability=directionManager|standardsController`, which
  limits the picker to active teachers with that flag.

## 4. Directions

### 4.1 Domain model

**`Direction`**

| Field | Rules |
|---|---|
| `Id` | Guid |
| `DepartmentId` | required; `Restrict` |
| `Name` | required, at most 200 characters, unique within the department |
| `Description` | optional, at most 2000 characters |
| `ManagerId` | required; an active teacher with `IsDirectionManager`; `Restrict` |
| `CreatedAt`, `UpdatedAt` | UTC |

**`Topic`**: `DepartmentId` is replaced by `DirectionId` (required, `Restrict`). The topic's
department is `Direction.DepartmentId`. Two things still depend on the department, and both
now reach it through the direction: which topics a student may discover, and which
department a proposal belongs to. `Topic` also gains `CreatedById` (required; the user who
created it, a student for a proposal; `NoAction`).

A department that has directions cannot be deleted (409, the existing `Restrict` pattern).

### 4.2 Rules

- **Create.** A direction manager creates a direction in any department and manages it. An
  administrator creates one and names its manager.
- **Edit.** The manager or an administrator may change the name and description. The
  department can change only while the direction has no topics (`direction.hasTopics`,
  409). Only an administrator may change the manager.
- **Changing the manager.** The direction's approval seat on open topic requests, and its
  seat on step panels, move to the new manager at once. The former manager's approvals stop
  counting for those seats. This is the same rule the step panel already follows when the
  supervisor changes.
- **Delete.** Allowed for the manager or an administrator, only while the direction has no
  topics (`direction.hasTopics`, 409).

### 4.3 Topics under directions

- **Teacher.** Creates a catalogue topic under any direction and supervises it.
- **Direction manager.** Under their own direction, names any active teacher as supervisor,
  themselves included. Under another manager's direction, they act as an ordinary teacher.
- **Administrator.** Any direction, any supervisor, as today.
- **Editing and deleting an `Available` topic.** Allowed for its supervisor, its direction's
  manager and administrators.
- **Moving a topic to another direction.** Only an administrator, at any status. This
  replaces today's department change.
- **Student proposal.** The student names a title, a description, a supervisor and a
  direction. The direction must belong to the student's department (`direction.invalid`, 400,
  otherwise).

## 5. Topic approval

### 5.1 Domain model

**`ReservationStatus`** gains `Returned`. A request is **open** while it is `Pending` or
`Returned`. The topic is `Reserved` while its request is open, so no other student can take
it.

The three filtered unique indexes follow the open state:

| Index | Filter |
|---|---|
| One active reservation per topic | `Pending`, `Returned` or `Approved` |
| One open request per student | `Pending` or `Returned` |
| One approved reservation per student | `Approved` (unchanged) |

A change request is still an open request held beside an approved one.

**`TopicReservation`** gains:

| Field | Rules |
|---|---|
| `TopicDescription` | optional, at most 4000 characters. The description when the request was made, beside the existing `TopicTitle` snapshot |
| `ContentChangedAt` | UTC. Set when the request is made, and again whenever the title or description changes while the request is open. Approvals given before it no longer count |

**`ReservationDecision`**: one approver's action on a request.

| Field | Rules |
|---|---|
| `Id` | Guid |
| `ReservationId` | required; cascade on delete |
| `DeciderId` | required; `NoAction` |
| `DeciderWasAdministrator` | whether the decider was an administrator when deciding |
| `Kind` | `Approved`, `Returned`, `Rejected` or `Edited` (string) |
| `Comment` | at most 1000 characters; required for `Returned` |
| `DecidedAt` | UTC |

Rows are never deleted or changed while the reservation exists. Together they are the
request's timeline, and an `Edited` row records who changed the wording and when. The existing
`DecisionComment` on the reservation still holds the final rejection or release comment for
the student's history list.

### 5.2 Seats

A request has three seats. Like a step panel, the seats are worked out when the request is
read, never stored:

| Seat | Filled by an approval from |
|---|---|
| Administration | any user who was an administrator when approving |
| Direction | the **current** manager of the topic's direction |
| Supervision | the **current** supervisor of the topic |

A seat is **satisfied** by an `Approved` or `Edited` row from the right person, with
`DecidedAt` ≥ `ContentChangedAt`. One person's approval fills every seat they hold, so a
manager who supervises the topic fills both seats at once.

`TopicApprovalPanel.Evaluate(supervisorId, directionManagerId, contentChangedAt, decisions)`
is a pure function, as `ReviewPanel` is for steps. Every reader calls it, so the list, the
detail view and the approval action always agree.

**The creator's approval.** When a request is made, the system writes an `Approved` row for
the topic's creator, provided the creator holds a seat on it. A teacher who created and
supervises the topic, a manager who created a topic in their own direction, and an
administrator who created one all start out approved. A proposal's creator is the student,
who holds no seat.

**Completing the request.** As soon as every seat is satisfied, the request is approved in
the same save:

- the reservation becomes `Approved` and the topic `Approved`;
- `StudentProfile.TopicId` and `SupervisorId` are set;
- for a change request, the student's former topic is released as today.

This is checked:

- after every approval or edit;
- when the request is made, since the creator's and the assigning administrator's approvals
  may already cover every seat;
- after an administrator changes the topic's supervisor or direction, or the direction's
  manager.

The student can start work on the steps only then, because steps need
`StudentProfile.TopicId`.

### 5.3 Lifecycle

```
Catalogue topic:
  Available --reserve (student)-----------------> Reserved, request Pending
                                                   (creator's approval written)
  Pending   --approve (seat holder)--------------> Pending, or Approved when all seats are satisfied
  Pending   --edit wording (seat holder)---------> Pending; editor approved, all others must re-approve
  Pending   --return (seat holder, comment)------> Returned
  Returned  --resubmit (student, may edit)-------> Pending; every approval must be given again
  Pending/Returned --reject (seat holder)--------> Rejected; topic Available, wording restored
  Pending/Returned --cancel (student)------------> Cancelled; topic Available, wording restored
  Approved  --release (supervisor, manager, admin)-> Released; topic Available

Student proposal: the same, except the topic is created with the request, and a
rejection, cancellation or release deletes it (history kept, as today).

Administrator assignment (PUT /api/students/{id}/topic, topic Available):
  any open request of the student is Cancelled;
  a new request is made with the administrator's and the creator's approvals;
  a topic the student already holds stays theirs until the new one is approved.
  Clearing the topic (null) releases it at once, as today.
```

**Who may act.**

- **Approve, return and edit wording:** a holder of a seat that is not yet satisfied: the
  topic's supervisor, the direction's manager or any administrator. All three need `Pending`
  (`reservation.invalidState`, 409). A caller with no seat receives `approval.notApprover`
  (403); one whose seats are all satisfied receives `approval.seatSatisfied` (409).
  - Editing is also open to a seat holder who has already approved: their edit keeps them
    approved and reopens the other seats.
  - An administrator keeps the broader edit (direction and supervisor, at any status) from
    phase 4. A title or description change made through that form while the request is
    `Pending` follows the wording rule above. Changes made after approval do not reopen it.
- **Reject:** any seat holder, while `Pending` or `Returned`.
- **Release:** the supervisor, the direction's manager or an administrator, while `Approved`.
  The existing guard stays: a topic whose student has submitted a step cannot be released
  (`reservation.hasSubmissions`).
- **Resubmit:** the student, while `Returned`. The body carries the title and description,
  and the student may edit a catalogue topic's wording as well as their own proposal's.
  Resubmitting sets `ContentChangedAt`, so every seat, the creator's included, approves again.
- **Cancel:** the student, while `Pending` or `Returned`. The phase 4 deadline rule is
  unchanged: a first request can be cancelled only before the selection deadline.
- **Deadline.** Resubmission and every approver action ignore the selection deadline. They
  continue a request that is already open.

**Restoring a catalogue topic's wording.** When a request for a catalogue topic ends without
approval (rejected or cancelled), the topic goes back to `Available` with the title and
description it had when the request was made (`TopicTitle`, `TopicDescription`). A student's
edit or an approver's edit made during a request that never completed therefore does not
change the catalogue. A release after approval keeps the current wording.

**Concurrency.** Every action saves under the topic's `RowVersion`. Two approvers acting at
the same moment cannot both complete or both return a request; the second receives
`reservation.changed` (409) and reloads.

### 5.4 Who sees requests

- **Teacher:** open requests for topics they supervise, and, for a direction manager, every
  open request in their directions. Each row shows the three seats, which are satisfied, and
  whether the caller's own seat is waiting. `Returned` requests are listed as *waiting for the
  student*.
- **Administrator:** every open request, filterable by the state of the Administration seat.
- **Student:** their own request with its three seats, the timeline of decisions and
  comments, and, when returned, the comment and an *Edit and resubmit* action.
- **Topic lists:** a direction manager also sees every topic in their directions, at any
  status. A student's catalogue gains a direction filter and a direction column.

## 6. New step panel seats

The panel from phase 9 gains two derived seats. `ReviewSeat` becomes `Supervisor`,
`DirectionManager`, `Extra`, `StandardsControl`.

| Seat | Who holds it | Mark | Counts approvals given |
|---|---|---|---|
| Supervisor | the student's current supervisor (an administrator may stand in) | required | any time |
| DirectionManager | the current manager of the student's topic's direction | required | any time |
| Extra | each `StudentTaskReviewer` | required | after it was added |
| StandardsControl | the standards controller of the group's step | **none** | after the controller was assigned |

- **One person, one seat.** When one person holds several seats on a step, they sit in the
  first seat by the order above, and the others are absorbed into it. Phase 9 already
  absorbs an extra row naming the supervisor this way. A standards controller who supervises
  the student therefore approves once, as supervisor, with a mark.
- **Mark.** The step mark is the rounded average of the marks behind the satisfied marked
  seats, as today. The standards control seat never adds a mark.
- **Returns.** A return from any seat, the standards control seat included, sends the step
  back as today.
- **Stand-in.** An administrator's stand-in power still covers only the supervisor seat.

### 6.1 Assigning the standards controller

`GroupTask` gains `StandardsControllerId` (optional; `NoAction`) and
`StandardsControllerAssignedAt` (UTC, optional).

- An administrator sets, replaces or clears the controller of one group's step.
- The controller must be an active teacher with `IsStandardsController`
  (`groupTask.controllerInvalid`, 400).
- The seat applies to every student step of that group step that is not yet approved.
  Approved steps are final and are not touched.
- A student who joins the group later has the seat already, because it is derived from the
  group step. `LateJoinerTaskAssigner` needs no change.
- Replacing the controller resets `StandardsControllerAssignedAt`, so the new controller
  must approve. Clearing it drops the seat.
- After any change, every affected student step's `UpdatedAt` is touched, per the
  `RowVersion` rule. A `Submitted` step whose remaining seats are now all satisfied is
  approved at that moment, by the phase 9 rule.

### 6.2 Visibility

- **Direction manager:** treated as a supervisor for the students whose topic is in their
  direction. They are included in `ReviewableStudents`, `VisibleGroups`, the dashboards'
  *mine* counts, `isMyDecision` and the *My students* split.
- **Standards controller:** treated as an extra reviewer on the steps they control:
  step-level visibility through `CanSeeStudentTaskAsync`, the review queue and
  `isMyDecision`. They do not see the rest of the group.
- The step page labels each seat (*Supervisor*, *Direction manager*, *Reviewer*, *Standards
  control*). A standards controller's decision form has no mark field.
- `ArchivedReview.Seat` stores the new seat names as text.

## 7. API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/directions` | any role | Student: their department's directions. Staff: all; query `departmentId`, `managerId`, `mine` |
| GET | `/api/directions/{id}` | any role | Detail with topic counts by status |
| POST | `/api/directions` | Direction manager, Admin | Body `{ departmentId, name, description?, managerId? }`; `managerId` is for administrators only |
| PUT | `/api/directions/{id}` | its manager, Admin | Name and description; department while it has no topics; manager (administrator only) |
| DELETE | `/api/directions/{id}` | its manager, Admin | Only while it has no topics |
| POST/PUT | `/api/topics`, `/api/topics/{id}` | as §4.3 | Body carries `directionId` instead of `departmentId` |
| POST | `/api/topics/proposals` | Student | Body `{ title, description, supervisorId, directionId }` |
| GET | `/api/reservations/{id}` | student (own), seat holders, Admin | Request detail: seats with their state, timeline, `canDecide`, `canEdit` |
| POST | `/api/reservations/{id}/approve` | seat holder | The caller's approval |
| POST | `/api/reservations/{id}/return` | seat holder | Body `{ comment }` |
| POST | `/api/reservations/{id}/reject` | seat holder | Body `{ comment? }` |
| PUT | `/api/reservations/{id}/wording` | seat holder | Body `{ title, description? }`: edit while `Pending` |
| POST | `/api/reservations/{id}/resubmit` | Student | Body `{ title, description? }`: resubmit while `Returned` |
| GET | `/api/reservations/pending` | Teacher, Admin | Open requests as §5.4; query `waitingForMe` |
| PUT | `/api/group-tasks/{id}/standards-controller` | Admin | Body `{ userId }`; `null` clears. Response names how many student steps it affected |
| GET | `/api/groups/{id}/tasks` | as today | Each step gains its standards controller |
| POST/PUT | `/api/teachers`, `/api/teachers/{id}` | Admin | Body gains `isDirectionManager`, `isStandardsController` |

Cancel and release keep their routes.

**New error codes** (each with uk and en translations):

| Code | Status | Meaning |
|---|---|---|
| `direction.notFound` | 404 | Unknown direction in the URL |
| `direction.invalid` | 400 | Unknown direction in a body, or not in the student's department |
| `direction.nameTaken` | 409 | The name is used in that department |
| `direction.hasTopics` | 409 | Delete, or a department change, while it has topics |
| `direction.notManager` | 403 | The caller does not manage this direction |
| `direction.managerInvalid` | 400 | Not an active teacher with the direction manager capability |
| `approval.notApprover` | 403 | The caller holds no seat on this request |
| `approval.seatSatisfied` | 409 | Every seat the caller holds has already approved |
| `reservation.changed` | 409 | Someone else acted on the request first |
| `groupTask.controllerInvalid` | 400 | Not an active teacher with the standards controller capability |
| `staff.managesDirections` | 409 | Clearing the capability or deactivating while managing a direction |
| `staff.controlsSteps` | 409 | Clearing the capability or deactivating while controlling a group step |

`topic.departmentInvalid` is replaced by `direction.invalid`. `reservation.notSupervisor` is
replaced by `approval.notApprover`.

## 8. Interface

**Administrator**

- *Teachers:* two checkboxes on the form, *Direction manager* and *Standards controller*,
  and matching badges in the list.
- *Topics:* a segmented control, *Topics* | *Directions*.
  - *Topics* gains a direction column and filter. The requests list shows the three seats.
  - *Directions* lists every direction with its department, manager and topic count, and
    offers create, edit, reassign manager and delete.
- *Steps:* a segmented control, *Templates* | *Group steps*.
  - *Templates* is the existing page.
  - *Group steps* follows the owner's flow: choose a faculty, then a group. The page lists the
    group's steps with deadline, standards controller and how many students passed standards
    control.
  - The *Set standards controller* action opens a picker of teachers with the capability,
    then a confirmation: "Applies to N students on this step; K already approved keep their
    result." *Clear* removes the controller.
  - Teachers keep read-only access to *Templates* only.

**Direction manager** (a teacher with the capability)

- A *Directions* tab listing their own directions, each with its topics.
  - Create, edit and delete directions.
  - Publish a topic under a direction for any teacher.
- The *Requests* list includes requests in their directions with the three seats and the
  *Approve*, *Return*, *Reject* and *Edit wording* actions.
- Their review queue and dashboard include the steps of students in their directions.

**Teacher**

- The topic form picks a direction, grouped by department, instead of a department.
- The *Requests* list shows the three seats and the same four actions.

**Standards controller** (a teacher with the capability)

- Their review queue lists the steps they control that wait for them. Their decision form
  has *Approve* (no mark) and *Return*.

**Student**

- *Topics:* a direction filter and column. The proposal form adds a direction picker with
  their department's directions.
- *My topic* card: the request's three seats as a checklist (approved / waiting). When
  returned, it shows the comment and an *Edit and resubmit* dialog with the title and
  description. The decision timeline sits beneath.
- *Step page:* the panel card shows the new seats and their decisions.

## 9. Data, seeds and checks

- `InitialCreate` is regenerated. **Every machine drops its database**, with the owner's
  permission, as after phases 8–10.
- `DbSeeder` seeds one direction in department `SE`, managed by the seed teacher, who gets
  both capabilities.
- `.superpowers/demo/seed-demo.mjs` adds a direction manager and a standards controller to
  the Ukrainian demo faculty, directions for its departments, and topics under them. It also
  completes the approvals for demo students who already hold a topic.
- Check scripts:
  - `giveTopic` in `checkCleanup.mjs` completes all three approvals, so every script whose
    students submit keeps working.
  - `topics-check.mjs` and `review-panels-check.mjs` follow the new rules.
  - A new `directions-approval-check.mjs` covers directions, the three seats, the creator's
    approval, return and resubmit, edit resets, wording restore, administrator assignment,
    the direction manager's step seat, and the standards controller's group-step seat
    including a late joiner.
- Unit tests stay parked for the end-of-project pass. The test list goes to
  `test-backlog.md`.
- The owner runs a browser walkthrough of the approval flow and a norm-control step before
  the phase closes.
- Delivered as one commit, `Implement directions, topic approval and standards control`.

## 10. Not included

- Notifications (email or in-app) about approvals or returns.
- A deadline for approvers.
- More than one standards controller per group step.
- Standards control on topics. It applies to submitted steps only.
- Direction managers approving anything outside their own directions.
- Scoped roles. They are phase 12.
