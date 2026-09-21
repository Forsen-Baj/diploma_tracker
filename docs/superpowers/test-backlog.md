# Test Backlog

Coverage to write in the end-of-project testing pass. Each phase appends its section when
its review completes.

## Phase 2 — Academic structure

### Service level, InMemory
- **`DepartmentService.UpdateDepartmentAsync`:**
  - Renaming to another department's name or short name in the same faculty gives
    `DepartmentNameTaken` or `DepartmentShortNameTaken`. Spec 6 requires duplicate
    rejection; only create is covered.
  - A cross-faculty move into a faculty that already has that name conflicts.
  - A cross-faculty move to a free faculty succeeds and maps the new `FacultyName`.
  - Values are trimmed on update.
- **`FacultyService`:**
  - Update to another faculty's short name gives `FacultyShortNameTaken`.
  - Trimming on update.
  - `CreatedAt` and `UpdatedAt` in the response mapping.
  - `DeleteFacultyAsync` and `GetFacultyByIdAsync` with an unknown id.
- **`DepartmentService`:** `DeleteDepartmentAsync` with an unknown id.
- **`GroupService`:**
  - A duplicate (Name, AcademicYear) on create and on update returns exactly
    `"Group with the same name and academic year already exists."`. Assert the literal so
    the `GroupsController` string comparison stays pinned.
  - Update that changes department maps the new department and faculty names.
  - Mapping in `GetGroupByIdAsync`.
  - Precedence of `DepartmentNotFound` over the duplicate error.
  - `UpdateGroupAsync` and `DeleteGroupAsync` for an unknown group.
  - Description whitespace becomes null.
- **Teacher visibility:** whichever visibility rule is chosen (filtered `GetGroupsAsync`,
  forbidden by-id and reviewer reads).
- **`AdminBootstrapper`:** an existing admin suppresses the short-password throw.
- **`DbSeeder`:** running twice is idempotent; a renamed short name does not
  re-insert.

### HTTP level (none exist yet; would need `WebApplicationFactory`)
- Faculty and department writes give 401 without a token and 403 as Teacher or Student;
  reads give 200 as Student.
- `GET /api/faculties/{unknown}/departments` and `GET /api/departments?facultyId={unknown}`
  give 404. POST or PUT department with an unknown body `facultyId` gives 400. Delete with
  dependents gives 409.
- Group create or update with an unknown department gives 400; a duplicate gives 409.
- Model validation: blank or whitespace names and over-length values give 400, including
  group DTOs.

### SQL Server integration (InMemory cannot exercise these)
- Unique-index violations and FK Restrict at the database.
- The race mapping: a forced collision on `SaveChanges` returns the 409 error
  string, and 547 on delete returns the has-dependents error.
- Case-insensitive duplicate detection under the default collation ("fics" vs "FICS"),
  including Cyrillic names. InMemory is case-sensitive, so service tests cannot show this.
- `f.Id != excludedId` with a null `excludedId` on create (runtime-proven once in Task 14,
  not locked in).

### Frontend (no test infrastructure yet)
- FacultiesPage: a stale or out-of-order department response does not render under another
  faculty, and an edit keeps the department's own faculty.
- A 409 on delete opens the modal.
- Edit state clears after deleting the edited record.
- GroupsPage: the department selector is required and pre-fills on edit; the list stays
  visible on error.

## User onboarding

