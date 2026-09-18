# Diploma Tracker — Thesis Topics and Reservation Design

Date: 2026-09-17 (amended 2026-09-18: administrator assignment from the student form, change
requests for an approved topic, administrator amendment of a topic at any stage)
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md` (§8, phase 4)
Builds on: academic structure (phase 2), user onboarding, design system (phase 3)

## 1. Purpose

A student's diploma work begins with a topic. Teachers publish topics they are willing to
supervise, each owned by a department. Students browse the topics of their own department,
reserve one, and the supervising teacher approves or rejects the reservation. A student
with an idea of their own proposes it to a teacher of their choice instead. Once a
reservation is approved, the teacher becomes the student's supervisor and the topic becomes
the student's diploma topic, which later phases use for documents and review.

A choice made in autumn is not final. A student whose work turns out differently asks for another
topic and the teacher who would take it on decides; an administrator sets a student's topic
outright from the student form when the choice was made off the system; and an administrator
corrects a topic's wording, department or supervisor at any point, including after it has been
approved.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who publishes topics | Teachers (as supervisor of their own topics) and administrators (for any teacher) |
| Topic ownership | Every topic belongs to one department; teachers are not tied to departments |
| What students see | Only topics of their own group's department |
| Who approves a reservation | The topic's supervisor; administrators may act in their place |
| Student-proposed topics | Allowed: title and description addressed to a chosen teacher, who accepts or declines |
| Requests per student | One pending request at a time, and at most one approved topic. A pending *change request* is the one case where both exist at once |
| Changing an approved topic | A student with an approved topic may ask for another available catalogue topic, or propose a new one to a chosen teacher. The teacher who would supervise it decides, or an administrator does |
| Cancelling | By the student, only while pending. A first reservation may be cancelled only before the selection deadline; a change request is not bound by it |
| Selection deadline | One global date. It closes **first-time** selection: after it a student without a topic can neither reserve, propose nor cancel. Change requests are unaffected, because changes arise later in the year |
| Assigning a topic | An administrator sets a student's topic directly on the student form, which creates the approved reservation and sets the supervisor |
| Amending a topic | Administrators edit any topic at any status; moving a reserved or approved topic to another supervisor moves the student's supervisor with it. Teachers still edit only their own `Available` topics |
| Supervisor capacity | No limit; teachers decide by approving or rejecting |

## 3. Domain model

**`Topic`**
| Field | Rules |
|---|---|
| `Id` | Guid |
| `Title` | required, at most 300 characters |
| `Description` | optional, at most 4000 characters |
| `SupervisorId` | required; an active user with the Teacher role |
| `DepartmentId` | required |
| `Origin` | `Catalogue` or `StudentProposal` |
| `Status` | `Available`, `Reserved`, `Approved` (stored as a string) |
| `CreatedAt`, `UpdatedAt` | UTC |
| `RowVersion` | concurrency token |

**`TopicReservation`** — the history of every request for a topic.
| Field | Rules |
|---|---|
| `Id` | Guid |
| `TopicId` | optional; set to null when the topic is deleted (`SetNull`) |
| `TopicTitle` | required, at most 300 characters; the topic's title when the request was made, so history stays readable after a topic is deleted |
| `StudentProfileId` | required |
| `Status` | `Pending`, `Approved`, `Rejected`, `Cancelled`, `Released` (stored as a string) |
| `DecisionComment` | optional, at most 1000 characters; written on rejection or release |
| `CreatedAt`, `DecidedAt` | UTC; `DecidedAt` set on any transition out of `Pending` or `Approved` |

A topic is `Reserved` exactly when it has a `Pending` reservation and `Approved` exactly
when it has an `Approved` reservation; the service keeps `Topic.Status` in step with the
reservation in the same `SaveChanges`.

Three uniqueness rules hold, enforced in the service and backed by filtered unique indexes:

- at most one reservation per **topic** in `Pending` or `Approved` — a topic is wanted by one
  student at a time;
- at most one **`Pending`** reservation per student;
- at most one **`Approved`** reservation per student.

The last two are deliberately separate rather than one combined rule. A student who holds an
approved topic and asks for a different one has both at once: the approved reservation for the
topic they still own, and a pending reservation for the topic they want. That pair *is* a change
request — no separate entity and no flag marks it, because a pending request made while a topic
is already approved can mean nothing else.

**`StudentProfile`** — gains `TopicId` (optional, unique when set). An approved reservation
sets `TopicId` and `SupervisorId`; releasing it clears both. The student's diploma topic is
therefore always a topic record; the free-text topic field is not part of the model.

**`PlatformSettings`** — gains `TopicSelectionDeadline` (optional UTC instant; empty means no
deadline). Administrators enter it as a local date and time; it is stored in UTC.

## 4. Lifecycle

```
Catalogue topic:
  Available --reserve (student)--> Reserved
  Reserved  --approve (supervisor/admin)--> Approved
  Reserved  --reject (supervisor/admin, optional comment)--> Available
  Reserved  --cancel (student, before deadline)--> Available
  Approved  --release (supervisor/admin, optional comment)--> Available

