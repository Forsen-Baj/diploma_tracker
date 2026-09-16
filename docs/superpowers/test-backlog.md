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