### Service level, InMemory
- `SimpleCsv`: delimiter detection (`;` vs `,`, delimiters inside quotes ignored); quoted fields with doubled quotes, quoted line breaks, CRLF and LF; line numbers of records after a quoted line break; trailing record without a newline.
- `SimpleCsv`: a quote inside an unquoted field, an unterminated quoted value at end of input, and characters after a closing quote are rejected with the misplaced-quote error; bare-CR line endings; a record made only of separators (`;;;`) treated as blank; a header preceded by blank lines.
- `StudentImportService`: unknown group; missing file; wrong extension; file over 1 MB; invalid UTF-8; BOM stripped; header missing a required column; more than 500 rows; each row rule (missing value, invalid email, over-length values, duplicate email and duplicate number within the file, teacher/admin email, email with different number, number with different email); exact match skipped; all-or-nothing on any row error; created students are unclaimed, active, in the chosen group, with normalised email and number and optional patronymic.
- `StudentImportService`: an existing student matched by email and number but deactivated or in another group is skipped; Cyrillic number case-folding (`кв1` in the file vs stored `КВ1`) is skipped, not an error; a row with both a format error and a database conflict lists every problem.
- `AuthService.ClaimAccountAsync`: closed registration; password policy bounds (7, 8, 128, 129 characters); normalised email and number; wrong number, unknown email, deactivated student and already-claimed account all return the same mismatch error; success returns a token and sets the hash.
- `AuthService.LoginAsync`: unclaimed account refused; email normalised.
- `AuthService.ChangePasswordAsync`: wrong current password; policy violation; success.
- `StudentService`: create without password is unclaimed; create with short password refused; duplicate email and duplicate student number; unknown group and unknown/inactive supervisor; update clears supervisor when omitted; `ResetAccessAsync` clears the hash and sets `ClaimReopened` for that student only; `IsClaimed` and `ClaimReopened` mapping; reset, teacher password set and password change write their Information log events without passwords, hashes or student numbers.
- `StudentService`: an update whose unique conflict appears only at `SaveChanges` maps to the right message (email vs student number); updating a student whose current supervisor is inactive succeeds when the supervisor is unchanged, and fails when an inactive supervisor is newly chosen.
- `TeacherService`: patronymic trimmed/nullable; create password policy; `SetPasswordAsync` unknown teacher and policy.
- `TeacherService`: create or update unique-index race returns the email-taken error.
- `RegistrationService`: default closed from seeded row; set and read back.
- `ValidEmailAttribute` / `IdentityNormalizer.IsValidEmail`: the same addresses are accepted by the student/teacher DTOs and by the import.
- `AuthService.LoginAsync`: missing, inactive and unclaimed accounts still run one password verification (dummy hash).

### HTTP level
- `GET /api/registration` anonymous 200; `PUT` requires Admin (401/403).
- `POST /api/auth/claim` while open: 400 mismatch, 200 success. While closed: a reopened account claims with 200 and loses `ClaimReopened`; a non-reopened account, wrong details, and a second claim of the reopened account all return 403 `Registration is closed.`; a reset never changes the registration switch.
- `GET /api/groups/{id}/students` items carry `studentNumber` and `isClaimed`.
- `POST /api/groups/{id}/students/import` requires Admin; 404 unknown group; 400 body shape `{ message, errors: [{ line, message }] }`; 200 body shape `{ created, skipped: [{ line, email }] }`.
- `POST /api/students/{id}/reset-access` 204/404; `PUT /api/teachers/{id}/password` 204/400/404; `PUT /api/auth/password` 204/400/401.
- `PUT /api/registration` with `{}` returns 400.
- Rate limiter off by default: with `RateLimiting:Enabled` false, more than 10 logins per minute from one IP succeed. With it true: login and claim return 429 after 10 requests per minute from one IP; they share one per-IP budget; different IPs are limited independently; IPv6 clients in the same /64 share a bucket; the 429 response carries `Retry-After` and a `{ message }` body and still carries CORS headers for the web origin.
- Import upload above the 2 MB request limit returns 413; group deleted between the existence check and save returns 404 and writes nothing.

### SQL Server integration
- Unique index on `StudentProfiles.StudentNumber`; concurrent import conflict returns 409 and writes nothing.
- `PlatformSettings` seed row present after migration.
- `ClaimAccountAsync` and `ChangePasswordAsync` use `ExecuteUpdateAsync`, which the InMemory provider does not support: cover them against SQL Server. Two concurrent claims of the same account — exactly one succeeds and the stored hash matches its password; a password change racing an access reset does not undo the reset.

### Frontend
- Claim page: closed notice, password mismatch and length messages, success signs in.
- Login page always shows the claim link; 429 message.
- Claim page renders the form while closed with the closed notice; Students page shows the Reopened badge and the one-student reset confirmation; Group details page shows student number and claimed badge.
- Students page: registration toggle, import success summary and row-error list, template download content, reset access confirmation.
- Teachers page: set-password modal validation.
- `apiClient` omits `Content-Type` for `FormData` and extracts the first message from ProblemDetails `errors`; a 413 import shows the file-too-large message.
- Account page shows the 400 current-password error.
- Claim page shows a registration-status fetch failure distinctly from the closed notice.
- Students page: create password keeps surrounding spaces; oversize file rejected before upload; edit form keeps and labels an inactive current supervisor.
- Teachers page: set-password confirmation mismatch; success notice; backdrop ignored while saving.

