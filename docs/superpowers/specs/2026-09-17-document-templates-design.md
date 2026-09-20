# Diploma Tracker — Document Templates and Generation Design

Date: 2026-09-17
Status: approved
Parent design: `2026-09-15-diploma-tracker-system-design.md` (§10, phase 6)
Builds on: user onboarding (patronymic), topics and reservation (phase 4), submission and
review (phase 5: teacher visibility, file storage)

## 1. Purpose

Diploma work comes with paperwork: topic applications, task sheets, statements. Staff
upload these forms once as Word templates containing markers such as
`{{student.fullName}}` and choose who can see each template. Anyone who can see a template
downloads it as a Word file, with every marker the system can resolve filled in: the
student's name, group, department, topic, supervisor and the date. A student generating a
topic application picks the topic, and the document arrives already completed.

## 2. Decisions

| Topic | Decision |
|---|---|
| Output | Word (`.docx`) only; users print or save as PDF themselves |
| Template kinds | Any: each template has its own name; no fixed document types |
| Authors | Administrators and teachers |
| Visibility | Chosen per template: selected groups (their students), selected teachers, all students, all teachers |
| Availability | No conditions: whoever can see a template can download it at any time |
| Filling | Fixed marker vocabulary; every resolvable marker is filled, the rest become empty |
| Who generates for a student | The student; supervisors and reviewers who can see the student; administrators |
| Generated files | Produced on request and not stored |

## 3. Templates

**`DocumentTemplate`**
| Field | Rules |
|---|---|
| `Id` | Guid |
| `Name` | required, at most 200 characters (e.g. "Заява на затвердження теми") |
| `Description` | optional, at most 1000 characters |
| `OwnerId` | the user who uploaded it |
| `StorageKey`, `OriginalFileName`, `SizeBytes` | the stored `.docx`, through the `IFileStorage` from phase 5 |
| `VisibleToAllStudents`, `VisibleToAllTeachers` | bool |
| `CreatedAt`, `UpdatedAt` | UTC |

**`DocumentTemplateGroup`** (`TemplateId`, `GroupId`) and **`DocumentTemplateTeacher`**
(`TemplateId`, `TeacherId`) hold the selected audience; both cascade with the template.

**Upload rules**
- `.docx` only, at most 10 MB, content must be a plain Word document (not a macro-enabled
  document or a Word template renamed to `.docx`). Before the document is opened its package
  is inspected: at most 1,000 parts and 100 MB uncompressed in total, at most 20 MB of Word
  XML, and XML nested at most 128 levels deep, so a small upload cannot expand into an
  unbounded amount of work.
- A template carries no active or external content, because every generated copy reaches
  students and staff under the university's name: no macros, embedded objects, ActiveX
  controls, imported HTML chunks or custom ribbons; no external relationships except web and
  mail hyperlinks; no attached template; no `INCLUDE…`, `LINK` or `DDE` fields. Such an upload
  is refused as an invalid file.
- Every marker in the document — body, tables, headers, footers, footnotes, endnotes and
  comments — must belong to the vocabulary in §4. Anything written between `{{` and `}}`
  counts as a marker, whatever its characters, so a template cannot carry literal
  double-brace text. An upload containing unknown markers is refused with the list of
  unknown markers (at most 50), so a typing mistake is found at once rather than when a
  student downloads the form.
- Generated documents do not carry the author's identifying document properties (author,
  last modified by, company, template path); the editor reminds authors to remove comments
  and tracked changes before uploading.
- Replacing the file of an existing template runs the same checks.

**Who sees a template**
- Administrators: all templates.
- Teachers: templates they own, templates visible to all teachers, and templates naming them.
- Students: templates visible to all students and templates naming their group.

**Who manages a template**
- Administrators manage any template and may choose any audience.
- Teachers manage only their own templates. The groups they add are limited to groups they
  can see (the phase 5 visibility rule), plus named teachers; a group they no longer see may
  stay in the audience or be removed, but not added again. They cannot turn on *all
  students*, but an administrator's *all students* choice survives their edits. *All
  teachers* is allowed.

## 4. Marker vocabulary

A marker is `{{key}}`; spaces around the key are ignored (`{{ student.lastName }}`) and keys
are case-insensitive. Values are written as plain text: line breaks become Word line breaks
and characters Word cannot store are dropped.

