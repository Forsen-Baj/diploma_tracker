# Diploma Tracker — Review Panels and Document Routing Design

Date: 2026-09-24
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md`
Builds on: submission and review (phase 5), document templates (phase 6), hardening and
polish (phase 8)

## 1. Purpose

This design covers two capabilities, delivered as two phases.

**Phase 9 — Review panels.** A step is reviewed by the student's supervisor, and the
supervisor or other staff can add more reviewers to one student's step. Every reviewer on
that panel gives their own mark or returns the step with a comment. The step is approved when
the whole panel has approved, and its mark is the average of the panel's marks.

**Phase 10 — Document routing.** Every user has a place to keep documents and pass them to
other people for review or signature. A document is with one person at a time. That person
finishes it, passes it on, or sends it back to someone who already worked on it. The
document's versions and every hand-off form a timeline that everyone involved can read.

Phase 7 (document preview and commenting) follows both, with its own design.

## 2. Decisions

| Topic | Decision |
|---|---|
| Who reviews a step | The student's supervisor, plus any extra reviewers added to that student's step |
| Extra reviewers | Added per student and per step, never group-wide. Any active teacher or administrator can be one |
| Who adds extra reviewers | The student's supervisor, a reviewer of the student's group, or an administrator |
| Group reviewers | Watch their groups: progress, step pages and files. They add extra reviewers but do not mark steps themselves |
| Administrators | May decide in the supervisor's place, and may add or remove extra reviewers on any step |
| Approval rule | The supervisor's approval plus an approval from every extra reviewer |
| A return | One return sends the step back to the student at once. Approvals already given **stay**; after resubmission, only the reviewers who have not approved decide again |
| Step mark | The average of the panel's approval marks, rounded to a whole number (half away from zero); each reviewer's own mark stays visible |
| Documents: who | Every role: administrators, teachers and students |
| Documents: movement | One holder at a time. Each hand-off is either **for review** or **for signing** |
| Signing | Done outside the system (on paper or with a qualified e-signature). The signer uploads the signed copy as a new version |
| Documents page | The existing *Documents* page holds four clearly separated sections: *For review*, *For signing*, *My documents* and *Templates* |

## 3. Phase 9 — Review panels

### 3.1 Domain model

**`StudentTaskReviewer`** — an extra reviewer on one student's step.
| Field | Rules |
|---|---|
| `Id` | Guid |
| `StudentTaskId` | required; cascade on delete |
| `ReviewerId` | required; an active user whose role is `Teacher` or `Admin` |
| `AddedById` | required; the user who added them |
| `AddedAt` | UTC |

Unique on (`StudentTaskId`, `ReviewerId`). The student's current supervisor cannot be added
as an extra reviewer; they are already on the panel.

**`SubmissionReview`** — one reviewer's decision on one submitted version.
| Field | Rules |
|---|---|
| `Id` | Guid |
| `SubmissionId` | required; cascade on delete |
| `ReviewerId` | required; the user who decided |
| `Seat` | `Supervisor` or `Extra` (string) — the panel seat this decision fills |
| `Decision` | `Approved` or `Returned` (string) |
| `Mark` | 0–100; required when approving, empty when returning |
| `Comment` | at most 2000 characters; required when returning, optional when approving |
| `DecidedAt` | UTC |

Unique on (`SubmissionId`, `ReviewerId`): a reviewer decides once per version.

**`Submission`** keeps its version, message, files, late flag and timestamps. It no longer
holds a reviewer, comment or mark. Its `Decision` becomes the outcome of the version:
empty while the panel is still deciding, `Returned` when a reviewer returned it, and
`Approved` when it completed the panel.

**`StudentTask`** keeps `Status`, `Mark`, `CompletedAt` and `RowVersion`. `Mark` is the
panel average, written when the step is approved.

### 3.2 The panel

A step's panel is worked out when it is read, never stored as one list:

- **Supervisor seat.** The student's current supervisor. A student who is working on steps
  always has one, because work starts only once they hold a topic and every topic has a
  supervisor.
- **Extra seats.** One per `StudentTaskReviewer` row.

A seat is **satisfied** when some version of this step carries an approval for it:

- The supervisor seat is satisfied by an approval in the `Supervisor` seat, given by the
  current supervisor or by an administrator.
- An extra seat is satisfied by an approval in the `Extra` seat from that reviewer.

Approvals are sticky. A reviewer who approved version 1 still counts after version 2 arrives.

If the supervisor changes while the step is open (a topic change), the new supervisor's seat
needs their own approval. The former supervisor's decisions stay in the timeline but no
longer count.

### 3.3 Workflow

```
Pending   --submit (topic held, previous step Approved)---------------> Submitted
Submitted --a seat approves, others still open------------------------> Submitted
Submitted --the last open seat approves-------------------------------> Approved (final)
Submitted --any seat returns (comment required)-----------------------> Returned
Returned  --submit again----------------------------------------------> Submitted (Version + 1)
```

- A decision applies to the latest submission while the step is `Submitted`.
- A reviewer may decide only while their seat is open. A satisfied seat has nothing left to
  decide.
- Which seat a decision fills:
  - A caller who is the supervisor, or sits in an extra seat, decides in their own seat.
  - An administrator with no seat of their own fills the supervisor seat if it is open.
  - When that seat is already satisfied, the administrator is refused
    (`review.seatSatisfied`) and can remove an extra reviewer instead.
- On the approval that satisfies the last open seat:
  - the submission becomes `Approved`;
  - the step becomes `Approved`;
  - `Mark` is set to the rounded average of the marks behind every satisfied seat;
  - `CompletedAt` is set.
- On a return, the submission and the step become `Returned` in the same save.
- Every decision saves under the step's `RowVersion`. Two reviewers deciding at the same
  moment cannot both complete the panel or both return; the second one receives
  `submission.alreadyDecided` and reloads.
- The panel can change until the step is approved (`Pending`, `Submitted` or `Returned`):
  - Adding an extra reviewer opens a new seat.
  - Removing an extra reviewer drops their seat, and any approval they gave stops counting
    toward the mark.
  - If a removal leaves every remaining seat satisfied while the step is `Submitted`, the step
    is approved at that moment, by the same rule.
- An approved step is final. Its panel can no longer change (`step.alreadyApproved`).

### 3.4 Visibility

- **Extra reviewer.** Sees the step page of every student step they sit on: the timeline,
  files and decisions. They can download that step's files. The step appears in their review
  queue. This does not make them see the group or the student's other steps.
- **Supervisor, group reviewers and administrators.** See what they see today.
- **Student.** Sees the whole panel on their step page: each reviewer, their decision on
  each version, and their marks and comments.

`IAccessScope` gains a step-level rule, `CanSeeStudentTaskAsync`: today's group rule, OR an
extra seat on that step. Step detail and submission-file download use it. Group-scoped
queries still use `VisibleGroups`.

### 3.5 API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/student-tasks/{id}` | as §3.4 | Step detail. Also returns the panel (seat, reviewer, whether the seat is satisfied, and by what mark), and each submission's reviews in place of the single decision. `canDecide` says whether the caller has an open seat |
| GET | `/api/student-tasks/{id}/reviewers` | as §3.4 | The panel |
| POST | `/api/student-tasks/{id}/reviewers` | supervisor, group reviewer, Admin | Body `{ reviewerId }`: add an extra reviewer |
| DELETE | `/api/student-tasks/{id}/reviewers/{reviewerId}` | supervisor, group reviewer, Admin | Remove an extra reviewer |
| POST | `/api/submissions/{id}/approve` | a reviewer with an open seat, or Admin | Body `{ mark, comment? }`: the caller's approval |
| POST | `/api/submissions/{id}/return` | a reviewer with an open seat, or Admin | Body `{ comment }`: the caller's return |
| GET | `/api/review/queue` | Teacher, Admin | **Teacher:** submissions where they hold an open seat. **Admin:** every submission awaiting a decision. Each item shows how many seats are satisfied (for example "2 of 3"). Filters and paging as today |
| GET | `/api/staff/options?search=` | Teacher, Admin | Active teachers and administrators (id, name, role) for the reviewer picker, 20 at most |