## Design system and refinements

### Service level, InMemory
- `TaskTemplateService`: active-title uniqueness is per faculty (same title allowed in two faculties, refused twice in one); faculty change refused while the template is assigned (`taskTemplate.inUse`); unknown faculty on create.
- `GroupTaskService`: assigning a template of another faculty (`groupTask.templateFacultyMismatch`); assign-all limited to the group's faculty's active templates; `startDate` after `deadline` refused; student-task counts and fan-out exclude archived students, including right after a deadline edit.
- `GroupService`: `(AcademicYear, Code)` uniqueness; whitespace-only code or academic year refused; optional name normalised to null.
- `StudentService` / archiving: batch archive is all-or-nothing on an unknown id (404 `student.notFound`); already-archived ids ignored in the count; restore re-activates and re-creates missing steps; archived students refused for edit, group move, supervisor change and reset access (`student.archived`); archived excluded from lists and group student lists.
- Late-joiner steps: a student created, imported, moved or restored into a group receives exactly the group's existing steps, with no duplicates, in the same save.
- `AdminService`: create/update/set password; self-deactivate refused; last active administrator refused, including two concurrent deactivations against the last two.

### HTTP level
- Every error body is `{ code, message }`, including framework-generated 401/403/404/405/415 and an over-2 MB import (413 `import.tooLarge`); a genuine failure is 500 `server.unexpected`.
- Task-template writes require Admin (teacher token → 403); admin endpoints require Admin.
- Model-validation failures return `validation.failed` with `fields`; duplicate field names do not throw.

### Frontend
- Error codes render translated messages in both languages; an unmapped code falls back to the server message.
- Language toggle switches on a click anywhere and persists across reloads; `<html lang>` follows.
- Tooltips appear for icon-only actions and truncated labels, including disabled buttons, and are dismissed with Escape.
- Group step period round-trips through the editor without shifting by the UTC offset.
- Batch selection: header checkbox indeterminate state, selection cleared after archive/restore, counts in confirmations and toasts.
- Ukrainian plurals use one/few/many for counted strings.

### Owner notes follow-up (2026-09-18)
- `ValidAcademicYearAttribute`: trimmed length boundary (20 vs. 21 characters after trimming);
  every disallowed character class (letters of any alphabet, punctuation outside
  `/ \ - .`); an all-whitespace value is refused; `null` passes and is left to `[Required]`.
- `TaskTemplateService.CreateTaskTemplateAsync`: a duplicate `Order` within the same faculty
  returns `taskTemplate.orderTaken`; the same `Order` in a different faculty is allowed.
- `TaskTemplateService.UpdateTaskTemplateAsync` reorder behaviour: moving an order down and up
  within a faculty shifts exactly the affected neighbours by one and leaves the rest untouched;
  moving to a different (unassigned) faculty leaves a gap in the old faculty and shifts the new
  faculty's block; `UpdatedAt` is refreshed on the moved template and every shifted neighbour;
  unchanged `Order` and faculty performs no shift at all; the existing `TemplateInUse` check still
  wins over any reorder when the template is assigned to a group.

### SQL Server integration
- The unique index `IX_DiplomaTaskTemplates_FacultyId_Order` rejects a direct conflicting
  insert/update at the database (the InMemory provider used by the service tests does not
  enforce it, and the two-phase negate-then-assign reorder in `TaskTemplateService` exists
  specifically to avoid tripping it transiently).
- `Group.AcademicYear` is `nvarchar(20)`; confirm a value that is valid ASCII-only but longer
  than 20 characters after trimming is rejected by model validation before it ever reaches the
  database.


## Phase 4 — Thesis topics and reservation (Tasks 4-5: catalogue and reservation services)

### Service level, InMemory
- **`TopicService.GetTopicsAsync`:** student sees only `Available` catalogue topics of their
  own department plus the topic of their own active (`Pending` or `Approved`) reservation,
  even when that topic belongs to another department or its supervisor has gone inactive;
  a teacher's view is scoped to topics they supervise regardless of `DepartmentId`/`Status`
  filters; an admin's `Status` filter and `DepartmentId` filter combine correctly; the
  `Search` filter matches title and description case-sensitively vs. `Contains`.
