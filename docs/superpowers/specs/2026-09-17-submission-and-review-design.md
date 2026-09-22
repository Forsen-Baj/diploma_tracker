# Diploma Tracker — Submission and Review Design

Date: 2026-09-17
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md` (§9, phase 5)
Builds on: academic structure (phase 2), design system (phase 3), topics and reservation
(phase 4)

## 1. Purpose

Diploma work advances through an ordered set of steps assigned to the student's group —
each with a deadline. For every step the student submits a document, optionally with
supporting files and a message. A reviewer either approves the step with a mark or returns
it with a comment, and a returned step is submitted again. Each step's submissions and
decisions form a timeline that both sides read. Progress statistics per student and per
group come from the same data and appear on the dashboards.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who reviews | Teachers assigned as reviewers of the student's group, and the student's own supervisor; administrators may act on any submission |
| When work starts | Once the student holds a topic (`StudentProfile.TopicId` is set — an approved request or proposal, or an administrator's assignment); a pending or rejected request is not enough, and a student whose topic is released cannot submit again until they hold one |
| Step order | Strict: a step accepts submissions only after the previous step is approved |
| Files per submission | One main document (`.docx`, `.pdf` or `.pptx`) plus up to three supporting files from an allowlist (`.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`/`.jpeg`) |
| Messages | The student may add a message to a submission; the reviewer comments on the decision |
| Marks | Required when approving: a whole number from 0 to 100 |
| Deadlines | Submitting after the deadline is allowed and flagged as late |
| File storage | Server disk behind a storage interface; metadata in SQL Server |
| Teacher visibility | Teachers see only the groups they review and groups containing students they supervise |

## 3. Domain model

Existing entities keep their roles: `DiplomaTaskTemplate` defines a step and its order,
`GroupTask` assigns a step to a group with a deadline, and `StudentTask` holds one student's
progress on one assigned step.

**`StudentTask`**
| Field | Rules |
|---|---|
| `Status` | `Pending`, `Submitted`, `Approved`, `Returned` (string) |
| `Mark` | whole number 0–100; set on approval |
| `CompletedAt` | UTC; set on approval |
| `RowVersion` | concurrency token |

**`Submission`** — one attempt at a step.
| Field | Rules |
|---|---|
| `Id` | Guid |
| `StudentTaskId` | required |
| `Version` | 1, 2, 3 … per student task |
| `Message` | optional, at most 2000 characters, from the student |
| `SubmittedAt` | UTC |
| `IsLate` | `SubmittedAt` later than the group task's deadline, fixed at submission time |
| `Decision` | empty while awaiting review; `Approved` or `Returned` |
| `ReviewerId` | the user who decided |
| `ReviewerComment` | at most 2000 characters; required when returning, optional when approving |
| `Mark` | 0–100; required when approving, empty when returning |
| `DecidedAt` | UTC |

**`SubmissionFile`**
| Field | Rules |
|---|---|
| `Id` | Guid |
| `SubmissionId` | required |
| `Kind` | `Main` or `Supporting` |
| `OriginalName` | at most 255 characters, as uploaded |
| `StorageKey` | the file's location within storage; never derived from the original name |
| `ContentType`, `SizeBytes` | recorded at upload |

## 4. Workflow

```
Pending   --submit (student holds a topic, previous step Approved)--> Submitted
Submitted --approve (reviewer, mark required)--------> Approved   (final)
Submitted --return (reviewer, comment required)------> Returned
Returned  --submit again (student)-------------------> Submitted  (Version + 1)
```

- A student may submit only against their own student tasks.
- The first step has no predecessor. For any later step, the step with the next lower
  `Order` among the group's assigned steps must be `Approved`.
- Only one submission awaits a decision at a time: submitting is refused while the step is
  `Submitted`.
- A reviewer is a teacher assigned to the student's group or the student's supervisor;
  administrators act on any submission. A decision applies to the latest submission, which
  must be undecided.
- Two reviewers deciding at the same moment: the `RowVersion` check fails the second save,
  reported as `submission.alreadyDecided`.
- Approved steps are final. Reopening an approved step is not part of this phase.

## 5. Files

**Storage** — `IFileStorage` with `SaveAsync(stream) → key`, `OpenReadAsync(key)` and
`DeleteAsync(key)`. The implementation writes to a directory configured as
`Storage:RootPath`, in per-month subfolders, under random file names. The directory lies
outside the web root; files are served only by the download endpoint. Startup validation
refuses to start when the path is missing or not writable.

**Upload rules**
- Main file: extension `.docx`, `.pdf` or `.pptx`, at most 20 MB. The file is opened and must
  carry the parts its extension claims — an Office package is inspected for the parts that make
  it that format, a `.pdf` for its header — so a renamed file is refused rather than stored.
- Supporting files: at most three, at most 20 MB each, and an **allowlist** of `.pdf`, `.docx`,
  `.pptx`, `.png` and `.jpg`/`.jpeg`. Every one is inspected the same way as the main file. An
  extension outside the list is refused whatever the bytes are; an extension inside it whose
  bytes say otherwise is refused too.
- Whole request at most 90 MB; the server's request size limit is set to match.
- Files are written to storage before the database save; if the save fails, the written
  files are deleted.

**Download** — `GET /api/submission-files/{id}` streams the file with
`Content-Disposition: attachment` and the original name, `X-Content-Type-Options: nosniff`,
and `application/octet-stream` for supporting files. Allowed for the submitting student,
the group's reviewers, the student's supervisor and administrators.

## 6. Teacher visibility

A teacher sees a group when they are one of its reviewers or supervise at least one student
in it. Group lists, group details, reviewer lists, group student lists, progress and the
review queue are all filtered by this rule in the service layer; any other group returns
`group.notFound` (404) so its existence is not disclosed. Students see only their own data;
administrators see everything.

## 7. API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/student-tasks/mine` | Student | Own steps in order with status, deadline, late flag, mark, and whether submitting is currently allowed |
| GET | `/api/student-tasks/{id}` | Student (own), reviewers, supervisor, Admin | Step detail with the full timeline of submissions, files and decisions |
| POST | `/api/student-tasks/{id}/submissions` | Student (own) | Multipart: `mainFile`, `supportingFiles` (0–3), `message` |
| POST | `/api/submissions/{id}/approve` | reviewers, supervisor, Admin | Body `{ mark, comment? }` |
| POST | `/api/submissions/{id}/return` | reviewers, supervisor, Admin | Body `{ comment }` |
| GET | `/api/submission-files/{id}` | as §5 | Download |
| GET | `/api/review/queue` | Teacher, Admin | Submissions awaiting a decision for visible students, oldest first; query `groupId`, `late`, `page`, `pageSize`. Returns one page — `{ items, page, pageSize, total }` — 25 by default, 100 at most; a page number outside the range is clamped, not refused |
| GET | `/api/groups/{id}/progress` | Teacher (visible), Admin | Matrix: students × steps with status, mark, late flag and overdue flag, plus per-step completion counts. A step is overdue when it is past its deadline and neither approved nor awaiting a decision; every cell in one response is judged against the same instant. Lateness counts steps, not submitted versions |
| GET | `/api/students/{id}/progress` | Student (own), Teacher (visible), Admin | Steps approved of total, late steps, average mark |