**New error codes:**

| Code | Status | Meaning |
|---|---|---|
| `review.notOnPanel` | 403 | The caller has no seat on this step |
| `review.seatSatisfied` | 409 | The caller's seat has already approved |
| `panel.reviewerInvalid` | 400 | Unknown, inactive, or a student |
| `panel.reviewerIsSupervisor` | 409 | The supervisor already sits on the panel |
| `panel.reviewerExists` | 409 | That reviewer is already on the panel |
| `panel.reviewerNotFound` | 404 | Not an extra reviewer on this step |
| `panel.notAllowed` | 403 | The caller may not change this panel |

`submission.notReviewer` is replaced by `review.notOnPanel`.

### 3.6 Everything else that reads a decision

- **Dashboards.**
  - *Waiting submissions* for a teacher counts their open seats.
  - The student's *most recent decision* card shows the latest review: reviewer, decision,
    mark or comment.
- **Progress matrix.** Unchanged: status, final mark, and the late and overdue flags.
- **Archive.** A new `ArchivedReview` row (student, step, version, reviewer name, seat,
  decision, mark, comment, date) is copied as text beside `ArchivedFile`, which keeps only
  the version's outcome and the step mark. It holds no foreign keys, like the rest of the
  archive.
- **Group deletion.** `StudentTaskReviewer` and `SubmissionReview` go with their student
  task. A user who reviewed cannot be deleted, because staff accounts are never deleted.

