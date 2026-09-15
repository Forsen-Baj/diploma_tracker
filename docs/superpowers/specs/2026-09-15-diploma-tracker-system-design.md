# Diploma Tracker — System Design

Date: 2026-09-15
Status: approved, pending implementation plan

## 1. Purpose

Diploma Tracker is a web application for managing diploma work within a university
department. It covers the full arc of a student's thesis: choosing a topic from a
supervised catalogue, producing the formal application document, and then working through
a defined sequence of steps where each submission is reviewed and must be approved before
the next step begins.

The system serves three roles. **Students** browse and reserve topics, generate their
application, submit work against each step, and track their own progress. **Teachers**
publish topics they are willing to supervise and review submissions for the groups they
are assigned to. **Administrators** maintain the academic structure, user accounts,
document templates, and the catalogue of workflow steps.

## 2. Constraints

These govern every design decision in this document.

| Constraint | Value |
|---|---|
| Deployment target | Hosted for one department for one academic term. Must also run in full locally for development and end-to-end testing. |
| Timeline | Approximately 1–2 months to delivery. |
| Scope handling | Phases are ranked. Work is cut from the bottom of the ranking when time requires it. |
| Academic hierarchy | Faculty → Department → Group. Specialty, degree level, and the institute/faculty distinction are deliberately not modelled. |
| Supervisor scoping | Department is a property of a topic, not of a teacher. |

## 3. Architecture

The system is a single-page application over a REST API, with a clear boundary between
the two.

**Backend** — ASP.NET Core 8 Web API, layered as controllers → services → Entity
Framework Core → SQL Server. Controllers are thin: they read the authenticated identity,
delegate to a service, and translate the outcome into an HTTP status code. Services own
all business rules and every authorization decision that depends on data. Each service
sits behind an interface and is registered through dependency injection, so services can
be tested directly without an HTTP host.

**Frontend** — React 18 with TypeScript, built by Vite. Organised as a typed API layer,
an authentication context holding session state, route guards, and feature pages. Page
components call named API functions rather than constructing requests inline.

**Identity** — Password authentication with PBKDF2 over SHA-256, a per-user random salt,
and fixed-time hash comparison. Sessions are JWT bearer tokens carrying the user's
identity and role, validated for issuer, audience, signing key, and lifetime with no clock
skew allowance.

**Data access** — Entity Framework Core with `Guid` primary keys throughout. Entities are
never returned from a controller; every response is an explicit DTO, mapped in the service
layer. Read-only queries are untracked.

**Authorization** — Role attributes on controllers establish the coarse boundary. Any rule
that depends on data — whether a teacher reviews a particular group, whether a task
belongs to the requesting student — is enforced in the service layer against the database.
The client's role-based navigation is a convenience, never a security boundary.

## 4. Delivery phases

Ranked by priority. Work is cut from the bottom upward; the dependency column shows what a
given cut takes with it. Phase 7 depends on both 5 and 6, so cutting either also cuts it.

| Rank | Phase | Depends on |
|---|---|---|
| 1 | Platform foundations | — |
| 2 | Academic structure | 1 |
| 3 | Design system | — |
| 4 | Thesis topics and reservation | 2 |
| 5 | Submission and review | 1 |
| 6 | Document templates and generation | 2, 4 |
| 7 | Document preview and commenting | 5, 6 |

User onboarding — student list import, the registration toggle, and profile and password
management — is specified as its own small increment immediately after phase 2, since
import requires groups and departments to exist first.

The design system is ranked third deliberately. Phases 4 through 6 introduce roughly ten
new pages; settling the visual language before they are built means building them once.

**Phases 1 and 2 are specified in detail below.** Later phases are described at
requirements level and receive their own design documents when reached.

## 5. Phase 1 — Platform foundations

### Configuration

No secret is ever stored in a committed file. `appsettings.json` holds structure and
non-sensitive defaults only.

- **Local development** — .NET user-secrets, set per developer and held outside the
  repository.
