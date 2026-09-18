# Diploma Tracker — Thesis Topics and Reservation Design

Date: 2026-09-17
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

## 2. Decisions

| Topic | Decision |
|---|---|
| Who publishes topics | Teachers (as supervisor of their own topics) and administrators (for any teacher) |
| Topic ownership | Every topic belongs to one department; teachers are not tied to departments |
| What students see | Only topics of their own group's department |
| Who approves a reservation | The topic's supervisor; administrators may act in their place |
| Student-proposed topics | Allowed: title and description addressed to a chosen teacher, who accepts or declines |
| Reservations per student | One active reservation or proposal at a time |
| Cancelling | By the student, only while pending and before the selection deadline |
| Selection deadline | One global date; after it students can neither reserve, propose nor cancel |
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
reservation in the same `SaveChanges`. At most one reservation per topic and at most one
per student is in `Pending` or `Approved` at any time; both rules are enforced in the
service and backed by filtered unique indexes on `TopicId` and on `StudentProfileId`
where `Status` is `Pending` or `Approved`.

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

Direct assignment (admin):
  Available topic + chosen student without a topic --> Approved in one step
```

Deleting a topic — a declined, cancelled or released proposal, or an available catalogue
topic removed by its owner — keeps its reservation history: `TopicId` becomes null and
`TopicTitle` still shows what the request was for.

**Rules checked on every student action**
- The student is active and has no reservation in `Pending` or `Approved`.
- The deadline has not passed (`TopicSelectionDeadline` empty or in the future).
- Reserve: the topic is `Available`, belongs to the student's department, and its supervisor
  is active.
- Propose: the chosen teacher is active; the topic's department is the student's
  department.
- Cancel: the reservation is the student's own and `Pending`.

**Rules for supervisors and administrators**
- A teacher may approve, reject or release only reservations of topics they supervise;
  administrators may act on any.
- Approve and reject require `Pending`; release requires `Approved`.
- A teacher may edit or delete only their own `Catalogue` topics, and only while
  `Available`. Administrators may edit or delete any `Available` catalogue topic.
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
| PUT | `/api/topics/{id}` | Teacher (own), Admin | Edit title, description, department (admin also supervisor); only while `Available` |
| DELETE | `/api/topics/{id}` | Teacher (own), Admin | Only while `Available` |
| POST | `/api/topics/{id}/reserve` | Student | Reserve |
| POST | `/api/topics/proposals` | Student | Body `{ title, description, supervisorId }` |
| POST | `/api/reservations/{id}/approve` | Teacher, Admin | Approve or accept |
| POST | `/api/reservations/{id}/reject` | Teacher, Admin | Body `{ comment? }` |
| POST | `/api/reservations/{id}/cancel` | Student | Cancel own pending |
| POST | `/api/reservations/{id}/release` | Teacher, Admin | Body `{ comment? }` |
| POST | `/api/topics/{id}/assign` | Admin | Body `{ studentId }`; direct assignment |
| GET | `/api/reservations/mine` | Student | The student's reservation history, newest first |
| GET | `/api/reservations/pending` | Teacher, Admin | Pending reservations and proposals to decide (teacher: own topics) |
| GET / PUT | `/api/settings/topic-selection` | GET any role, PUT Admin | `{ deadline }` |

**Error codes** (contract from phase 3): `topic.notFound` (404), `topic.notAvailable` (409),
`topic.notInYourDepartment` (403), `topic.notEditable` (409), `reservation.notFound` (404),
`reservation.alreadyActive` (409), `reservation.invalidState` (409),
`reservation.notYours` (403), `selection.closed` (403), `teacher.notFound` (400),
`student.alreadyHasTopic` (409).

## 6. Interface

Built from the phase 3 components; every string translated.

**Student**
- *Topics* tab — catalogue of the department: search field, supervisor filter,
  `DataTable` with title, supervisor and a *Reserve* action; detail modal with the full
  description. When the student already holds a reservation or approved topic, reserve
  actions are disabled with an explanation. After the deadline the page shows a notice and
  no actions.
- *Propose a topic* — modal with title, description and a teacher selector.
- *My topic* card on the student dashboard — current reservation or approved topic with its
  status badge (`Pending` / `Approved`), supervisor name, *Cancel* while allowed, and the
  latest rejection comment when the last request was rejected.

**Teacher**
- *My topics* tab — own topics with status badges, create/edit/delete for available ones.
- *Requests* section — pending reservations and proposals with student name, group, topic
  and *Approve* / *Reject* (comment modal); approved students with *Release*.

**Administrator**
- *Topics* tab — all topics with department, supervisor, status and search filters; create
  for any teacher; edit, delete, assign to a student, release.
- *Settings* — topic selection deadline (date and time, clearable), next to the registration
  switch from onboarding.

## 7. Delivery and verification

One increment: domain model and migration, services and endpoints, then pages. Automated
checks: backend build, `has-pending-model-changes`, a scripted endpoint check covering one
full catalogue lifecycle (reserve → reject → reserve → approve → release), one proposal
lifecycle, the deadline refusal, the one-active-reservation refusal and department
isolation, plus frontend `tsc`, lint and build. This phase introduces the first real
workflow, so the owner walks through it in the browser at the end. Unit tests go to
`docs/superpowers/test-backlog.md`.

## 8. Not included

- Supervisor capacity limits.
- Ranked or multiple simultaneous reservations.
- Per-group deadlines.
- Notifications (email or in-app) about decisions; status is visible on the dashboards.
- Topics shared across departments or co-supervision.
- Changing an approved topic's title after approval (release and re-reserve instead).
