# Phase 8 — Hardening and Polish

Date: 2026-09-21
Status: approved, pending implementation plan

## 1. Purpose

Phases 1 through 6 delivered the whole arc of a diploma: accounts, the academic structure,
topics and reservations, submission and review, and generated documents. This phase settles
how that system behaves when it is trusted with a real cohort — how a session ends, what the
system will accept from an upload, what happens to work when a cohort leaves, how a student
is identified, how much the system reads to answer a page, and what an administrator or a
teacher sees when they open the application.

Nothing here adds a new arc. Every section describes a property the finished system holds.

The scope was settled by the owner on 2026-09-19 and extended on 2026-09-21 with the
administrator and teacher dashboards. It is built as a single increment, executed in batches
of four tasks.

## 2. Sessions, sign-in and passwords

### 2.1 A session reflects the account's current state

A bearer token carries an identity and a role, and it is valid for sixty minutes. Identity and
role are claims, not facts: an account can be archived, deactivated, given a different role or
have its access reset at any moment, and a token issued a minute earlier would otherwise keep
working until it expired.

Every authenticated request therefore re-reads the account the token names and answers **401**
unless all of the following hold:

- the account exists,
- `IsActive` is true,
- it holds a password (`PasswordHash` is not null),
- its `Role` is the role the token claims.

The check runs once per request, when the token is validated, as a single projected read of
four columns. There is no revocation list, no cache and no background invalidation: the
database is the only authority, and it is consulted every time.

The password-hash condition is what makes an **access reset** work end to end. Resetting a
student's access clears their password hash and sets `ClaimReopened`, leaving the account
active. From that moment:

1. the student's current token stops working on its very next request — 401;
2. the interface clears the stored token and returns to the sign-in page, which it already
   does for any 401;
3. signing in is impossible, because an account without a password hash cannot authenticate;
4. the student claims the account again with their email and student number, chooses a new
   password, and receives a fresh token in the same response;
5. `ClaimReopened` is cleared by the claim, so the reopening is single-use.

A reset while registration is closed still works, because a reopened account is admitted
regardless of the registration switch. That rule already exists and is unchanged.

Tokens issued before a **password change** are not invalidated; a password change signs the
user out of the browser that made it and leaves other sessions running until they expire.
(Owner decision, 2026-09-21: state only.)

### 2.2 Password length depends on what the account can do

An administrator can create and delete accounts, reassign topics, delete groups and purge the
archive. That account is worth more than a student's, and its minimum password length reflects
it.

| Role | Minimum | Maximum |
|---|---|---|
| Admin | 12 | 128 |
| Teacher, Student | 8 | 128 |

The minimum is applied wherever a password is set: an administrator changing their own
password, an administrator account created by another administrator, and the one-time hosted
bootstrap administrator, whose configured password is refused at startup if it is shorter.
Claiming a student account and a teacher's password change are unaffected.

Two error codes carry the two rules, so the message can state the right number without
interpolation: `password.policy` (8) and `password.policyElevated` (12).

### 2.3 What the system writes down

Security-relevant events are written as structured log lines — named templates with named
fields, at defined levels — and nowhere else. There is no audit table and no audit page.
(Owner decision, 2026-09-21.)

The events, their fields and their levels are fixed in one place, so that a line's shape does
not depend on which service wrote it:

| Event | Level | Fields |
|---|---|---|
| Sign-in succeeded | Information | `UserId`, `Role` |
| Sign-in failed | Warning | `Email`, `Reason` (`UnknownAccount`, `WrongPassword`, `Inactive`, `Unclaimed`) |
| Session rejected | Warning | `UserId`, `Reason` (`Inactive`, `Unclaimed`, `RoleChanged`, `Missing`) |
| Claim succeeded / refused | Information / Warning | as today (`UserId`, `Reopened`; `Email`, `Reason`) |
| Password changed | Information | `UserId` |
| Access reset | Information | `StudentUserId`, `AdministratorId` |
| Access refused | Warning | `ActorUserId`, `Role`, `Resource`, `ResourceId` |
| Student imported / archived / restored | Information | `AdministratorId`, `Count`, ids |
| Administrator action | Information | `AdministratorId`, `Action`, `Entity`, `EntityId` |
| Topic assigned or cleared | Information | `StudentProfileId`, `AdministratorId`, `TopicId?` |
| Submission decided | Information | `ReviewerId`, `SubmissionId`, `Decision`, `Mark?` |
| File downloaded | Information | `ActorUserId`, `FileId`, `StudentProfileId` |
| Template uploaded / replaced / deleted / generated | Information | `ActorUserId`, `TemplateId` |
| Group deleted | Warning | `AdministratorId`, `GroupId`, `GroupCode`, `ArchivedFileCount` |
| Archive purged | Warning | `AdministratorId`, `ArchivedGroupId`, `FileCount`, `Bytes` |