- **Hosted** — environment variables: `ConnectionStrings__DefaultConnection`,
  `Jwt__Secret`, `Bootstrap__AdminEmail`, `Bootstrap__AdminPassword`, and the permitted
  CORS origins as an indexed array (`Cors__AllowedOrigins__0`, `Cors__AllowedOrigins__1`,
  …), which is how .NET binds collections from the environment.

Both sources are read by the standard configuration provider, so the application code is
identical in either environment.

Startup validates its own configuration before serving traffic and fails with an explicit
message when the JWT signing secret is absent or shorter than 32 bytes. A missing secret
must never degrade silently into a weak signing key.

The permitted CORS origins come from configuration, defaulting to the Vite development
server locally. Swagger UI is exposed in development only.

### Persistence

The schema is created by Entity Framework Core migrations, applied automatically at
startup. This suits a single-instance deployment; horizontal scaling would require moving
migration to a deliberate deployment step.

### Environment bootstrap

The two environments are populated differently, and neither leaks into the other.

In **development**, a seeder creates a representative dataset — an administrator, a
teacher, a student, a faculty, a department, a group, and the default workflow step
templates — so a developer has a working system immediately after checkout.

In a **hosted environment**, no seed data is created. Instead, a one-time administrator
bootstrap runs: when the system contains no administrator, one is created from
`Bootstrap:AdminEmail` and `Bootstrap:AdminPassword`. Once an administrator exists the
bootstrap does nothing, and the configured password is ignored. Accounts with predictable
credentials therefore cannot exist on a server.

### Frontend configuration

The API base URL is read from `import.meta.env.VITE_API_BASE_URL`, with a development
default pointing at the local API. No environment-specific value is compiled into source.

### Test baseline

Services are tested directly, instantiated against an EF Core InMemory context, with no
HTTP host involved. The authentication and password-hashing services are covered first,
since a defect there affects every protected route: valid credentials, wrong password,
unknown account, deactivated account, and malformed stored hashes.

## 6. Phase 2 — Academic structure

### Data model

```
Faculty
    Id          Guid, PK
    Name        string, required, unique
    ShortName   string, required, unique
    CreatedAt   DateTime
    UpdatedAt   DateTime

Department
    Id          Guid, PK
    FacultyId   Guid, FK -> Faculty, required
    Name        string, required
    ShortName   string, required
    CreatedAt   DateTime
    UpdatedAt   DateTime
    unique (FacultyId, Name)
    unique (FacultyId, ShortName)

Group
    Id            Guid, PK
    DepartmentId  Guid, FK -> Department, required
    Name          string, required
    Description   string, optional
    AcademicYear  string, required
    CreatedAt     DateTime
    UpdatedAt     DateTime
```

Both foreign keys restrict deletion: a faculty holding departments cannot be deleted, and
a department holding groups cannot be deleted. Records are removed only when nothing
depends on them, which is the same rule the system applies to deleting a group that still
has students.

Neither entity carries an active/inactive flag. The delete guard already prevents removing
a record that is in use, and a second mechanism for hiding records would be redundant.

### Workflow step status

A student's progress on a step is an enumeration — `Pending`, `Submitted`, `Approved`,
`Returned` — persisted as its string name so stored data stays readable and new values
cost nothing to add. Steps begin at `Pending`; the transitions between the remaining
states are defined in phase 5.

### API

```
GET    /api/faculties                   any authenticated
GET    /api/faculties/{id}              any authenticated
POST   /api/faculties                   Admin
PUT    /api/faculties/{id}              Admin
DELETE /api/faculties/{id}              Admin — 409 when departments exist
GET    /api/faculties/{id}/departments  any authenticated

GET    /api/departments?facultyId=      any authenticated
GET    /api/departments/{id}            any authenticated
POST   /api/departments                 Admin
PUT    /api/departments/{id}            Admin
DELETE /api/departments/{id}            Admin — 409 when groups exist
```

Reads are available to any authenticated user, because students need faculty and
department names to filter the topic catalogue in phase 4. Writes are restricted to
administrators.