| Key | Value |
|---|---|
| `student.lastName`, `student.firstName`, `student.patronymic` | Parts of the student's name |
| `student.fullName` | `Прізвище Ім'я По батькові` (patronymic omitted when empty) |
| `student.shortName` | `Прізвище І. П.` |
| `student.email`, `student.number` | Email and student ID number |
| `group.code`, `group.academicYear` | The student's group (its code is the group's only name) |
| `department.name`, `department.shortName` | The group's department |
| `faculty.name`, `faculty.shortName` | The department's faculty |
| `topic.title`, `topic.description` | The topic chosen for generation (§5) |
| `supervisor.fullName`, `supervisor.shortName`, `supervisor.email` | The topic's supervisor |
| `date.today` | Current date in Kyiv time, `dd.MM.yyyy` |
| `date.year` | Current year |

Values are inserted exactly as stored; names are not declined into grammatical cases, so
templates place them where the nominative form reads correctly. A marker whose value is
unknown — no student chosen, no topic, no patronymic — becomes empty text.

The authoring page shows this vocabulary with a copy button for each marker, in both
interface languages.

## 5. Generation

**Request** — `POST /api/templates/{id}/generate` with body `{ studentId?, topicId? }`; the
response is the `.docx` stream named `<template name> — <student last name>.docx`, or
`<template name>.docx` when no student applies.

**Whose data**
- Student: always their own; `studentId` is ignored.
- Teacher or administrator: the student named by `studentId`, who must be visible to them
  (teacher: phase 5 visibility; administrator: any). Without `studentId` the document
  contains only the date markers, giving a blank form.

**Which topic**
- A student may name any topic visible to them in the catalogue (phase 4) or their own; the
  supervisor markers come from that topic. Without `topicId`, the student's approved topic is
  used, otherwise their pending reservation's topic, otherwise none.
- Staff generating for a student always use that student's approved or pending topic;
  `topicId` is ignored.

**Filling** — the generator uses the Open XML SDK. Word often splits one visible marker
across several text runs; before replacing, the text of each paragraph's runs is joined so
a marker is found regardless of splitting, and the replacement keeps the formatting of the
run where the marker starts. Paragraphs without markers are left untouched.

**Errors** — `template.notFound` (404; also for templates the user cannot see),
`template.notOwner` (403), `template.invalidFile` (400), `template.unknownMarkers` (400, the
unknown markers listed in the standard `errors` field), `template.tooLarge` (400), `template.audienceNotAllowed` (403),
`student.notFound` (404; also for students the user cannot see), `student.profileNotFound`
(404; a student account without a student profile), `topic.notFound` (404).

## 6. API

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/templates` | any role | Templates visible to the user |
| GET | `/api/templates/{id}` | any role (visible) | Detail with audience (audience shown to owner and administrators only) |
| POST | `/api/templates` | Teacher, Admin | Multipart: `file`, `name`, `description`, audience fields |
| PUT | `/api/templates/{id}` | owner, Admin | Name, description, audience |
| PUT | `/api/templates/{id}/file` | owner, Admin | Replace the Word file |
| DELETE | `/api/templates/{id}` | owner, Admin | Delete template and stored file |
| GET | `/api/templates/{id}/source` | owner, Admin | Download the original file with markers |
| POST | `/api/templates/{id}/generate` | any role (visible) | Generate (§5) |
| GET | `/api/templates/markers` | Teacher, Admin | Vocabulary (keys and markers; descriptions live in the interface translations) |
| GET | `/api/templates/students` | Teacher, Admin | Students the caller may generate for (non-archived, active), with group code and academic year |

## 7. Interface

- **Documents** tab (every role) — list of visible templates with name and description.
  - Student: *Download* opens a small dialog with a topic selector pre-set to their own topic,
    then downloads the filled document.
  - Teacher and administrator: *Download* offers *Blank* or *For a student* (student
    selector limited to visible students).
- **Template editor** (Teacher, Admin) — name, description, file upload, audience (groups
  multi-select, teachers multi-select, *All students* for administrators, *All teachers*),
  the marker vocabulary with copy buttons, and on refusal the list of unknown markers.
- **Student step page** (phase 5) and **dashboard** show no template links; documents live in
  one place.

## 8. Delivery and verification

One increment: model and audience rules, upload validation with marker scanning, the
generator, endpoints, then pages. Automated checks: backend build,
`has-pending-model-changes`, a scripted check that uploads a sample template containing
split-run markers in body, table and header, refuses an unknown marker, generates for a
student with a pending topic and for a chosen catalogue topic, and confirms visibility and
audience refusals; the script reads the generated package with a minimal zip reader and
asserts the filled text of the document, header and footer parts. Frontend `tsc`, lint and build. The owner opens generated documents in
Word at the end. Unit tests go to `docs/superpowers/test-backlog.md`.

## 9. Not included

- PDF output.
- Declension of names into grammatical cases.
- Conditional sections, repeated rows or images driven by data.
- Storing generated documents or tracking who downloaded them.
- Templates in formats other than `.docx`.
- Filling fields typed by the user at generation time.