A log line never carries a password, a password hash, a token, a file's contents or a
connection string. An email address appears only where the account is not yet identified — a
failed sign-in or a refused claim — because there is no id to name instead.

## 3. What the system accepts from an upload

A `.docx` and a `.pptx` are ZIP archives of XML parts; a `.pdf` is a byte stream with a fixed
header. The system decides what a file *is* by opening it, not by reading its name or its
first four bytes — every ZIP file on earth begins with the same four bytes, so a Java archive
renamed `thesis.docx` would otherwise be stored and served as a Word document.

**One inspector** serves every upload path. It refuses a package that

- is not a readable ZIP archive,
- holds more than 1,000 entries,
- expands past 100 MB in total, or past 20 MB across the parts that will be parsed as XML,
- nests XML deeper than 128 levels,
- lacks `[Content_Types].xml`, or
- lacks any part under the folder its extension claims — `word/` for `.docx`, `ppt/` for
  `.pptx`, `xl/` is not accepted anywhere.

Every limit is read from the ZIP directory before a single entry is decompressed, so the
inspection cannot itself be turned into a decompression bomb. This is the check phase 6 already
performs on template uploads; it becomes shared, gains the two required-part rules, and is
applied everywhere.

**Accepted types** are an allowlist on both submission paths:

| Where | Types | Checked by |
|---|---|---|
| Main submission document | `.docx`, `.pptx` | package inspector |
| | `.pdf` | `%PDF` header |
| Supporting files (0–3) | `.docx`, `.pptx` | package inspector |
| | `.pdf` | `%PDF` header |
| | `.png`, `.jpg` / `.jpeg` | file signature |
| Document template | `.docx` | package inspector, then marker scan |

The banned-extension list is gone: a file is accepted because it is recognised, not because it
failed to match a list of things known to be bad. Supporting files keep their limits — at most
three, at most 20 MB each, 90 MB for the request — and are still downloaded as
`application/octet-stream` with `nosniff`, because being a real PNG does not make it safe to
render in place.

A refused file answers `file.typeNotAllowed` when the extension is not on the list and
`file.contentMismatch` when the extension is on the list but the contents do not match it.

**A request that exceeds the server's size limit** answers a neutral `request.tooLarge` (413)
whose message names neither student import nor templates; each upload form states its own
limit next to the file field, and the student import keeps its specific `import.tooLarge` for a
file that arrives intact but is over 1 MB.

## 4. The archive

### 4.1 Why it exists

Submitted files live on disk under random keys; the rows that give them meaning live in the
database. `Group → GroupTask → StudentTask → Submission → SubmissionFile` cascades on delete,
so deleting a group erases every one of those rows in a single statement and leaves the files
behind with nothing pointing at them — unreachable, undeletable and still occupying disk.

The archive is where a cohort's work goes when the cohort's live records end. It is evidence:
readable, downloadable, and never re-attached to the running system.

### 4.2 What it holds

The archive refers to nothing. Every name, code and decision is copied into it as text at the
moment of archiving, and it holds no foreign key to a group, a student, a step or a user —
because each of those may be deleted afterwards, and the archive must still answer.

```
ArchivedGroup
    Id               Guid, PK
    GroupCode        string, required
    AcademicYear     string, required
    DepartmentName   string, required
    FacultyName      string, required
    GroupDeletedAt   DateTime?          -- set when the group itself was deleted
    CreatedAt        DateTime
    UpdatedAt        DateTime
    index (AcademicYear, GroupCode)

ArchivedGroupReviewer
    Id               Guid, PK
    ArchivedGroupId  Guid, FK -> ArchivedGroup, cascade
    ReviewerId       Guid               -- plain value, no foreign key
    ReviewerName     string, required
    unique (ArchivedGroupId, ReviewerId)

ArchivedFile
    Id               Guid, PK
    ArchivedGroupId  Guid, FK -> ArchivedGroup, cascade
    StudentName      string, required
    StudentNumber    string, required
    StepTitle        string, required
    StepOrder        int
    Deadline         DateTime
    Version          int
    SubmittedAt      DateTime
    IsLate           bool
    Decision         string?            -- Approved | Returned | null
    Mark             int?
    ReviewerName     string?
    ReviewerComment  string?
    DecidedAt        DateTime?
    Kind             string             -- Main | Supporting
    OriginalName     string, required
    ContentType      string, required
    SizeBytes        long
    StorageKey       string, required
    ArchivedAt       DateTime
    index (ArchivedGroupId, StudentName, StepOrder, Version)
```