- **`TopicService.GetTopicAsync`:** a student outside the topic's department or a teacher who
  does not supervise it gets `topic.notFound` (not `403`), matching the "hide, don't refuse"
  visibility rule; a student can fetch the topic of their own active reservation even when its
  status is no longer `Available`.
- **`TopicService.CreateTopicAsync`:** a teacher's `SupervisorId` in the body is ignored in
  favor of their own id; an admin must supply a valid `SupervisorId` or gets
  `topic.supervisorInvalid`; an invalid `DepartmentId` gets `topic.departmentInvalid`.
- **`TopicService.UpdateTopicAsync`:** an admin may edit a `Reserved`/`Approved` topic and
  changing its supervisor moves the holding student's `SupervisorId` in the same save; a
  teacher gets `topic.notEditable` for any topic that is not their own `Available` catalogue
  topic; `topic.notOwner` vs. `topic.notFound` precedence when a teacher targets someone
  else's topic.
- **`TopicService.DeleteTopicAsync`:** an admin is refused with `topic.notEditable` for a
  `Reserved`/`Approved` topic exactly like a teacher — deletion never bypasses the
  available-only rule even for admins.
- **`ReservationService.ReserveAsync`:** wrong department gives `topic.notInYourDepartment`;
  reserving the topic already held gives `topic.alreadyYours`; an inactive supervisor or a
  non-`Available` topic gives `topic.notAvailable`; the deadline blocks a first reservation but
  not a student who already holds an approved topic (change request path).
  `ReservationAlreadyActive` when a `Pending` request already exists.
- **`ReservationService.ProposeAsync`:** an inactive or non-teacher `SupervisorId` gives
  `proposal.teacherInvalid`; the created topic's `Origin` is `StudentProposal` and its
  `DepartmentId` is copied from the student's group, not from the request.
- **`ReservationService.ApproveAsync`** on a change request: releases the previously approved
  reservation (`Released`), returns a catalogue topic to `Available` or deletes a proposed one,
  and moves `TopicId`/`SupervisorId` to the new topic — all in one save; the decider must be
  the topic's supervisor or an admin (`reservation.notSupervisor` otherwise); only `Pending`
  is acceptable (`reservation.invalidState` otherwise).
- **`ReservationService.RejectAsync`/`CancelAsync`:** a proposed topic is deleted, a catalogue
  topic returns to `Available`; `CancelAsync` refuses a reservation that is not the caller's
  own (`reservation.notYours`) and one that is not `Pending`; the deadline exemption for a
  change-request cancellation mirrors `ReserveAsync`.
- **`ReservationService.ReleaseAsync`:** clears `StudentProfile.TopicId`/`SupervisorId`,
  requires `Approved`, requires the decider to be the topic's supervisor or an admin.
- **`ReservationService.SetStudentTopicAsync`:** replacing an existing `Approved` topic
  releases it and cancels any coexisting `Pending` request in the same save; assigning the
  topic the student already holds gives `topic.alreadyYours`; a non-`Available` or
  non-`Catalogue` topic gives `topic.notAvailable`; `topicId: null` clears both fields and
  returns `(null, null)`; an archived or unknown student gives `student.archived` /
  `student.notFound`.
- **`ReservationService.GetMineAsync`/`GetForDecisionAsync`:** `CurrentTopicId`/
  `CurrentTopicTitle` populate only on a `Pending` row whose student holds a different
  `Approved` topic (the change-request projection added while implementing Task 5 — the
  plan's `QueryRows` omitted it; verify it against `StudentProfile.TopicId`/`Topic.Title`
  directly since this diverges from the plan text); `CanCancel` reflects
  `IsSelectionOpenAsync` OR an existing approved reservation.

### HTTP level (would need `WebApplicationFactory`)
- Role gates: `POST /api/topics` and `PUT/DELETE /api/topics/{id}` as Student give 403;
  `GET /api/topics/supervisors` succeeds for any authenticated role.
- `PUT /api/students/{id}/topic` is Admin-only (403 for Teacher/Student) and returns `204`
  when clearing (`topicId: null`) vs. `200` with the reservation body when assigning.
- `POST /api/topics/{id}/reserve`, `/api/topics/proposals`, `/api/reservations/{id}/approve|
  reject|cancel|release` role gates (Student vs. Admin/Teacher) and 401 without a token.
