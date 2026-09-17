# Diploma Tracker — User Onboarding Design

Date: 2026-09-16
Status: approved, pending implementation plan
Parent design: `2026-09-15-diploma-tracker-system-design.md` (§4 places this increment
between phase 2 and phase 3)

## 1. Purpose

A department's students reach the system through the list the department already
maintains. An administrator uploads each group's list; every student on it receives an
account that nobody can use until the student claims it. Claiming requires the student's
email and student ID number, and is possible only while the administrator has registration
open. Signed-in users manage their own password, and administrators restore access for
anyone who loses theirs. No email delivery is involved at any point.

Teachers are few; administrators create their accounts individually with a password, as
for any other administrative record.

## 2. Decisions

| Topic | Decision |
|---|---|
| How students obtain access | Administrator imports the list; students claim their own accounts |
| Proof of identity when claiming | Email plus student ID number, both from the imported list |
| Registration switch | One global setting, closed by default |
| Import format | CSV only, UTF-8 |
| Group of imported students | Chosen by the administrator at upload; the file carries no group |
| Invalid rows | The whole file is rejected with every problem listed; nothing is written |
| Students already present | Skipped and reported when email and ID number both match |
| Teacher accounts | Created by administrators with a password; not imported, not claimable |
| Password capabilities | Change own password; administrator resets a student to unclaimed; administrator sets a teacher's password |
| Scope of an access reset | Only the reset student; that one account can be claimed even while registration is closed |
| Rate limiting | Built and configured, switched off until the owner enables it |
| Account events | Claims, access resets and password changes are written to the application log |
| Name editing by users | Not included |

## 3. Data model

**`AppUser`** — `Patronymic` (по батькові) is optional, at most 100 characters; documents
generated in phase 6 use it. `PasswordHash` is optional. An account without a password hash is
*unclaimed*: it exists, appears in lists and groups, and cannot sign in. `ClaimReopened` (bool,
default `false`) is set by an administrator's access reset and cleared when the account is
claimed; it lets that one account be claimed while registration is closed.

**`StudentProfile`**
- `StudentNumber` — required, at most 32 characters, unique. Stored trimmed and
  upper-cased with the invariant culture, so `кв123` and `КВ123` are the same number.
- `GroupId` — required.
- `SupervisorId` and `DiplomaTopic` — optional. A student gains a supervisor and a topic
  through topic reservation (phase 4); an imported student has neither.

**`PlatformSettings`** — a single row (`Id = 1`) holding `RegistrationOpen` (bool),
seeded as `false` through model data.

The development seeder gives its demo student a student number and a password, so the
demo account stays usable for sign-in.

Existing constraints are unchanged: user email unique, one profile per user, foreign keys
as configured in phase 2. The schema is expressed in the single `InitialCreate` migration,
regenerated for this increment; nothing has been deployed.

## 4. Passwords and sign-in

**Password rule** — one shared policy: at least 8 and at most 128 characters. It applies to
claiming, changing a password, and passwords set by an administrator (student creation
with a password, teacher creation, teacher password set). The bootstrap administrator keeps
its own stricter minimum of 12.

**Sign-in** — an unclaimed account is treated exactly like a wrong password: the same
401 and message, so sign-in does not reveal which accounts exist or are claimed.

**Rate limiting** — ASP.NET Core's built-in rate limiter guards `POST /api/auth/login` and
`POST /api/auth/claim` with a fixed window of 10 requests per minute per client IP address.
Excess requests receive **429**. Student ID numbers are short, so without a limit the claim
endpoint could be used to guess them. The limiter is registered and attached to both endpoints,
but the middleware runs only when the configuration value `RateLimiting:Enabled` is `true`; it is
`false` until the owner decides to enable it.

**Account event log** — the application log (`ILogger`) records, at Information level: a
successful claim (user id, and whether the account had been reopened by a reset), an access
reset (student user id, acting administrator id), a teacher password set by an administrator
(teacher user id, acting administrator id), and a password change by its owner (user id). A
refused claim is logged at Warning with the reason (registration closed, details mismatch) and
the normalised email. Passwords, password hashes and student numbers are never logged.

**Sessions** — a password change or reset does not revoke tokens already issued; they
remain valid until they expire (at most 60 minutes). Token revocation would require token
versioning and is not justified at this scale.

## 5. Registration and claiming

| Method | Route | Access | Behaviour |
|---|---|---|---|
| GET | `/api/registration` | anonymous | `{ open }` |
| PUT | `/api/registration` | Admin | body `{ open }` → 204 |
| POST | `/api/auth/claim` | anonymous, rate-limited | body `{ email, studentNumber, password }` |

**Claim outcomes**
- Password violates the policy, or a field is missing → **400** with the validation message.
- Registration open, and no active, unclaimed student matches both the normalised email and the
  normalised student number → **400** `These details don't match an account waiting to be
  claimed.` One message covers an unknown email, a wrong number, an already claimed account and
  a deactivated account, so the endpoint does not disclose which of these applies.
- Registration closed, and no active, unclaimed student with `ClaimReopened` matches both values
  → **403** `Registration is closed.` The same response covers every non-matching case, so a
  closed registration discloses nothing about which accounts exist or were reset.
- Success (a match while open, or a reopened match while closed) → the password is set,
  `ClaimReopened` is cleared, and the response is the same `LoginResponse` that sign-in returns,
  so the student is signed in immediately. The write is conditional on the account still being
  active and unclaimed (and still reopened when registration is closed); a concurrent claim that
  loses gets the outcome above for its registration state.