One `ArchivedGroup` exists per group that has anything archived, whatever put it there; a
second archiving event for the same group adds files to the row that is already present.

### 4.3 What fills it

**Deleting a group** archives first, then deletes. Inside one transaction the system writes the
`ArchivedGroup` (with `GroupDeletedAt` set), the reviewers who were assigned to it, and one
`ArchivedFile` per submitted file of every student in that group, then lets the cascade run.
Nothing is deleted before the archive rows are committed, so a failure at any point leaves the
group intact.

**Archiving a student** archives a copy and changes nothing else. The student's rows, steps,
submissions and files stay exactly where they are — archiving a student is reversible today and
stays reversible, with their whole history intact when they are restored. (Owner decision,
2026-09-21.)

**Replacing or deleting a template's file** does *not* reach the archive; see §4.6.

### 4.4 One file, possibly two rows

An archived file and a live `SubmissionFile` may name the same stored key. The archive does not
copy bytes: archiving a student who is later restored would otherwise store their work twice
for as long as they remain archived, for no gain.

The rule that follows is explicit: **a stored file is deleted only when nothing points at it
any more.** Purging an archived group deletes each of its blobs only when no live
`SubmissionFile` and no other `ArchivedFile` holds that key. It is one existence check per file
and it makes double-archiving, restoring and purging safe in any order.

### 4.5 Reading it

| Who | Sees |
|---|---|
| Administrator | every archived group |
| Teacher | archived groups where their own id is among the stored reviewers |
| Anyone else | nothing; the routes are refused |

A teacher who reviewed a group keeps access to that group's archive after the group is gone,
which is why reviewer ids are copied in at archive time — the live `GroupReviewers` rows are
deleted with the group.

The administrator's **Archive** page lists archived groups with academic year, code,
department, student count, file count, total size and when they were archived, filterable by
year and searchable by code or student name. Opening one lists its files grouped by student and
then by step and version, each row showing the step, version, submitted date, late marker,
decision, mark and file size. **Files download one at a time**; there is no zip. (Owner
decision, 2026-09-21.) The page header shows total archive disk usage.

Nothing is restored. An archived group cannot be turned back into a group, and an archived file
cannot be re-attached to a submission. An administrator may **purge** an archived group
permanently — a confirmation naming the group code and its file count, then the rows and the
files that nothing else references are gone. Nothing expires on its own.

### 4.6 Template files

A document template is a blank form, not a student's work, so a replaced template file is
deleted rather than archived.