- `GET /api/reservations/pending?status=Approved` returns the supervisor's approved-with-
  release-button list, matching the ruling that this endpoint doubles for both lists.

### SQL Server integration (InMemory cannot exercise these)
- The three `IX_TopicReservations_*` filtered unique indexes actually reject concurrent
  inserts: two simultaneous `Pending` requests for the same topic, two simultaneous `Pending`
  requests by the same student, and two simultaneous `Approved` reservations for the same
  student — each should surface as the mapped conflict error via
  `SqlUpdateExceptionHelper.IsUniqueConstraintViolation`, not an unhandled 500.
- `Topic.RowVersion` concurrency: a reserve/approve race on the same topic (two callers
  loading the same `Available` row, both racing to save) trips `DbUpdateConcurrencyException`
  and returns `topic.notAvailable`/`topic.notEditable` rather than double-booking the topic.

## Submission and review

### Service level, InMemory
- `StudentWorkflowService.GetMyStepsAsync`: steps exist on join (`LateJoinerTaskAssigner` at membership time, `GroupTaskService` at assignment time) — no row is created on read; only the current group's steps; order by template order then title; `CanSubmit`/`BlockReason` for pending, returned after approved predecessor, submitted, approved, blocked by predecessor.
- `BuildSteps` truth table, including a **missing** `StudentTask` row for an intermediate step (the only residual risk of creating rows on join rather than on read).
- `SubmitAsync`: other student's step; step of a former group; each block reason; message over 2000; file rule failures; version numbering; late flag at the deadline boundary.
- `SubmitAsync` failure paths with an injected throwing `IFileStorage`: a throw on the **second** `StoreAsync` deletes the first stored file; a concurrency or unique-index failure on save deletes every stored file and returns `step.awaitingReview`; any other save failure leaves the files on disk and logs the keys. Assert what survives on disk versus in the database.
- `ApproveAsync`/`ReturnAsync`: mark missing, below 0, above 100, fractional (`review.markOutOfRange`); comment missing/whitespace; non-reviewer teacher; supervisor who is not a group reviewer; admin; deciding an older version; deciding twice; status and mark propagation to the step.
- `OpenFileAsync`: student own, other student, reviewer, supervisor, unrelated teacher, missing stored file (a forbidden file is indistinguishable from a nonexistent one); content type for main vs supporting.
- `GetReviewQueueAsync`: scoping for reviewer, supervisor and admin; group and late filters; ordering.
- `GetGroupProgressAsync` / `GetStudentProgressAsync`: visibility, approved counts, late count (counts late submissions, not late steps), average mark rounding, next deadline including an overdue unapproved step.
- `AccessScope`: group visibility for reviewer, supervisor-only, unrelated teacher, student; archived students (`ArchivedAt != null`) excluded everywhere.
- `GroupTaskService` create/update by a teacher: a nonexistent id and a real id in a group the teacher does not review return identical status, code and message (`groupTask.groupNotFound` 400 on create, `groupTask.notFound` 404 on update); `AssignAllTaskTemplatesAsync` likewise returns `group.notFound` for both.
- `SubmissionFileRules`: signatures for docx/pptx/pdf, blocked extensions case-insensitive, size limits; name normalisation for `"x.exe "`, `"x.exe."`, `"x.EXE"`, a name of only dots/spaces; `SafeOriginalName` on a 300-character name with a surrogate pair on the 255 boundary keeps the head and the extension.
- `UtcDateTimeJsonConverter`: naive, `Z` and offset input all read as the same UTC instant; output always ends in `Z`; empty string and `null` for the nullable converter.
- `LocalFileStorage` and `StartupValidation.ValidateStorageSettings`: missing path, relative path under content root, unwritable path, key traversal refused, partial file deleted when the copy throws.

### SQL Server integration
- `StudentTasks.RowVersion`: concurrent submissions of one step and concurrent approve/return on one submission produce exactly one success.
- Unique `(StudentTaskId, Version)`.

### HTTP level
- Multipart binding of `mainFile`, `supportingFiles`, `message`; 90 MB request limit; `RequestFormLimits` (`ValueCountLimit`, `MemoryBufferThreshold`); download headers (`Content-Disposition`, `nosniff`); role restrictions on every route; `students/me/progress` vs `students/{id}/progress`.
- `StudentTaskOwnershipFilter` short-circuits before `[FromForm]` binding: a large body with a foreign or unknown `studentTaskId` is refused with the service's `{ code, message }` without being buffered.
- `IsLate` end to end: a deadline set from the admin UI in local time, a submission just before and just after local midnight — the flag must follow the UTC instant.