## 6. Student list import

**Endpoint** — `POST /api/groups/{groupId}/students/import`, Admin only, multipart form
with one file field `file`. An unknown group → **404**.

**File rules**
- Extension `.csv`, at most 1 MB, at most 500 data rows.
- Encoding UTF-8, with or without a byte-order mark. Bytes that are not valid UTF-8 → the
  file is rejected with `Save the file as "CSV UTF-8" and upload it again.`
- The first line is a header naming the columns `lastName`, `firstName`, `email`,
  `studentNumber`, in any order and matched case-insensitively. An optional `patronymic`
  column is read when present. Other columns are ignored.
- The separator is `;` or `,`, detected from the header line (Ukrainian-locale Excel writes
  `;`).
- Values may be enclosed in double quotes; a doubled quote inside a quoted value is a
  literal quote. Blank lines are ignored.
- Parsing is done by a small dedicated parser in the service layer; no CSV library.
- A file that breaks these rules — wrong extension, too large, too many rows, not UTF-8,
  or a header missing any of the four required columns — is rejected with **400** and a
  single error before any row is examined.

**Row validation** — every row is checked before anything is written:
- all four values present after trimming;
- email is a syntactically valid address; lengths: names and patronymic 100, email 256, student number 32;
- no email and no student number appears twice in the file;
- an email that belongs to a teacher or an administrator is an error;
- an email that belongs to an existing student whose student number differs, or a student
  number that belongs to an existing student whose email differs, is an error — this is
  most likely a typing mistake, and skipping it would hide it;
- a row whose email and student number both match the same existing student is not an
  error; it is *skipped*.

Emails are normalised to lower case and student numbers as in §3 before any comparison.

**Outcomes**
- One or more row errors → **400** with `{ errors: [{ line, message }] }`, listing every
  problem; line numbers count the header as line 1. Nothing is written.
- No errors → all new students are inserted in a single `SaveChanges` and the response is
  **200** with `{ created, skipped: [{ line, email }] }`.
- A unique-index conflict at save time (another administrator added a clashing student
  during the upload) → **409** `The student list changed during import; upload the file
  again.` Nothing is written.

**Imported students** are active, unclaimed, members of the chosen group, and have no
supervisor or topic.

## 7. Account management

| Method | Route | Access | Behaviour |
|---|---|---|---|
| PUT | `/api/auth/password` | any signed-in user | body `{ currentPassword, newPassword }` → 204; wrong current password → 400; policy violation → 400 |
| POST | `/api/students/{id}/reset-access` | Admin | clears the password hash and sets `ClaimReopened`; this student alone can claim again, whether or not registration is open → 204; unknown student → 404 |
| PUT | `/api/teachers/{id}/password` | Admin | body `{ password }` → 204; unknown teacher → 404; policy violation → 400 |

**Administrator-created students** — creating a student individually requires first name,
last name, email, student number and group. Patronymic, password, supervisor and topic are
optional. Teacher creation and editing likewise accept an optional patronymic.
A student created without a password claims the account like an imported one. Updating a
student can change the student number, subject to uniqueness (**409** on conflict).

**Student responses** carry `studentNumber`, `isClaimed` and `claimReopened`; `supervisorId`,
`supervisorName` and `diplomaTopic` are nullable. **Group student responses**
(`GET /api/groups/{id}/students`) also carry `studentNumber` and `isClaimed`.

Error strings for this increment live in one shared class, following the
`(T? result, string? error)` service pattern established in phase 2.

## 8. Administration and user interface

**Sign-in page** — always shows a *Claim your account* link.

**Claim page** (`/claim`, anonymous) — email, student ID number, password, and password
confirmation (checked in the browser). On success the student is signed in and taken to
their dashboard. The form is always available; while registration is closed a notice above it
says that only students whose access an administrator has reset can claim their account now.

**Account page** (`/account`, every role, linked from the navigation) — change password:
current password, new password, confirmation.

**Students page** (Admin)
- A registration switch showing *Open* or *Closed*.
- An import panel: group selector, file input, and a *Download template* button that
  produces a CSV containing only the header line. After an upload it shows either the
  summary (number created, list of skipped rows) or the list of row errors.
- A student number column and form field; a *Claimed* / *Not claimed* badge.
- A *Reset access* action with a confirmation step that states only this student will be able
  to claim the account again; a reset, unclaimed student shows a *Reopened* badge.
- Supervisor and topic are optional in the create and edit forms.

**Teachers page** (Admin) — a *Set password* action opening a modal with the new password.

**Group details page** (Admin) — the students table shows the student number and the same
*Claimed* / *Not claimed* badge as the Students page.

## 9. Delivery and verification

One increment on its own branch: backend first, then frontend, then one review over the
whole increment and one batch of fixes. Verification during implementation is automated
and cheap: backend build, `has-pending-model-changes`, a scripted endpoint check against a
local database, frontend `tsc`, lint and production build.

Unit tests are not written in this increment; the coverage it needs is recorded in
`docs/superpowers/test-backlog.md` for the end-of-project testing pass. Browser
walkthroughs wait until richer workflows exist.

## 10. Not included

- Email delivery of any kind: invitations, verification, password-reset links.
- Users editing their own name or email.
- Importing teachers, or teachers claiming accounts.
- Import formats other than CSV; a group column in the file.
- Updating existing students from an import.
- Revoking issued tokens on password change or reset.
- Per-group or scheduled registration windows.
- Logging of rate-limit rejections (the limiter is switched off).