### 3.7 Interface

- **Step page (all roles).**
  - A *Review panel* card lists each seat: reviewer name, "Supervisor" or "Extra reviewer",
    and state (*Approved — 85*, *Returned*, *Waiting*).
  - People who may change the panel get *Add reviewer* (a searchable picker of teachers and
    administrators) and a remove action per extra seat.
  - The timeline shows every reviewer's decision under each version.
  - *Approve* (mark, optional comment) and *Return* (comment) appear only for a caller with an
    open seat.
- **Review queue.** Teachers see what waits for *them*, with a "2 of 3" panel column.
  Administrators see everything awaiting a decision.
- **Student's *My work*.** A submitted step shows "Under review — 2 of 3 approved".

## 4. Phase 10 — Document routing

### 4.1 Domain model

**`RoutedDocument`**
| Field | Rules |
|---|---|
| `Id` | Guid |
| `OwnerId` | the user who created it |
| `Title` | required, at most 200 characters |
| `Description` | optional, at most 2000 characters |
| `State` | `WithOwner`, `InCirculation`, `Completed` (string) |
| `HolderId` | who holds it now: the owner while `WithOwner`, the recipient while `InCirculation`, empty when `Completed` |
| `Purpose` | `Review` or `Signing` while `InCirculation`; empty otherwise |
| `CreatedAt`, `UpdatedAt` | UTC |
| `RowVersion` | concurrency token |

**`DocumentVersion`**
| Field | Rules |
|---|---|
| `Id` | Guid |
| `DocumentId` | required |
| `Number` | 1, 2, 3 … per document |
| `UploadedById` | nullable (set to null when that account is deleted); `UploadedByName` keeps the name as text |
| `OriginalName`, `StorageKey`, `ContentType`, `SizeBytes` | as for submission files |
| `UploadedAt` | UTC |

**`DocumentEvent`** — one line of the timeline.
| Field | Rules |
|---|---|
| `Id` | Guid |
| `DocumentId` | required |
| `Sequence` | 1, 2, 3 … per document |
| `Kind` | `Created`, `VersionAdded`, `Sent`, `Forwarded`, `Done`, `Rejected`, `Recalled` (string) |
| `ActorId` / `ActorName` | who acted; the id is nullable (set to null when that account is deleted), the name is kept as text |
| `RecipientId` / `RecipientName` | for `Sent`, `Forwarded` and `Rejected`; same nullability |
| `Purpose` | for `Sent` and `Forwarded` |
| `Comment` | at most 2000 characters |
| `VersionNumber` | the version the event refers to, if any |
| `At` | UTC |

**Participants** are the owner plus everyone named as actor or recipient in the timeline.
The set is derived from the events; it is not a separate table.