### Frontend
- `SubmitWorkForm.validate()` table-driven against `SubmissionFileRules` (extension lists, the 20 MB constant, max 3 supporting files, trailing dot/space trim, zero-byte main file) so the two languages cannot drift; include a zero-byte file with a disallowed extension to pin the check order.
- `DecisionPanel` mark validation (integer 0–100) and comment requirement on return; errors cleared on retry.
- `parseFileName` in `apiClient.ts`; object-URL revoke after download; download failure toast and disabled button.
- Request-sequencing guards in `ReviewQueuePage`, `StepDetails`, `GroupProgressPage` (a stale response never overwrites a newer one).
- `formatBytes` values and unit keys in both languages; `StepDetails.blockedMessage` prefers `steps.blocked.*` and falls back to the error catalogue.
- Timeline rendering of decided and undecided versions; progress matrix cell navigation; queue filters.

## Document templates

### Unit level (no database)
- `MarkerVocabulary`: 20 keys (`group.code`, not `group.name`); case-insensitive lookup; full name with and without patronymic; short name initials; `date.today`/`date.year` in Kyiv time around midnight UTC; unknown key resolves to empty; the value normaliser (CR/LF, `\v`, `\f`, U+2028/9 become line breaks; characters invalid in XML 1.0 removed; surrogate pairs kept whole).
- `DocxMarkerProcessor.TryReadMarkers`: body, table, header, footer, footnote, endnote, comment; split runs; spaces around the key; a key with inner spaces is unknown; non-Word input returns false; text-box paragraphs counted once.
- `DocxMarkerProcessor.Fill`: split-run replacement keeps the first run's formatting and empties the rest; several markers in one paragraph; adjacent markers; multi-line values produce `<w:br/>`; markers in headers and footers; unaffected paragraphs unchanged; author document properties cleared.
- Package safety: a `.docm`/`.dotx` renamed to `.docx` refused; VbaProject, EmbeddedPackage, EmbeddedObject, ActiveXControl, AlternativeFormatImport (altChunk), CustomUI and RibbonExtensibility parts refused; an external relationship refused, including one in `HyperlinkRelationships` or `DataPartReferenceRelationships` (e.g. `file://\host\share`), while `http`/`https`/`mailto` hyperlinks are accepted; `AttachedTemplate` refused; a field whose leading keyword is INCLUDE/INCLUDETEXT/INCLUDEPICTURE/INCLUDETIFF/LINK/DDE/DDEAUTO refused, including one whose instruction is split across several `<w:instrText>` runs, while an ordinary `HYPERLINK` field (and a table of contents) is accepted.
- Zip and XML limits: more than 1,000 entries, more than 100 MB uncompressed, more than 20 MB of `word/*.xml`, XML nested deeper than 128, and a DTD each refuse with `template.invalidFile`; an entry whose declared uncompressed size is smaller than its data cannot exceed the budget.
- Marker regex: a paragraph of `{{` followed by 200,000 spaces finishes within the match timeout (the old lazy pattern backtracked catastrophically); a paragraph longer than 100,000 characters is refused at upload.
- `FileNameSanitizer`: control characters, `\ / : * ? " < > |`, trailing dots and spaces, over-long names with a surrogate pair on the boundary — same results on Windows and Linux; shared with phase 5 submissions.

### Service level, InMemory
- `DocumentTemplateService` visibility for admin, owner teacher, all-teachers, named teacher, all-students, named group, other group.
- Audience rules: a teacher turning on all-students refused; a teacher adding a group they cannot see refused with the same code as a nonexistent group; a group they already had stays saveable; an admin's all-students survives a teacher's save; unknown group (admin) and inactive teacher refused; more than 500 ids refused.
- Management: non-owner teacher (`template.notOwner` when visible, `template.notFound` when not); replacing the file deletes the old stored file; deleting removes the stored file; a save failure that proves nothing committed deletes the newly stored file, any other failure leaves it and logs the key; a delete failing with `IOException` or `UnauthorizedAccessException` does not fail the request.
- Generation: student default topic order (approved, pending, none) — the pending case is a regression test, it once threw because `Select` preceded `Include`; student named topic visible vs not; staff for reviewable vs unrelated student; blank form; file name sanitisation; the unknown-marker list capped at 50 entries of 100 characters.

