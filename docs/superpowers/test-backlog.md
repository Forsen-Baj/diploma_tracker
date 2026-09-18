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