### 4.2 Workflow

```
(create, first version) -------------------------------------> WithOwner
WithOwner     --send (recipient, purpose, comment?)-----------> InCirculation
InCirculation --forward (holder → next person, purpose)-------> InCirculation
InCirculation --reject (holder → an earlier participant)------> InCirculation, or WithOwner if sent back to the owner
InCirculation --done (holder)---------------------------------> Completed
InCirculation --recall (owner)--------------------------------> WithOwner
Completed     --send again (owner)----------------------------> InCirculation
```

- **Versions.**
  - The holder may upload a new version at any time while they hold the document. While it
    is `WithOwner` or `Completed`, only the owner may.
  - Forward and Done can carry a new version in the same request.
- **Signing.** When the holder received the document *for signing*, Forward and Done require
  that the holder has added a version during their turn, i.e. the signed copy
  (`document.signedCopyRequired`). Reject never requires one.
- **Reject.**
  - Needs a comment.
  - The target must be an earlier participant who held the document before the current
    holder, or the owner.
  - The default target is the person who handed it to the current holder.
  - The target holds it again with the purpose they had last time, and the rejection comment
    is shown at the top of the document. If the target is the owner, the document returns to
    `WithOwner`.
- **Done** ends the circulation. The document shows *Completed — done by {name}*, and the
  owner can send it out again later.
- **Recall.** The owner can take the document back while it circulates, for example when the
  holder is away or their account was deactivated.
- **Recipients.**
  - Any active user other than the caller.
  - A student may send or forward only to staff (teachers and administrators).
  - Staff may send to anyone.
  - Refused otherwise (`document.recipientInvalid`).
- **Deletion.** The owner may delete a document only while it was never sent. Once it has
  circulated, it stays, because its timeline belongs to everyone involved.
- **Concurrency.** Every action saves under `RowVersion`. A holder who acts on a stale view
  receives `document.changed` and reloads.

### 4.3 Access

A participant sees the document, its timeline and every version, and can download any
version. Only the holder acts on it, except that the owner can also recall it, delete it, or
send it again. Administrators have no special access to other people's documents. A document
the caller may not see answers exactly like a missing one (`document.notFound`, 404).

### 4.4 Files

- One file per version.
- The same allowlist and package inspection as supporting files: `.pdf`, `.docx`, `.pptx`,
  `.png`, `.jpg`/`.jpeg`, at most 20 MB, inspected by `OfficePackageInspector`.
- Written to `IFileStorage` before the save, and removed if the save fails.
- Downloaded as an attachment with `X-Content-Type-Options: nosniff`, following the rules
  for submission files.

### 4.5 Account deletion

Group deletion is the only path that deletes accounts (for archived students).

- Documents the student owns are deleted with their versions and events. Their stored files
  are deleted when nothing else points at them.
- A document the student holds but does not own returns to its owner (`WithOwner`) with a
  `Recalled` event, so no one is left holding a document with no one to act on it.
- Their events and versions in other people's documents keep their names as text, with the
  user id set to null.
- The group deletion preview shows how many documents will be deleted.

### 4.6 API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/documents?box=review\|signing\|mine\|handled` | Lists: held by me for review; held by me for signing; owned by me; ones I took part in but neither own nor hold |
| GET | `/api/documents/counts` | `{ review, signing }`: waiting for me, for the navigation badge |
| POST | `/api/documents` | Multipart `title`, `description?`, `file` → `WithOwner`, version 1 |
| GET | `/api/documents/{id}` | Detail, versions, timeline, and the actions the caller may take (`canSend`, `canForward`, `canReject`, `rejectTargets`, `canDone`, `canRecall`, `canDelete`, `canAddVersion`) |
| PUT | `/api/documents/{id}` | Owner, while `WithOwner`: title and description |
| DELETE | `/api/documents/{id}` | Owner, never sent |
| POST | `/api/documents/{id}/versions` | Multipart `file`, `comment?` |
| POST | `/api/documents/{id}/send` | Owner: `{ recipientId, purpose, comment? }` |
| POST | `/api/documents/{id}/forward` | Holder: multipart `recipientId`, `purpose`, `comment?`, `file?` |
| POST | `/api/documents/{id}/reject` | Holder: `{ targetId?, comment }` |
| POST | `/api/documents/{id}/done` | Holder: multipart `comment?`, `file?` |
| POST | `/api/documents/{id}/recall` | Owner: `{ comment? }` |
| GET | `/api/document-versions/{id}` | Download |
| GET | `/api/documents/recipients?search=` | Active users the caller may send to (id, name, role, and group code for a student), 20 at most |