### SQL Server integration
- Cascade from groups to `DocumentTemplateGroups`; restrict from users to `DocumentTemplateTeachers`.
- Two concurrent file replacements: today the loser's file is orphaned silently (no concurrency token — parked for phase 8).

### HTTP level
- Multipart binding of `groupIds`/`teacherIds` lists; `errors` array on `template.unknownMarkers`; download headers (`Content-Disposition` with RFC 5987 for Cyrillic names, `nosniff`); the 12 MB request limit and `RequestFormLimits`; role restrictions on every route; `/api/templates/students` scoping.

### Frontend
- Editor: admin-only all-students checkbox; a teacher's save preserving the existing all-students value; groups the teacher can no longer see still shown and removable; unknown-marker list rendering; replace-file flow and the "details saved, file not replaced" message.
- Download dialog: student topic default; staff blank vs student; inline message when a list fails to load.
- Marker list copy to clipboard, including the fallback when `navigator.clipboard` is unavailable.
- `MultiSelect`: `aria-invalid`/`aria-describedby`, the no-options row, values not present in the options.
- `DocumentsPage` request sequencing.

## Phase 8

### Sessions and passwords
- `SessionStateValidator` returns false for: missing user, `IsActive = false`, `PasswordHash = null`, role differing from the token claim; true for a healthy account.
- A token issued before an archive stops working on the next request (integration, needs an HTTP host).
- `AuthService.LoginAsync` returns null and logs the right reason for unknown, inactive, unclaimed and wrong-password, and verifies a hash in every branch.
- `PasswordPolicy.IsSatisfiedByElevated` boundaries at 11/12/128/129.
- `AdminService` create and set-password refuse an 11-character password with `password.policyElevated`.
- `AuthService.ChangePasswordAsync` picks the elevated rule for an Admin and the standard rule for a Teacher and a Student.
- `AdminBootstrapper` throws when `Bootstrap:AdminPassword` is shorter than 12, and does not throw when an administrator already exists.

### Security logging
- Every method on `SecurityLog` writes at the documented level with the documented field names.
- No `SecurityLog` call site passes a password, hash, token or file content (review-level check, not a unit test).
- An access refusal logs exactly once and does not change the status, code or message returned.

### Uploads
- `OfficePackageInspector.Inspect` rejects: a non-ZIP, a ZIP without `[Content_Types].xml`, a ZIP with `[Content_Types].xml` but no `word/` part when Word is expected, a .jar, more than 1,000 entries, expansion past 100 MB, `word/*.xml` past 20 MB, XML nested past 128 levels. Accepts a real .docx and a real .pptx (with the right kind).
- A .jar renamed .docx is refused as `file.contentMismatch` on both the main and the supporting path.
- Supporting files: .png/.jpg/.jpeg/.pdf/.docx/.pptx accepted when genuine; .txt, .zip, .xlsx refused as `file.typeNotAllowed`; a .png whose bytes are not PNG refused as `file.contentMismatch`; a fourth file refused as `file.tooMany`.
- `ContentTypeFor` returns octet-stream for every supporting file including a genuine PNG.
- A request over the route's size limit answers 413 `request.tooLarge`, and a 1.5 MB CSV import still answers `import.tooLarge`.

### Identity and structure
- `StudentNumberCanonical`: "KB 123", "kb-123", "КВ123" (Cyrillic К and В) and "K B 1 2 3" all fold to "KB123"; "SEED-0001" folds to "SEED0001"; an empty or whitespace-only value folds to "".
- Creating a second student with a lookalike number answers `student.numberTaken`.
- Claiming with a spaced or Cyrillic spelling of the stored number succeeds.
- An import file with two rows whose numbers differ only by alphabet fails the second row and names the first row's number as entered.
- A faculty colliding on name with one row and on short name with another answers `faculty.nameTaken`; colliding on short name only answers `faculty.shortNameTaken`. Same for departments, scoped per faculty.

### Topic source of truth
- A student holding topic A with a pending request for topic B sees both in the catalogue and neither disappears.
- An administrator's topic list shows the holder for an approved topic and the requester for a pending one.
- A student never sees `studentProfileId`, `studentName` or `groupCode` on any topic.
- `GetTopicAsync` treats a student's held topic and their requested topic as their own, and refuses a catalogue topic from another department.
- The topic list issues two OUTER APPLYs, not five correlated subqueries (verify by reading the generated SQL with EF logging, not by asserting on it).