Groups carry a required department. Group responses include the department and faculty
names so that lists render without additional lookups.

### Administration UI

A single page presents both levels: faculties listed on the left, the departments of the
selected faculty on the right, with inline create and edit forms and a confirmation
dialog before deletion. Attempting to delete a record that is still in use surfaces the
conflict as an explicit message rather than a silent failure.

Faculties and departments are always managed together, so a separate departments page
would duplicate navigation without adding anything. Group management gains a department
selector.

### Testing

Beyond the authentication coverage established in phase 1, this phase covers the faculty
and department services — creation, update, deletion, rejection of duplicate names within
a faculty, and refusal to delete a record that still has dependents — and the group
service, including the rule that a teacher sees only the groups they review.

One property of the test environment shapes how these are written: EF Core InMemory
enforces neither unique indexes nor foreign-key constraints. Uniqueness and delete-guard
assertions must therefore exercise the service's own checks. A test that depends on the
provider raising a constraint violation would pass while leaving the real rule unverified.

### Not included in this phase

Named explicitly so they are not absorbed by accident: the submission and review
workflow beyond declaring the status enumeration; student list import, the registration
toggle, and profile management, which form the increment immediately following; and the
visual redesign, which is phase 3.

## 7. Phase 3 — Design system

A visual language derived from the KPI schedule application: a white ground, soft
lavender-grey rounded cards, a single blue accent, horizontal tab navigation, and generous
whitespace. Delivered as design tokens plus a small set of shared components — page shell,
card, table, form controls, buttons, and modal — and applied across the application.

## 8. Phase 4 — Thesis topics and reservation

A topic carries a title, description, supervising teacher, owning department, and a status
of `Available`, `Reserved`, or `Approved`. Administrators and teachers manage the
catalogue. Students see the topics offered by their own department and faculty, search and
filter the list, open a topic for detail, and reserve one, which moves it out of
circulation for everyone else. A student may cancel their own reservation; the conditions
under which cancellation is permitted are settled when this phase is designed.

## 9. Phase 5 — Submission and review

Students submit work against a step, attaching a file. Reviewers assigned to the student's
group either approve the submission or return it with comments, and a returned step can be
resubmitted. This drives the status enumeration through its full range and produces the
per-student and per-group progress statistics shown on the dashboards.

Every transition is authorized in the service layer: a student may submit only against
their own steps, and a reviewer may act only on groups they are assigned to review.

## 10. Phase 6 — Document templates and generation

An administrator uploads a `.docx` template and links it to a faculty or department.
A student with a reserved topic generates their application from it, with the student's
full name, group, topic title, supervisor name, faculty, and department merged into the
template's placeholder fields, and downloads the result.

Generation uses the Open XML SDK. PDF output requires a headless converter running
alongside the application and is treated as optional within this phase rather than assumed.

## 11. Phase 7 — Document preview and commenting

Reviewers preview a submitted `.docx` in the browser without downloading it, and ideally
annotate it with comments the student can read when the work is returned. The commenting
half requires a feasibility investigation against available open-source tooling before it
is committed to.

## 12. Risks

**Scope against timeline.** Seven phases plus a hosted deployment inside 1–2 months is
ambitious. The ranking exists so that the decision of what to drop is made deliberately
rather than discovered late. The most likely casualties are phase 7, then phase 6.

**The review workflow is ranked fifth.** Submission and review is the heart of the
product, yet it sits below the topic catalogue because the student's own journey begins
with choosing a topic. It is also among the least expensive phases to build. If the
schedule slips, promoting it above phase 4 is the first adjustment to consider.

**PDF generation carries a deployment dependency.** Converting `.docx` to PDF on a server
has no satisfactory pure-.NET open-source answer; the practical route is a headless
converter running alongside the application. This is why PDF output is optional within
phase 6 rather than assumed.

**Onboarding gates real use.** The hosted deployment cannot accept real students until
list import exists, which is why that increment directly follows the academic structure
rather than waiting for a quiet moment.