**Error codes:**

| Code | Status | Meaning |
|---|---|---|
| `document.notFound` | 404 | Missing, or not visible to the caller |
| `document.notHolder` | 403 | Only the holder can do this |
| `document.notOwner` | 403 | Only the owner can do this |
| `document.wrongState` | 409 | The action does not fit the document's state |
| `document.signedCopyRequired` | 400 | A signing turn needs the signed copy first |
| `document.recipientInvalid` | 400 | Not an allowed recipient |
| `document.rejectTargetInvalid` | 400 | Not an earlier participant |
| `document.alreadySent` | 409 | A document that has circulated cannot be deleted |
| `document.changed` | 409 | Someone else acted first; reload |

Validation and file errors reuse `validation.failed` and the `file.*` codes.

### 4.7 Interface

The **Documents** page becomes four visually separated sections: headed cards, or tabs with
count badges. The first section that has something waiting for the user opens by default.

1. **For review** — documents held by me for review: title, owner, from whom, since when,
   comment.
2. **For signing** — documents held by me for signing, with the same columns.
3. **My documents** — what I own, with state, current holder and last activity, plus
   *New document* (title, description, file). A secondary switch shows *Handled by me*: what
   I took part in and no longer hold.
4. **Templates** — the existing template list and generation, unchanged apart from its
   heading.

A **document page** (`/documents/:id`) shows:
- the title, owner and state;
- who holds it and why, with a prominent banner when it was rejected back to the viewer;
- the versions, with downloads;
- the timeline;
- an action panel for what the viewer may do:
  - *Upload new version*;
  - *Send* or *Forward* — a recipient picker, a Review / Signing choice and a comment;
  - *Reject* — a target list with the default preselected, and a comment;
  - *Mark as done*;
  - *Recall*;
  - *Delete*.

For a signing turn, *Forward* and *Mark as done* ask for the signed copy in the same dialog.

The **navigation item** *Documents* shows a badge with the number of documents waiting for
the user (review + signing).

## 5. Delivery and verification

The work is delivered in two phases on the current branch, each with its own implementation
plan and a single commit. Work stops after each phase for the owner's manual test.

1. **Phase 9, review panels:**
   - model and panel rules;
   - endpoints, visibility, queue, dashboards and archive;
   - pages.
2. **Phase 10, document routing:**
   - model, storage and workflow;
   - endpoints and account-deletion handling;
   - the reorganised Documents page and the document page.

Each phase regenerates the single `InitialCreate` migration, so every machine drops its
database again. Automated checks for each phase:

- backend build and `has-pending-model-changes`;
- a new check script:
  - `review-panels-check.mjs`: two extras, partial approval, a return with sticky
    approvals, the averaged mark, removal completing a panel, and extra-reviewer visibility
    limits;
  - `document-routing-check.mjs`: send, forward, reject to the default and to the owner,
    the signed-copy rule, done, recall, the student recipient rule, participant-only access
    and delete-once-sent;
- the existing eight scripts;
- frontend `tsc`, lint, `i18n:check` and build.

The demo data script gains:
- extra reviewers on a few demo steps, one step in each panel state;
- a handful of documents at different points of their route.

Unit tests are added to `docs/superpowers/test-backlog.md`.

## 6. Not included

- Adding one extra reviewer to many students in one action (added per student in this
  design).
- Reviewer panels defined on a step template or a group step.
- A route planned in advance (A → B → C), and sending one document to several people at
  once.
- Cryptographic signatures, or checking an uploaded signed copy.
- Linking a routed document to a step submission.
- Notifications beyond the navigation badge (no email).
- Preview and commenting inside documents (phase 7).