### Archive (writing)
- Archiving a student copies their files into their group's archive and leaves every live row in place; restoring them afterwards still shows their whole history.
- Archiving the same student twice adds no second copy (the (ArchivedGroupId, StorageKey) index).
- Deleting a group with one active student is refused with `group.hasStudents`.
- Deleting a group whose students are all archived: archive rows exist for every file before any delete runs; the group, its students' profiles and their user accounts are gone; a catalogue topic they held is `Available` again; a StudentProposal topic they held is deleted.
- A failure during the delete leaves the group, its students and the archive exactly as they were.
- `ArchivedGroup.Reviewers` holds every reviewer the group had, by id and name.

### Archive (reading) and templates
- A teacher sees only archives whose stored reviewers include them; an archive they may not see answers 404 `archive.notFound`, identical to a missing id.
- A student receives 403 from every `/api/archive/*` route.
- Purging deletes the rows; a blob still named by a live SubmissionFile or another archived group survives; an unreferenced blob is gone.
- A blob that cannot be deleted logs a warning and does not fail the purge.
- Replacing a template's file with a stale row version answers `template.conflict` and leaves exactly one file on disk.
- A successful replacement deletes the file it replaced.

### Reads
- `GetDeadlineAsync` issues one query when called repeatedly within a request, and a fresh instance reads the database again.
- `SetDeadlineAsync` followed by `GetDeadlineAsync` on the same instance returns the new value.
- Group, group-student and department list responses are byte-identical to the pre-change responses for the same data.

### Frontend shared infrastructure (Task 13)
- `Pagination` renders nothing when `total <= pageSize` (single page: no controls, no "Showing…"
  text); once `total` exceeds `pageSize` it shows the range and page count and disables
  First/Previous on page 1 and Next/Last on the last page.
- `ProportionBar` with every segment's `value` at 0 renders the empty-state bar (a plain neutral
  track) instead of dividing by a zero total; with a mix of zero and non-zero segments, only the
  non-zero ones get a visible slice but every segment still appears in the legend below it.
- A teacher's group list still contains only groups they review or supervise in.

### The three dashboards (Task 15)
- `GroupProgressCard`: a single group auto-selects; two or more groups start with nothing
  selected and show `dashboard.noGroupSelected`; picking a group loads and renders the matrix;
  a slow response for a previously selected group does not overwrite the currently selected
  group's result (the `isCurrent` guard).
- `sortGroupRows`/`nextGroupSort`: every `GroupSortKey` sorts ascending and descending correctly
  (including the two-part `code` sort by code then academic year); clicking the same header
  twice reverses direction, clicking a different header resets to ascending.
- `GroupTable` row click navigates to `/groups/{groupId}/progress` for both an Admin and a
  Teacher viewer, and the resulting page's "back to groups" link returns to `/admin/groups` or
  `/teacher/groups` respectively.
- `TeacherDashboardPage`: the "open review queue" button beneath `latestForReview` appears only
  when `waitingReviews > latestForReview.length`, not merely when the list is non-empty.
- `AdminDashboardPage`: the topic-selection deadline line renders `dashboard.noDeadline` when
  `deadline` is null and `dashboard.deadlineOn` plus the correct open/closed badge when it is
  set, for both `isOpen` values.
- `StudentDashboardPage`: `latestDecision === null` renders `dashboard.noDecisionYet`; an
  `Approved` decision shows the mark, a `Returned` one does not; the "open the step" button
  navigates to the right `studentTaskId`.

### Archive, queue paging and step reordering (Task 16)
- Review queue: page controls move through a 60-item queue, filters reset to page 1, and a
  stale response cannot overwrite a newer page.
- Reordering: dropping a row and pressing the arrows produce the same request; a failed
  request restores the previous order.
- Reordering is unavailable when the faculty filter is "all" and for teachers.
- Archive: a teacher sees only their groups; the purge button is absent for a teacher.
- The matrix legend names five states and a cell past its deadline with nothing submitted
  shows the overdue badge.
- A rejection without a comment still renders the block on My topic.
- The topic page stops offering Reserve when the deadline passes with the page open.