`DocumentTemplate` gains a row version. Replacing a template's file reads the version, writes
the new file, and saves against that version: if someone else replaced the file in between, the
save fails with a conflict (`template.conflict`, 409, "This template was changed by someone
else. Reload and try again.") and the file just written is removed. The file the successful
save replaced is deleted from storage after the transaction commits, so a rollback never leaves
a template pointing at a deleted file.

This closes the orphan without adding an archive nobody asked to browse.

### 4.7 Deleting a group with archived students

A group holding an **active** student is still refused (`group.hasStudents`), unchanged.

A group whose remaining students are **all archived** can be deleted. Their work and their full
record go to the archive, and then those archived student profiles and their user accounts are
deleted with the group, in the same transaction. (Owner decision, 2026-09-21.)

This is the one place in the system where a student account is deleted, and the archive is what
makes it acceptable: the name, the number, every submission, every mark and every reviewer
comment survive as archived text. What disappears is an account nobody can sign into, in a
group that no longer exists.

Their reservations, student tasks and topic links cascade or are cleared with the profile; any
`StudentProposal` topic they owned is deleted with them, and a catalogue topic they held
returns to `Available`. The confirmation dialog names the group, the number of archived students
whose accounts will be deleted, and the number of files being archived.

## 5. Identity and structure

### 5.1 A student number identifies one student

A student number is entered by a registrar, typed from a printed list, or pasted from a
spreadsheet, in a country where the Latin and Cyrillic alphabets share a dozen glyphs. `KB123`,
`KB 123` and Cyrillic `КВ123` are the same student on paper and three different students in a
database that compares strings.

The system therefore keeps two values:

- `StudentNumber` — exactly what was entered, used for display, export and generated documents;
- `StudentNumberCanonical` — the comparison form, carrying the unique index.

The canonical form is produced by removing every whitespace character and the separators
`-`, `_`, `/`, `.`, upper-casing with the invariant culture, and folding the Cyrillic letters
that are visually identical to Latin ones — `А В Е І К М Н О Р С Т У Х` → `A B E I K M H O P C
T Y X`. It is computed in one function, stored on write, and never shown.

Every path that looks a student up by number — import, claiming an account, the administrator's
student form — compares canonical forms. An import row whose canonical form already exists is
refused as a duplicate and names the existing number as it was entered, so the registrar can
see the two spellings side by side.

Existing numbers are recomputed when the schema is recreated; there is no deployed database to
migrate.

### 5.2 A conflict names the field that conflicts

Creating a faculty whose name matches one existing faculty and whose short name matches a
different one is a single request colliding with two rows. The system checks the two fields
independently and answers with the code for the field that actually collides, name before short
name, so `faculty.nameTaken` is never returned for a name that is free. Departments, which have
the same pair of unique indexes within a faculty, follow the same rule.

### 5.3 A student's topic has one source of truth

`StudentProfile.TopicId` is where a student's topic lives, with `SupervisorId` beside it. It is
guarded by a filtered unique index, so one student holds at most one topic, and it is written in
exactly one place — the reservation service, inside the transaction that settles the
reservation.

`TopicReservations` is the **history** of how the student got there: requests, approvals,
rejections, cancellations and change requests, newest first. No read derives a student's current
topic from it. A pending change request is still a `Pending` reservation held alongside the
approved one — that shape is unchanged — but "which topic does this student hold" is answered by
the profile alone. (Owner decision, 2026-09-21.)

## 6. Steps and their order

A step template's `Order` is unique within its faculty and determines the sequence students work
through. Administrators arrange that sequence directly on the Steps page: a row is dragged to
its new position, or moved with the `↑` and `↓` buttons every row carries, which do the same
thing from the keyboard. Dragging uses the browser's own drag events; no drag-and-drop library
is added. (Owner decision, 2026-09-21.)

Releasing a row sends **one request carrying the complete new order** for that faculty:

```
PUT /api/task-templates/order      Admin
{ "facultyId": "…", "templateIds": ["…", "…", …] }
```

The request is refused unless the list is exactly the faculty's templates — same set, no
duplicates, nothing missing (`taskTemplate.orderMismatch`, 400). The reorder is applied in one
transaction using the technique the existing single-step move already uses: every affected row's
order is negated and saved, then the target orders are written and saved, so no intermediate
state violates the unique index whatever order EF chooses for its statements. Orders are
rewritten as `1..n`, closing any gaps left by deletions.

The list re-renders optimistically and reverts if the request fails.

## 7. Progress, lateness and what each role sees

### 7.1 A step can be overdue without a submission

The `IsLate` flag is fixed on a submission when it is made. A step that was never submitted
cannot carry it, so a step whose deadline passed a month ago with nothing submitted has looked
exactly like a step that is not due yet.

The progress matrix therefore reports five states per cell, not four:

| Cell | Meaning |
|---|---|
| Pending | not submitted, deadline ahead |
| **Overdue** | not submitted (or returned and not resubmitted), deadline passed |
| Submitted | awaiting a decision |
| Returned | returned for revision, deadline ahead |
| Approved | approved, with its mark |

Overdue is computed by the server against the current instant, so it does not depend on the
client's clock, and it is carried on the same cell payload as the status. A legend below the
matrix names the five.

### 7.2 Lateness is counted in steps

A student who submits one step late three times is late on one step, not three. The student
progress figure counts **steps whose current submission was late** and is labelled *Late steps*.
The field is `lateSteps`; `lateSubmissions` is gone.

### 7.3 The student's dashboard

The student's dashboard keeps its topic card and progress summary and adds the **most recent
decision**: the step, whether it was approved or returned, the mark when approved, the reviewer's
comment, who made it and when, with a link into that step. A student whose work has never been
decided sees nothing in its place.

### 7.4 The teacher's dashboard

The teacher's dashboard grows from two counters into a working page, everything on it scoped by
the visibility rule phase 5 established — the groups they review, and the students they
supervise.

- **Waiting for review** — the count, and the **five most recent** submissions awaiting a
  decision: student, group, step, version, submitted date and late marker, each opening that
  submission for review. A link opens the full queue.
- **Overdue steps** — students in the teacher's groups whose deadline has passed with nothing
  submitted: student, group, step, deadline, days overdue. This is the one thing the review
  queue can never show, because a step that was never submitted never enters it.
- **Students I supervise** — the students whose topics this teacher supervises, with their
  topic, current step, its status and their next deadline. Supervision and reviewing are
  different relations: a supervised student may sit in a group the teacher does not review.
- **My groups** — one row per group reviewed: code, students, steps approved of total,
  submissions waiting, late steps.
- **Group progress** — a group selector above the existing progress matrix, showing students as
  rows and steps as columns exactly as the group progress page does, cells opening the step.

### 7.5 The administrator's dashboard

The administrator's dashboard is currently an empty heading. It becomes the platform overview:

- **Topic selection** — how many students hold an approved topic, how many have a request
  pending and how many have none; the selection deadline and the time remaining, or a note that
  none is set.
- **Review backlog** — submissions awaiting a decision, how many of them were late, and the
  number of overdue steps across all groups.
- **Structure** — faculties, departments, groups, active students, unclaimed accounts, teachers,
  topics by status.
- **Groups** — one row per group: code, academic year, department, students, approved topics,
  steps approved of total, submissions waiting, late steps; sortable by any column.
- **Group progress** — the same selector and matrix the teacher sees, over every group.

Every tile links to the page that acts on it. Counts are rendered as figures and proportion
bars built from the existing design tokens; no charting library is added.

The group selector is a single dropdown listing every group the viewer may see, labelled
`CODE — Department, 2026/2027`. (Owner decision, 2026-09-21.)

### 7.6 The topic page tells the student what happened

Two properties the *My topic* card is expected to hold:

- A rejected request is shown **whether or not the decision carried a comment**. The card is
  driven by the rejection, not by the comment; a rejection without a comment shows the topic, the
  rejected badge and the date, and no comment paragraph. It is dismissible as it is today.
- The selection deadline is evaluated **against the passing of time**, not only when something
  else causes a render. The page schedules a re-evaluation for the deadline instant (and
  re-evaluates when the window regains focus), so a page left open across the deadline stops
  offering *Reserve* and *Cancel* by itself, matching what the API would answer.

## 8. Reading at scale

Four reads are shaped for a cohort rather than a demonstration.

**The topic selection deadline** is read from `PlatformSettings` once per request and held for
the lifetime of the scoped settings service. A request that checks the deadline five times
issues one query; the next request reads the database again, so a change to the deadline takes
effect immediately.

**The topic list** projects each topic's active reservation once. Today five correlated
subqueries fetch the reservation id, its status, the student profile id, the student's name and
their group code independently — five scans of `TopicReservations` per topic row. A topic has at
most one active reservation (its filtered unique index guarantees it), so one projected subquery
returns all five values.

**Group and department lists** project to their response shapes inside the query instead of
materialising entity graphs with `Include` and mapping afterwards. The API returns exactly the
columns it sends.

**The review queue is paged.** `GET /api/review/queue` takes `page` (from 1) and `pageSize`
(default 25, maximum 100) beside the existing `groupId` and `late` filters, and returns
`{ items, page, pageSize, total }`. The queue page gains first / previous / next / last controls
and a "showing X–Y of Z" line, and changing a filter returns to page 1. The `total` is also what
the dashboards' "waiting for review" figure reads, so it stays correct without a second query.

## 9. The repository

**Check scripts leave the database as they found it.** Every script in `.superpowers/checks/`
removes what it created — students, topics, step templates, groups, templates — on success *and*
on failure, through a cleanup registered as each artefact is created and run from a `finally`.
`templates-check.mjs` is the model. Because a group cannot be deleted while a student points at
it and students cannot be deleted at all, a script restores the students it archived, moves them
into the seeded group and archives them there, which the existing scripts already do; what is
new is that this runs when the script fails, and that step templates and topics are cleaned up
too. The seeded data — `FICS`, `SE`, `SEED-A`, the eight step templates, the three accounts — is
never touched.

**Line endings are pinned.** A `.gitattributes` at the repository root declares `* text=auto
eol=crlf`: text is stored with LF and checked out with CRLF, which is what the editors and
Visual Studio on both machines expect. Binary types (`*.docx`, `*.pdf`, `*.png`, `*.jpg`,
`*.ico`, `*.woff*`) are marked `binary` so they are never converted. The renormalisation —
`GroupService.cs`, `GroupTaskService.cs`, `GroupServiceTests.cs`, `AppDbContextModelSnapshot.cs`
and `test-backlog.md` — lands as its own commit, separate from any behaviour change, so the
diff that rewrites line endings is never mixed with a diff that changes code.

## 10. Data model changes

| Entity | Change |
|---|---|
| `AppUser` | no change (the per-request check reads existing columns) |
| `StudentProfile` | `StudentNumberCanonical` added, required; the unique index moves from `StudentNumber` to it |
| `DocumentTemplate` | `RowVersion` added |
| `ArchivedGroup` | new |
| `ArchivedGroupReviewer` | new |
| `ArchivedFile` | new |

The single `InitialCreate` migration is regenerated, as every increment does. **Every machine
must drop its local database**, and the owner is told before it happens.

## 11. API surface

| Method | Route | Access | Purpose |
|---|---|---|---|
| PUT | `/api/task-templates/order` | Admin | Complete new order for one faculty |
| GET | `/api/review/queue` | Teacher, Admin | Paged: `page`, `pageSize`, `groupId`, `late` |
| GET | `/api/dashboard/student` | Student | Progress summary and most recent decision |
| GET | `/api/dashboard/teacher` | Teacher | Counts, latest five to review, overdue steps, supervised students, per-group rows |
| GET | `/api/dashboard/admin` | Admin | Selection progress, backlog, structure counts, per-group rows |
| GET | `/api/archive/groups` | Admin, stored reviewers | Archived groups, filterable by year, searchable |
| GET | `/api/archive/groups/{id}` | Admin, stored reviewers | One archived group with its files |
| GET | `/api/archive/files/{id}` | Admin, stored reviewers | Download one archived file |
| GET | `/api/archive/usage` | Admin | File count and total bytes |
| DELETE | `/api/archive/groups/{id}` | Admin | Permanent purge |

`GET /api/groups/{id}/progress` gains `isOverdue` on each cell; `GET
/api/students/{id}/progress` renames `lateSubmissions` to `lateSteps`. The three placeholder
`/api/dashboard/*` endpoints are replaced by the real ones above.

New error codes: `password.policyElevated` (400), `request.tooLarge` (413),
`taskTemplate.orderMismatch` (400), `template.conflict` (409), `archive.notFound` (404). All are
translated in `uk` and `en`. A file that cannot be removed from disk during a purge does not fail
the purge: the rows go, the failure is logged, and the blob is collected by the next purge that
finds nothing referencing it.

## 12. Amendments to earlier designs

- `2026-09-17-submission-and-review-design.md` §5 — supporting files are an allowlist
  (`.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`/`.jpeg`), every one inspected; the banned-extension
  list is removed, and the text no longer implies it stops a disguised archive.
- `2026-09-17-submission-and-review-design.md` §7 and §8 — the review queue is paged; the student
  progress figure counts late steps.
- `2026-09-17-topics-and-reservation-design.md` — `StudentProfile.TopicId` is named as the single
  source of truth and reservations as history.
- `2026-09-17-document-templates-design.md` — `DocumentTemplate` carries a row version and a
  replaced file is deleted.

## 13. Deliberately not included

Settled by the owner; recorded so they are not re-proposed.

- **Existence oracles.** A step or submission belonging to another user keeps answering 403
  `studentTask.notYours` / `submission.notReviewer` rather than a 404 identical to a missing id.
  An id can therefore still be confirmed to exist by someone who guesses it. Accepted
  (2026-09-21); `2026-09-17-submission-and-review-design.md` §7 stands unchanged.
- **A stored audit trail.** Security events are log lines only (2026-09-21).
- **Password changes do not end other sessions** (2026-09-21).
- **Topic requests awaiting a teacher's decision** are not surfaced on the teacher's dashboard,
  although a teacher decides reservations for their own topics and nothing announces one
  (2026-09-21).
- **Rate limiting** stays built and switched off (2026-09-19).
- **Identity proof during registration** stays as it is (2026-09-19).
- **Faculties and departments** stay readable by any signed-in user (2026-09-19).
- **A concurrency cap** on template generation and upload: accepted risk (2026-09-19).
- **`{{supervisor.email}}`** stays visible to students (2026-09-20).
- **The accessibility pass** stays parked pending the owner's consultation.
- **Zip download of an archived group**, and **restoring** anything from the archive
  (2026-09-21).