**Error codes:** `studentTask.notFound` (404), `studentTask.notYours` (403),
`step.topicRequired` (409), `step.previousNotApproved` (409), `step.awaitingReview` (409), `step.alreadyApproved` (409),
`submission.notFound` (404), `submission.alreadyDecided` (409), `submission.notReviewer`
(403), `file.mainMissing` (400), `file.typeNotAllowed` (400), `file.tooLarge` (400),
`file.tooMany` (400), `file.contentMismatch` (400), `review.markRequired` (400),
`review.markOutOfRange` (400), `review.commentRequired` (400), `group.notFound` (404).

## 8. Interface

**Student**
- *My work* tab — ordered list of steps with status badges (`Pending` neutral, `Submitted`
  info, `Returned` warning, `Approved` success), deadline, *late* marker and mark.
- Step page — step description and deadline; timeline of submissions (version, date, late
  marker, message, files) each followed by its decision (reviewer, date, mark or comment);
  a submit form (main file, supporting files, message) shown only when submitting is
  allowed, otherwise the reason (no topic yet, awaiting review, previous step not approved,
  approved). A missing topic is named first, because it is the first thing to settle.
- Dashboard — progress summary (approved of total, average mark), next deadline, the most
  recent decision, and the *My topic* card from phase 4.

**Teacher**
- *Review* tab — queue of submissions awaiting a decision with student, group, step,
  submitted date and late marker; opens the step page with *Approve* (mark, optional
  comment) and *Return* (comment) actions.
- *Groups* tab — visible groups; a group page shows the progress matrix with badges and
  marks.
- Dashboard — count of waiting submissions and progress of visible groups.

**Administrator**
- Same review and progress pages across all groups; existing step templates and group step
  assignment pages continue to manage steps and deadlines.

## 9. Delivery and verification

One increment: domain model, storage and startup validation, services and endpoints,
visibility filtering, then pages. Automated checks: backend build,
`has-pending-model-changes`, and a scripted endpoint check covering submit → return →
resubmit → approve with mark, the strict-order refusal, the late flag, file type and size
refusals, download authorization for an unrelated teacher and student, and teacher group
visibility; frontend `tsc`, lint and build. The owner walks through the student and reviewer
workflow in the browser at the end. Unit tests go to `docs/superpowers/test-backlog.md`.

## 10. Not included

- Reopening or re-marking an approved step.
- Withdrawing a submission before review.
- Per-student deadline extensions.
- Messages outside a submission or decision (free chat).
- Notifications (email or in-app).
- Virus scanning of uploads.
- In-browser preview of files (phase 7).