Student proposal:
  (student proposes to teacher T) --> topic created with Origin=StudentProposal,
                                      Status=Reserved, reservation Pending
  accept  (T or admin) --> Approved
  decline (T or admin, optional comment) --> topic deleted; reservation history
                                              kept as Rejected with the comment
  cancel  (student, before deadline) --> topic deleted
  release after approval --> topic deleted (a proposal never enters the catalogue)

Change request (student who already holds an approved topic):
  reserve another Available topic, or propose a new one to a teacher
        --> the new request is Pending; the approved topic stays the student's
  approve (the new topic's supervisor, or an admin)
        --> old reservation Released (old topic back to Available, or deleted if a
            proposal); new reservation Approved; TopicId and SupervisorId move
  reject  (same, optional comment) --> new reservation Rejected; the old topic is
                                        untouched; a proposed topic is deleted
  cancel  (student, no deadline)   --> new reservation Cancelled; the old topic is
                                        untouched; a proposed topic is deleted

Assignment by an administrator (from the student form):
  set a student's topic   --> any pending request is Cancelled, any approved topic is
                              Released, the chosen topic becomes Approved for that student
  clear a student's topic --> the approved reservation is Released and TopicId and
                              SupervisorId are cleared
```

Deleting a topic — a declined, cancelled or released proposal, or an available catalogue
topic removed by its owner — keeps its reservation history: `TopicId` becomes null and
`TopicTitle` still shows what the request was for.

**Rules checked on every student action**
- The student is active and not archived, and has **no `Pending` reservation**. An `Approved`
  one is allowed — that is what makes the new request a change request.
- The deadline (`TopicSelectionDeadline` empty or in the future) is checked **only when the
  student has no approved topic**. A student who already has one may request a change, cancel
  that request and request again at any time; the deadline governs choosing a topic in the
  first place, not revising it.
- Reserve: the topic is `Available`, belongs to the student's department, and its supervisor
  is active. It must not be the student's own current topic.
- Propose: the chosen teacher is active; the topic's department is the student's department.
- Cancel: the reservation is the student's own and `Pending`.

**Rules for supervisors and administrators**
- A teacher may approve, reject or release only reservations of topics they supervise;
  administrators may act on any. For a change request this is the supervisor of the topic the
  student is asking for — the supervisor being left behind has no say, because a supervisor
  cannot compel a student to stay.
- Approve and reject require `Pending`; release requires `Approved`.
- A teacher may edit or delete only their own `Catalogue` topics, and only while `Available`.
- **An administrator may edit any topic at any status** — title, description, department and
  supervisor. Changing the supervisor of a `Reserved` or `Approved` topic moves the student's
  `SupervisorId` with it in the same save, so the topic and the student never disagree about
  who supervises the work. Changing the department does not disturb an existing reservation:
  the department governs who may *discover* a topic, not who holds it.
- Deleting stays restricted to `Available` topics for everyone, including administrators —
  deleting a topic a student is working on would strand them. Release it first.
- `TopicReservation.TopicTitle` keeps the title as it was when the request was made, so an
  administrator's later edit does not rewrite history.
- The deadline does not restrict supervisors or administrators.

**Concurrency** — two students reserving the same topic at once: the `RowVersion` check makes
the second save fail, which is reported as `topic.notAvailable`.

## 5. API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/topics` | Student | Catalogue of the student's department: `Available` topics plus the student's own reserved or approved topic; query `search` (title and description), `supervisorId` |
| GET | `/api/topics` | Teacher | Topics the teacher supervises, any status |
| GET | `/api/topics` | Admin | All topics; query `departmentId`, `supervisorId`, `status`, `search` |
| GET | `/api/topics/{id}` | any role | Detail; students only for topics of their department or their own |
| POST | `/api/topics` | Teacher, Admin | Create a catalogue topic; a teacher is always the supervisor; an admin names `supervisorId` |
| PUT | `/api/topics/{id}` | Teacher (own), Admin | Edit title, description, department (admin also supervisor). A teacher only while `Available`; an administrator at any status |
| DELETE | `/api/topics/{id}` | Teacher (own), Admin | Only while `Available` |
| POST | `/api/topics/{id}/reserve` | Student | Reserve, or request a change to this topic |
| POST | `/api/topics/proposals` | Student | Body `{ title, description, supervisorId }`; also the way a change is proposed |
| POST | `/api/reservations/{id}/approve` | Teacher, Admin | Approve or accept |
| POST | `/api/reservations/{id}/reject` | Teacher, Admin | Body `{ comment? }` |
| POST | `/api/reservations/{id}/cancel` | Student | Cancel own pending |
| POST | `/api/reservations/{id}/release` | Teacher, Admin | Body `{ comment? }` |
| PUT | `/api/students/{id}/topic` | Admin | Body `{ topicId }`; `null` clears. Sets the student's topic outright |
| GET | `/api/reservations/mine` | Student | The student's reservation history, newest first |
| GET | `/api/reservations/pending` | Teacher, Admin | Pending reservations, proposals and change requests to decide (teacher: own topics) |
| GET / PUT | `/api/settings/topic-selection` | GET any role, PUT Admin | `{ deadline }` |

`PUT /api/students/{id}/topic` is the single code path for administrator assignment; it sits
beside the existing `PUT /api/students/{id}/group` and `PUT /api/students/{id}/supervisor`, and
both the student form and the *assign* action on the Topics page call it. There is no separate
`POST /api/topics/{id}/assign`. The topic must be `Available`; the student must not be archived
(409 `student.archived`, as everywhere else). Everything the assignment displaces — a pending
request, a previously approved topic — is settled in the same save, so a student's topic is never
half-changed.

**Error codes** (contract from phase 3): `topic.notFound` (404), `topic.invalid` (400),
`topic.notAvailable` (409), `topic.notInYourDepartment` (403), `topic.notEditable` (409),
`topic.notOwner` (403), `topic.alreadyYours` (409), `topic.departmentInvalid` (400),
`topic.supervisorInvalid` (400), `topic.studentProfileRequired` (403),
`proposal.teacherInvalid` (400), `reservation.notFound` (404),
`reservation.alreadyActive` (409), `reservation.invalidState` (409),
`reservation.notYours` (403), `reservation.notSupervisor` (403), `selection.closed` (403),
and, in the student area, `student.supervisorLockedByTopic` (409). Each has uk and en
translations.

The rule that an unknown id in a **body** is 400 while an unknown id in a **URL** is 404 gives
topics two codes: `topic.notFound` for `/api/topics/{id}`, and `topic.invalid` for the `topicId`
in the body of `PUT /api/students/{id}/topic`. A supervisor is not settable directly on a student
who holds a topic — the topic decides it — hence `student.supervisorLockedByTopic`.

`reservation.alreadyActive` now means precisely "you already have a request awaiting a decision"
— it no longer fires for a student who merely holds an approved topic, since that student is
allowed to ask for a change. `topic.alreadyYours` refuses the pointless request to change to the
topic already held. `student.alreadyHasTopic` is gone: administrator assignment replaces whatever
was there rather than refusing.

## 6. Interface

Built from the phase 3 components; every string translated.

**Student**
- *Topics* tab — catalogue of the department: search field, supervisor filter,
  `DataTable` with title, supervisor and a *Reserve* action; detail modal with the full
  description. The action reads *Reserve* for a student without a topic and *Request this
  topic* for one who already has an approved topic. It is disabled, with an explanation, while
  a request is pending, on the student's own current topic, and — for a student without a topic
  — after the deadline, where the page also shows a notice.
- *Propose a topic* — modal with title, description and a teacher selector. Available on the
  same terms as *Reserve*, and labelled *Propose a different topic* for a student who already
  has one.
- *My topic* card on the student dashboard — the approved topic with its supervisor, and
  beneath it the pending request when there is one, showing the topic asked for, its
  prospective supervisor and *Cancel*. A student without a topic sees the single pending
  reservation in the same place. The latest rejection comment is shown when the last request
  was rejected.

**Teacher**
- *My topics* tab — own topics with status badges, create/edit/delete for available ones.
- *Requests* section — pending reservations, proposals and change requests with student name,
  group, topic and *Approve* / *Reject* (comment modal); approved students with *Release*. A
  change request is marked as one and names the topic the student holds today, so the teacher
  decides knowing what the student would give up.

**Administrator**
- *Topics* tab — all topics with department, supervisor, status and search filters; create
  for any teacher; edit at any status; delete and release where allowed. The edit form warns,
  when the topic is `Reserved` or `Approved`, that changing the supervisor also changes the
  student's supervisor.
- *Students* page — the student form carries a **topic selector** listing the `Available`
  topics of that student's department plus the topic the student currently holds, and an empty
  option that clears it. Saving a changed selection calls `PUT /api/students/{id}/topic`, and a
  confirmation names the topic being replaced when there is one. An administrator who needs a
  topic from another department moves that topic's department first, which §4 now permits at
  any status.
- *Settings* — topic selection deadline (date and time, clearable), next to the registration
  switch from onboarding.

## 7. Delivery and verification

One increment: domain model and migration, services and endpoints, then pages. Automated
checks: backend build, `has-pending-model-changes`, a scripted endpoint check covering one
full catalogue lifecycle (reserve → reject → reserve → approve → release), one proposal
lifecycle, one change-request lifecycle (approved topic → request another → approve → the old
topic is `Available` again and the supervisor has moved), a change request rejected and one
cancelled, the deadline refusing a first reservation but allowing a change request, the
one-pending-request refusal, `topic.alreadyYours`, department isolation, administrator
assignment and clearing through `PUT /api/students/{id}/topic` including the case where it
displaces an existing topic, and an administrator editing a `Reserved` topic's supervisor and
the student's supervisor moving with it. Plus frontend `tsc`, lint and build. This phase
introduces the first real
workflow, so the owner walks through it in the browser at the end. Unit tests go to
`docs/superpowers/test-backlog.md`.

## 8. Not included

- Supervisor capacity limits.
- Ranked or multiple simultaneous reservations.
- Per-group deadlines.
- Notifications (email or in-app) about decisions; status is visible on the dashboards.
- Topics shared across departments or co-supervision.
- More than one change request in flight at a time, or ranking several wanted topics.
- A say for the supervisor a student is leaving when a change request is approved.
- Deleting a topic that is reserved or approved; release it first.
