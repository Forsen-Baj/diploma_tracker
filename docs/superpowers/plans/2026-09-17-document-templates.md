# Document Templates and Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Administrators and teachers upload Word templates containing `{{markers}}`, choose which students and teachers see each template, and anyone who can see a template downloads it with the markers filled from the student's data, topic, supervisor and date.

**Architecture:** `DocumentTemplate` with group and teacher audience tables; files through the phase 5 `IFileStorage`. A `MarkerVocabulary` defines the keys; `DocxMarkerProcessor` (Open XML SDK) scans uploads for unknown markers and fills markers in body, tables, headers and footers, merging split runs and keeping the formatting of the run where each marker starts. `DocumentTemplateService` applies visibility, audience rules and generation; `IAccessScope` decides which students staff may generate for.

**Tech Stack:** .NET 8, EF Core 8.0.8, `DocumentFormat.OpenXml` 3.x (new dependency), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-17-document-templates-design.md`

**Prerequisites:** onboarding, design system, topics, and submission-and-review plans implemented and committed.

## Global Constraints

- Output is `.docx` only; no PDF.
- Template upload: `.docx` only, at most **10 MB**, must open as a Word document with a main part; every marker in body, tables, headers and footers must be in the vocabulary, otherwise **400** `template.unknownMarkers` listing the unknown markers. Replacing a file runs the same checks.
- Marker syntax `{{key}}`; spaces inside braces ignored; keys case-insensitive.
- Vocabulary (exactly 20 keys): `student.lastName`, `student.firstName`, `student.patronymic`, `student.fullName`, `student.shortName`, `student.email`, `student.number`, `group.name`, `group.academicYear`, `department.name`, `department.shortName`, `faculty.name`, `faculty.shortName`, `topic.title`, `topic.description`, `supervisor.fullName`, `supervisor.shortName`, `supervisor.email`, `date.today` (Kyiv time, `dd.MM.yyyy`), `date.year`.
- `fullName` = `Прізвище Ім'я По батькові` (patronymic omitted when empty); `shortName` = `Прізвище І. П.`. Unknown values become empty text. Names are not declined.
- Visibility: administrators all; teachers own, *all teachers*, or named; students *all students* or their group named.
- Management: administrators any template and audience; teachers only their own, audience limited to groups they can see and named teachers, never *all students*.
- Generation: students always for themselves (topic: named visible topic, else approved, else pending, else none); staff for a visible student (approved, else pending topic) or blank (date markers only). Generated files are not stored.
- File name: `<template name> — <student last name>.docx`, or `<template name>.docx` when no student applies.
- Error bodies follow the phase 3 contract; new codes in `TemplateErrors.All` and both translation files.
- **No unit tests.** Existing test projects must still compile.
- **Commits: exactly one**, in the final task: `Implement document templates`.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, or `App_Data/`.
- The local database is recreated (regenerated `InitialCreate`).

## Rulings recorded while planning

- **Eligible students endpoint.** Staff need a list of students they may generate for; `GET /api/templates/students` returns `IAccessScope.ReviewableStudents` as `{ id, name, groupName }`. Cost if wrong: one extra endpoint.
- **Teacher audience list** uses `GET /api/topics/supervisors` (active teachers), already readable by every role.
- **Line breaks in values** (topic description) are inserted as Word line breaks within the run.
- **Paragraph scope:** markers are matched within one paragraph; a marker split across paragraphs is not a marker. Text inside a text box belongs to its own paragraph.
- **Verification without the SDK in the script:** the check script builds `.docx` packages with a minimal zip writer and reads generated files with a minimal zip reader, asserting on the text of `word/document.xml` and the header part.
- **Page markup is specified, not transcribed**, as in the design system plan.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj` | `DocumentFormat.OpenXml` reference |
| `backend/DiplomaTracker.Api/Entities/DocumentTemplate.cs`, `DocumentTemplateGroup.cs`, `DocumentTemplateTeacher.cs` | Domain |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Services/TemplateErrors.cs` | Codes |
| `backend/DiplomaTracker.Api/Services/Documents/MarkerVocabulary.cs` | Keys, descriptions, value resolution |
| `backend/DiplomaTracker.Api/Services/Documents/DocxMarkerProcessor.cs` | Scan and fill |
| `backend/DiplomaTracker.Api/Services/Documents/DocumentContext.cs` | Data for filling |
| `backend/DiplomaTracker.Api/DTOs/Templates/*` | Contracts |
| `backend/DiplomaTracker.Api/Interfaces/IDocumentTemplateService.cs`, `Services/DocumentTemplateService.cs` | Rules |
| `backend/DiplomaTracker.Api/Controllers/TemplatesController.cs` | HTTP |
| `frontend/diploma-tracker-web/src/api/templatesApi.ts`, `types.ts` | Client |
| `frontend/diploma-tracker-web/src/components/ui/MultiSelect.tsx` | Multi-choice control |
| `frontend/diploma-tracker-web/src/components/documents/*` | Editor, download dialog, marker list |
| `frontend/diploma-tracker-web/src/pages/DocumentsPage.tsx` | Documents tab |
| `.superpowers/checks/templates-check.mjs` (git-ignored) | Endpoint verification |

---

### Task 1: Template domain model, dependency and schema

**Files:**
- Modify: `backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj` (via `dotnet add package`)
- Create: `backend/DiplomaTracker.Api/Entities/DocumentTemplate.cs`, `DocumentTemplateGroup.cs`, `DocumentTemplateTeacher.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Replace: `backend/DiplomaTracker.Api/Migrations/*`

**Interfaces:**
- Produces: `DocumentTemplate { Id, Name, Description?, OwnerId, Owner, StorageKey, OriginalFileName, SizeBytes, VisibleToAllStudents, VisibleToAllTeachers, CreatedAt, UpdatedAt, Groups, Teachers }`; join entities `DocumentTemplateGroup { TemplateId, GroupId }`, `DocumentTemplateTeacher { TemplateId, TeacherId }`; `AppDbContext.DocumentTemplates`.

- [ ] **Step 1: Add the Open XML SDK**

```bash
cd backend
dotnet add DiplomaTracker.Api package DocumentFormat.OpenXml
```

Expected: `PackageReference for package 'DocumentFormat.OpenXml' version '3.x.x' added`. Record the version in the report.

- [ ] **Step 2: Create the entities**

`Entities/DocumentTemplate.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class DocumentTemplate
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public AppUser Owner { get; set; } = null!;
    public string StorageKey { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public ICollection<DocumentTemplateGroup> Groups { get; set; } = new List<DocumentTemplateGroup>();
    public ICollection<DocumentTemplateTeacher> Teachers { get; set; } = new List<DocumentTemplateTeacher>();
}
```

`Entities/DocumentTemplateGroup.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class DocumentTemplateGroup
{
    public Guid TemplateId { get; set; }
    public DocumentTemplate Template { get; set; } = null!;
    public Guid GroupId { get; set; }
    public Group Group { get; set; } = null!;
}
```

`Entities/DocumentTemplateTeacher.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

public class DocumentTemplateTeacher
{
    public Guid TemplateId { get; set; }
    public DocumentTemplate Template { get; set; } = null!;
    public Guid TeacherId { get; set; }
    public AppUser Teacher { get; set; } = null!;
}
```

- [ ] **Step 3: Map in `Data/AppDbContext.cs`**

Add set:

```csharp
    public DbSet<DocumentTemplate> DocumentTemplates => Set<DocumentTemplate>();
```

Append:

```csharp
        var template = modelBuilder.Entity<DocumentTemplate>();
        template.ToTable("DocumentTemplates");
        template.HasKey(x => x.Id);
        template.Property(x => x.Name).HasMaxLength(200).IsRequired();
        template.Property(x => x.Description).HasMaxLength(1000);
        template.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        template.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
        template.Property(x => x.CreatedAt).IsRequired();
        template.Property(x => x.UpdatedAt).IsRequired();
        template.HasOne(x => x.Owner)
            .WithMany()
            .HasForeignKey(x => x.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        var templateGroup = modelBuilder.Entity<DocumentTemplateGroup>();
        templateGroup.ToTable("DocumentTemplateGroups");
        templateGroup.HasKey(x => new { x.TemplateId, x.GroupId });
        templateGroup.HasOne(x => x.Template)
            .WithMany(x => x.Groups)
            .HasForeignKey(x => x.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);
        templateGroup.HasOne(x => x.Group)
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);

        var templateTeacher = modelBuilder.Entity<DocumentTemplateTeacher>();
        templateTeacher.ToTable("DocumentTemplateTeachers");
        templateTeacher.HasKey(x => new { x.TemplateId, x.TeacherId });
        templateTeacher.HasOne(x => x.Template)
            .WithMany(x => x.Teachers)
            .HasForeignKey(x => x.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);
        templateTeacher.HasOne(x => x.Teacher)
            .WithMany()
            .HasForeignKey(x => x.TeacherId)
            .OnDelete(DeleteBehavior.Restrict);
```

A group deleted while named in an audience removes the audience row; a teacher is never deleted (only deactivated), so the teacher link is `Restrict`.

- [ ] **Step 4: Build and regenerate**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
rm -rf DiplomaTracker.Api/Migrations
dotnet ef migrations add InitialCreate --project DiplomaTracker.Api --output-dir Migrations
M=$(ls DiplomaTracker.Api/Migrations/*_InitialCreate.cs)
grep -c 'name: "DocumentTemplates"\|name: "DocumentTemplateGroups"\|name: "DocumentTemplateTeachers"' "$M"
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
taskkill //F //IM DiplomaTracker.Api.exe 2>/dev/null
dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

Expected: `0 Error(s)`; count `3` or more; no pending changes; database dropped.

If SQL Server reports "may cause cycles or multiple cascade paths" when the API later applies the migration, change `templateGroup`'s `Group` relationship to `DeleteBehavior.Restrict`, regenerate, and note it in the report.

---

### Task 2: Marker vocabulary and Word processing

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/Documents/DocumentContext.cs`
- Create: `backend/DiplomaTracker.Api/Services/Documents/MarkerVocabulary.cs`
- Create: `backend/DiplomaTracker.Api/Services/Documents/DocxMarkerProcessor.cs`

**Interfaces:**
- Produces:
  - `record DocumentPerson(string LastName, string FirstName, string? Patronymic, string Email)`; `record DocumentContext(DocumentPerson? Student, string? StudentNumber, string? GroupName, string? AcademicYear, string? DepartmentName, string? DepartmentShortName, string? FacultyName, string? FacultyShortName, string? TopicTitle, string? TopicDescription, DocumentPerson? Supervisor, DateTime NowUtc)`.
  - `MarkerVocabulary.Keys : IReadOnlyList<string>` (20 keys in the order of the Global Constraints), `IsKnown(string key) : bool`, `Resolve(string key, DocumentContext context) : string`.
  - `DocxMarkerProcessor.TryReadMarkers(Stream docx, out IReadOnlySet<string> markers) : bool` (false when the stream is not a Word document), `Fill(Stream source, DocumentContext context) : byte[]`.

- [ ] **Step 1: Create `Services/Documents/DocumentContext.cs`**

```csharp
namespace DiplomaTracker.Api.Services.Documents;

public sealed record DocumentPerson(string LastName, string FirstName, string? Patronymic, string Email);

public sealed record DocumentContext(
    DocumentPerson? Student,
    string? StudentNumber,
    string? GroupName,
    string? AcademicYear,
    string? DepartmentName,
    string? DepartmentShortName,
    string? FacultyName,
    string? FacultyShortName,
    string? TopicTitle,
    string? TopicDescription,
    DocumentPerson? Supervisor,
    DateTime NowUtc)
{
    public static DocumentContext Blank(DateTime nowUtc) =>
        new(null, null, null, null, null, null, null, null, null, null, null, nowUtc);
}
```

- [ ] **Step 2: Create `Services/Documents/MarkerVocabulary.cs`**

```csharp
using System.Globalization;

namespace DiplomaTracker.Api.Services.Documents;

public static class MarkerVocabulary
{
    private static readonly (string Key, Func<DocumentContext, string?> Value)[] Definitions =
    [
        ("student.lastName", c => c.Student?.LastName),
        ("student.firstName", c => c.Student?.FirstName),
        ("student.patronymic", c => c.Student?.Patronymic),
        ("student.fullName", c => FullName(c.Student)),
        ("student.shortName", c => ShortName(c.Student)),
        ("student.email", c => c.Student?.Email),
        ("student.number", c => c.StudentNumber),
        ("group.name", c => c.GroupName),
        ("group.academicYear", c => c.AcademicYear),
        ("department.name", c => c.DepartmentName),
        ("department.shortName", c => c.DepartmentShortName),
        ("faculty.name", c => c.FacultyName),
        ("faculty.shortName", c => c.FacultyShortName),
        ("topic.title", c => c.TopicTitle),
        ("topic.description", c => c.TopicDescription),
        ("supervisor.fullName", c => FullName(c.Supervisor)),
        ("supervisor.shortName", c => ShortName(c.Supervisor)),
        ("supervisor.email", c => c.Supervisor?.Email),
        ("date.today", c => ToKyiv(c.NowUtc).ToString("dd.MM.yyyy", CultureInfo.InvariantCulture)),
        ("date.year", c => ToKyiv(c.NowUtc).Year.ToString(CultureInfo.InvariantCulture))
    ];

    private static readonly Dictionary<string, Func<DocumentContext, string?>> ByKey =
        Definitions.ToDictionary(d => d.Key, d => d.Value, StringComparer.OrdinalIgnoreCase);

    private static readonly TimeZoneInfo KyivTimeZone = FindKyivTimeZone();

    public static IReadOnlyList<string> Keys { get; } = Definitions.Select(d => d.Key).ToList();

    public static bool IsKnown(string key) => ByKey.ContainsKey(key);

    public static string Resolve(string key, DocumentContext context) =>
        ByKey.TryGetValue(key, out var resolve) ? resolve(context) ?? string.Empty : string.Empty;

    private static string? FullName(DocumentPerson? person) =>
        person is null
            ? null
            : string.Join(' ', new[] { person.LastName, person.FirstName, person.Patronymic }.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static string? ShortName(DocumentPerson? person)
    {
        if (person is null)
        {
            return null;
        }

        static string Initial(string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : $" {char.ToUpperInvariant(value.Trim()[0])}.";
        return $"{person.LastName}{Initial(person.FirstName)}{Initial(person.Patronymic)}";
    }

    private static DateTime ToKyiv(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), KyivTimeZone);

    private static TimeZoneInfo FindKyivTimeZone()
    {
        foreach (var id in new[] { "Europe/Kyiv", "Europe/Kiev", "FLE Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Utc;
    }
}
```

- [ ] **Step 3: Create `Services/Documents/DocxMarkerProcessor.cs`**

```csharp
using System.IO.Packaging;
using System.Text.RegularExpressions;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace DiplomaTracker.Api.Services.Documents;

public static partial class DocxMarkerProcessor
{
    [GeneratedRegex(@"\{\{\s*([A-Za-z0-9_.]+)\s*\}\}")]
    private static partial Regex MarkerPattern();

    public static bool TryReadMarkers(Stream docx, out IReadOnlySet<string> markers)
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        markers = found;

        try
        {
            using var document = WordprocessingDocument.Open(docx, false);
            if (document.MainDocumentPart?.Document is null)
            {
                return false;
            }

            foreach (var root in Roots(document))
            {
                foreach (var paragraph in root.Descendants<Paragraph>())
                {
                    var text = string.Concat(OwnTexts(paragraph).Select(t => t.Text));
                    foreach (Match match in MarkerPattern().Matches(text))
                    {
                        found.Add(match.Groups[1].Value);
                    }
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is OpenXmlPackageException or InvalidDataException or FileFormatException or IOException)
        {
            return false;
        }
    }

    public static byte[] Fill(Stream source, DocumentContext context)
    {
        using var buffer = new MemoryStream();
        source.CopyTo(buffer);
        buffer.Position = 0;

        using (var document = WordprocessingDocument.Open(buffer, true))
        {
            foreach (var root in Roots(document))
            {
                foreach (var paragraph in root.Descendants<Paragraph>().ToList())
                {
                    FillParagraph(paragraph, context);
                }

                if (root is OpenXmlPartRootElement partRoot)
                {
                    partRoot.Save();
                }
            }
        }

        return buffer.ToArray();
    }

    private static IEnumerable<OpenXmlElement> Roots(WordprocessingDocument document)
    {
        var main = document.MainDocumentPart!;
        yield return main.Document;

        foreach (var header in main.HeaderParts)
        {
            if (header.Header is not null) yield return header.Header;
        }

        foreach (var footer in main.FooterParts)
        {
            if (footer.Footer is not null) yield return footer.Footer;
        }
    }

    private static List<Text> OwnTexts(Paragraph paragraph) =>
        paragraph.Descendants<Text>()
            .Where(text => text.Ancestors<Paragraph>().First() == paragraph)
            .ToList();

    private static void FillParagraph(Paragraph paragraph, DocumentContext context)
    {
        var texts = OwnTexts(paragraph);
        if (texts.Count == 0)
        {
            return;
        }

        var matches = MarkerPattern().Matches(string.Concat(texts.Select(t => t.Text))).ToList();
        for (var index = matches.Count - 1; index >= 0; index--)
        {
            var match = matches[index];
            var value = MarkerVocabulary.Resolve(match.Groups[1].Value, context);
            ReplaceRange(texts, match.Index, match.Index + match.Length, value);
        }
    }

    private static void ReplaceRange(List<Text> texts, int start, int end, string value)
    {
        var (startText, startOffset) = Locate(texts, start);
        var (endText, endOffset) = Locate(texts, end - 1);

        var suffix = texts[endText].Text[(endOffset + 1)..];
        var prefix = texts[startText].Text[..startOffset];

        for (var i = startText + 1; i <= endText; i++)
        {
            texts[i].Text = i == endText ? suffix : string.Empty;
            texts[i].Space = SpaceProcessingModeValues.Preserve;
        }

        var lines = value.Replace("\r\n", "\n").Split('\n');
        var target = texts[startText];
        target.Text = prefix + lines[0] + (startText == endText ? suffix : string.Empty);
        target.Space = SpaceProcessingModeValues.Preserve;

        OpenXmlElement anchor = target;
        foreach (var line in lines.Skip(1))
        {
            var lineBreak = new Break();
            anchor.InsertAfterSelf(lineBreak);
            var next = new Text(line) { Space = SpaceProcessingModeValues.Preserve };
            lineBreak.InsertAfterSelf(next);
            anchor = next;
        }

        if (lines.Length > 1 && startText == endText)
        {
            target.Text = prefix + lines[0];
            ((Text)anchor).Text += suffix;
        }
    }

    private static (int textIndex, int offset) Locate(List<Text> texts, int position)
    {
        var consumed = 0;
        for (var i = 0; i < texts.Count; i++)
        {
            var length = texts[i].Text.Length;
            if (position < consumed + length)
            {
                return (i, position - consumed);
            }

            consumed += length;
        }

        return (texts.Count - 1, Math.Max(0, texts[^1].Text.Length - 1));
    }
}
```

Processing matches from the last to the first keeps the positions of earlier matches valid, because each replacement only changes text at or after its own start.

- [ ] **Step 4: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 3: Template errors, contracts and service

**Files:**
- Create: `backend/DiplomaTracker.Api/Services/TemplateErrors.cs`
- Modify: `backend/DiplomaTracker.Api/Errors/ErrorCatalog.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Templates/TemplateResponse.cs`, `TemplateForm.cs`, `UpdateTemplateRequest.cs`, `GenerateDocumentRequest.cs`, `MarkerInfo.cs`, `EligibleStudent.cs`, `GeneratedDocument.cs`
- Create: `backend/DiplomaTracker.Api/Interfaces/IDocumentTemplateService.cs`
- Create: `backend/DiplomaTracker.Api/Services/DocumentTemplateService.cs`
- Modify: `backend/DiplomaTracker.Api/Program.cs`

**Interfaces:**
- Consumes: `IFileStorage`, `IAccessScope`, `UserContext`, `PersonName`, `MarkerVocabulary`, `DocxMarkerProcessor`, `TopicErrors.TopicNotFound`, `OnboardingErrors.StudentNotFound`, `CommonErrors.Forbidden`.
- Produces:
  - `IDocumentTemplateService`: `GetTemplatesAsync(UserContext)`, `GetTemplateAsync(UserContext, Guid)`, `CreateAsync(UserContext, TemplateForm, CancellationToken)`, `UpdateAsync(UserContext, Guid, UpdateTemplateRequest)`, `ReplaceFileAsync(UserContext, Guid, IFormFile?, CancellationToken)`, `DeleteAsync(UserContext, Guid, CancellationToken)`, `OpenSourceAsync(UserContext, Guid, CancellationToken)`, `GenerateAsync(UserContext, Guid, GenerateDocumentRequest, CancellationToken)`, `GetEligibleStudentsAsync(UserContext)`, `GetMarkers()`.
  - Unknown-marker failures return the code and the sorted unknown keys.

- [ ] **Step 1: Create `Services/TemplateErrors.cs`**

```csharp
using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TemplateErrors
{
    public const string NotFound = "template.notFound";
    public const string NotOwner = "template.notOwner";
    public const string FileMissing = "template.fileMissing";
    public const string InvalidFile = "template.invalidFile";
    public const string UnknownMarkers = "template.unknownMarkers";
    public const string TooLarge = "template.tooLarge";
    public const string AudienceNotAllowed = "template.audienceNotAllowed";
    public const string GroupInvalid = "template.groupInvalid";
    public const string TeacherInvalid = "template.teacherInvalid";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Template not found."),
        new(NotOwner, StatusCodes.Status403Forbidden, "You can change only your own templates."),
        new(FileMissing, StatusCodes.Status400BadRequest, "Attach a .docx template."),
        new(InvalidFile, StatusCodes.Status400BadRequest, "The file is not a valid Word document."),
        new(UnknownMarkers, StatusCodes.Status400BadRequest, "The template contains unknown markers."),
        new(TooLarge, StatusCodes.Status400BadRequest, "The template is larger than 10 MB."),
        new(AudienceNotAllowed, StatusCodes.Status403Forbidden, "You cannot share the template with this audience."),
        new(GroupInvalid, StatusCodes.Status400BadRequest, "A selected group does not exist."),
        new(TeacherInvalid, StatusCodes.Status400BadRequest, "A selected teacher does not exist or is inactive.")
    ];
}
```

Add `TemplateErrors.All,` to `ErrorCatalog`'s `areas`.

- [ ] **Step 2: Create the contracts in `DTOs/Templates/`**

`TemplateResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record NamedOption(Guid Id, string Name);

public class TemplateAudience
{
    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public IReadOnlyList<NamedOption> Groups { get; set; } = [];
    public IReadOnlyList<NamedOption> Teachers { get; set; } = [];
}

public class TemplateResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid OwnerId { get; set; }
    public string OwnerName { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool CanManage { get; set; }
    public TemplateAudience? Audience { get; set; }
}
```

`TemplateForm.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Templates;

public class TemplateForm
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public List<Guid> GroupIds { get; set; } = [];
    public List<Guid> TeacherIds { get; set; } = [];
    public IFormFile? File { get; set; }
}
```

`UpdateTemplateRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Templates;

public class UpdateTemplateRequest
{
    [Required, MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public bool VisibleToAllStudents { get; set; }
    public bool VisibleToAllTeachers { get; set; }
    public List<Guid> GroupIds { get; set; } = [];
    public List<Guid> TeacherIds { get; set; } = [];
}
```

`GenerateDocumentRequest.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Templates;

public class GenerateDocumentRequest
{
    public Guid? StudentId { get; set; }
    public Guid? TopicId { get; set; }
}
```

`MarkerInfo.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record MarkerInfo(string Key, string Marker);
```

`EligibleStudent.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record EligibleStudent(Guid Id, string Name, string GroupName);
```

`GeneratedDocument.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Templates;

public sealed record GeneratedDocument(byte[] Content, string FileName);

public sealed record TemplateSource(Stream Content, string FileName);
```

- [ ] **Step 3: Create `Interfaces/IDocumentTemplateService.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Templates;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IDocumentTemplateService
{
    Task<IReadOnlyList<TemplateResponse>> GetTemplatesAsync(UserContext user);
    Task<(TemplateResponse? template, string? error)> GetTemplateAsync(UserContext user, Guid id);
    Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> CreateAsync(UserContext user, TemplateForm form, CancellationToken cancellationToken);
    Task<(TemplateResponse? template, string? error)> UpdateAsync(UserContext user, Guid id, UpdateTemplateRequest request);
    Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> ReplaceFileAsync(UserContext user, Guid id, IFormFile? file, CancellationToken cancellationToken);
    Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id, CancellationToken cancellationToken);
    Task<(TemplateSource? source, string? error)> OpenSourceAsync(UserContext user, Guid id, CancellationToken cancellationToken);
    Task<(GeneratedDocument? document, string? error)> GenerateAsync(UserContext user, Guid id, GenerateDocumentRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<EligibleStudent>> GetEligibleStudentsAsync(UserContext user);
    IReadOnlyList<MarkerInfo> GetMarkers();
}
```

- [ ] **Step 4: Create `Services/DocumentTemplateService.cs`**

```csharp
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Templates;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services.Documents;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class DocumentTemplateService : IDocumentTemplateService
{
    public const long MaxTemplateBytes = 10L * 1024 * 1024;

    private readonly AppDbContext _dbContext;
    private readonly IFileStorage _fileStorage;
    private readonly IAccessScope _accessScope;

    public DocumentTemplateService(AppDbContext dbContext, IFileStorage fileStorage, IAccessScope accessScope)
    {
        _dbContext = dbContext;
        _fileStorage = fileStorage;
        _accessScope = accessScope;
    }

    public async Task<IReadOnlyList<TemplateResponse>> GetTemplatesAsync(UserContext user)
    {
        var query = await VisibleTemplatesAsync(user);
        var templates = await query.AsNoTracking()
            .Include(t => t.Owner)
            .Include(t => t.Groups).ThenInclude(g => g.Group)
            .Include(t => t.Teachers).ThenInclude(t => t.Teacher)
            .OrderBy(t => t.Name)
            .ToListAsync();

        return templates.Select(t => Map(t, user)).ToList();
    }

    public async Task<(TemplateResponse? template, string? error)> GetTemplateAsync(UserContext user, Guid id)
    {
        var query = await VisibleTemplatesAsync(user);
        var template = await query.AsNoTracking()
            .Include(t => t.Owner)
            .Include(t => t.Groups).ThenInclude(g => g.Group)
            .Include(t => t.Teachers).ThenInclude(t => t.Teacher)
            .FirstOrDefaultAsync(t => t.Id == id);

        return template is null ? (null, TemplateErrors.NotFound) : (Map(template, user), null);
    }

    public async Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> CreateAsync(
        UserContext user, TemplateForm form, CancellationToken cancellationToken)
    {
        if (!user.IsAdmin && !user.IsTeacher)
        {
            return (null, CommonErrors.Forbidden, null);
        }

        var audienceError = await ValidateAudienceAsync(user, form.VisibleToAllStudents, form.GroupIds, form.TeacherIds);
        if (audienceError is not null)
        {
            return (null, audienceError, null);
        }

        var (fileError, unknown, content) = await ReadTemplateFileAsync(form.File, cancellationToken);
        if (fileError is not null)
        {
            return (null, fileError, unknown);
        }

        using var stream = new MemoryStream(content!);
        var key = await _fileStorage.SaveAsync(stream, cancellationToken);

        var now = DateTime.UtcNow;
        var template = new DocumentTemplate
        {
            Id = Guid.NewGuid(),
            Name = form.Name.Trim(),
            Description = IdentityNormalizer.Optional(form.Description),
            OwnerId = user.UserId,
            StorageKey = key,
            OriginalFileName = Path.GetFileName(form.File!.FileName),
            SizeBytes = content!.Length,
            VisibleToAllStudents = form.VisibleToAllStudents,
            VisibleToAllTeachers = form.VisibleToAllTeachers,
            CreatedAt = now,
            UpdatedAt = now
        };
        ApplyAudience(template, form.GroupIds, form.TeacherIds);

        _dbContext.DocumentTemplates.Add(template);
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await _fileStorage.DeleteAsync(key, CancellationToken.None);
            throw;
        }

        var (response, error) = await GetTemplateAsync(user, template.Id);
        return (response, error, null);
    }

    public async Task<(TemplateResponse? template, string? error)> UpdateAsync(UserContext user, Guid id, UpdateTemplateRequest request)
    {
        var (template, accessError) = await LoadManageableAsync(user, id);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var audienceError = await ValidateAudienceAsync(user, request.VisibleToAllStudents, request.GroupIds, request.TeacherIds);
        if (audienceError is not null)
        {
            return (null, audienceError);
        }

        template!.Name = request.Name.Trim();
        template.Description = IdentityNormalizer.Optional(request.Description);
        template.VisibleToAllStudents = request.VisibleToAllStudents;
        template.VisibleToAllTeachers = request.VisibleToAllTeachers;
        template.UpdatedAt = DateTime.UtcNow;
        template.Groups.Clear();
        template.Teachers.Clear();
        ApplyAudience(template, request.GroupIds, request.TeacherIds);

        await _dbContext.SaveChangesAsync();
        return await GetTemplateAsync(user, id);
    }

    public async Task<(TemplateResponse? template, string? error, IReadOnlyList<string>? unknownMarkers)> ReplaceFileAsync(
        UserContext user, Guid id, IFormFile? file, CancellationToken cancellationToken)
    {
        var (template, accessError) = await LoadManageableAsync(user, id);
        if (accessError is not null)
        {
            return (null, accessError, null);
        }

        var (fileError, unknown, content) = await ReadTemplateFileAsync(file, cancellationToken);
        if (fileError is not null)
        {
            return (null, fileError, unknown);
        }

        using var stream = new MemoryStream(content!);
        var newKey = await _fileStorage.SaveAsync(stream, cancellationToken);
        var oldKey = template!.StorageKey;

        template.StorageKey = newKey;
        template.OriginalFileName = Path.GetFileName(file!.FileName);
        template.SizeBytes = content!.Length;
        template.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await _fileStorage.DeleteAsync(newKey, CancellationToken.None);
            throw;
        }

        await _fileStorage.DeleteAsync(oldKey, CancellationToken.None);
        var (response, error) = await GetTemplateAsync(user, id);
        return (response, error, null);
    }

    public async Task<(bool success, string? error)> DeleteAsync(UserContext user, Guid id, CancellationToken cancellationToken)
    {
        var (template, accessError) = await LoadManageableAsync(user, id);
        if (accessError is not null)
        {
            return (false, accessError);
        }

        var key = template!.StorageKey;
        _dbContext.DocumentTemplates.Remove(template);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await _fileStorage.DeleteAsync(key, CancellationToken.None);
        return (true, null);
    }

    public async Task<(TemplateSource? source, string? error)> OpenSourceAsync(UserContext user, Guid id, CancellationToken cancellationToken)
    {
        var (template, accessError) = await LoadManageableAsync(user, id);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var stream = await _fileStorage.OpenReadAsync(template!.StorageKey, cancellationToken);
        return stream is null
            ? (null, TemplateErrors.NotFound)
            : (new TemplateSource(stream, template.OriginalFileName), null);
    }

    public async Task<(GeneratedDocument? document, string? error)> GenerateAsync(
        UserContext user, Guid id, GenerateDocumentRequest request, CancellationToken cancellationToken)
    {
        var query = await VisibleTemplatesAsync(user);
        var template = await query.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
        if (template is null)
        {
            return (null, TemplateErrors.NotFound);
        }

        var (context, lastName, contextError) = await BuildContextAsync(user, request, cancellationToken);
        if (contextError is not null)
        {
            return (null, contextError);
        }

        await using var source = await _fileStorage.OpenReadAsync(template.StorageKey, cancellationToken);
        if (source is null)
        {
            return (null, TemplateErrors.NotFound);
        }

        var bytes = DocxMarkerProcessor.Fill(source, context!);
        var baseName = lastName is null ? template.Name : $"{template.Name} — {lastName}";
        return (new GeneratedDocument(bytes, SafeFileName(baseName) + ".docx"), null);
    }

    public async Task<IReadOnlyList<EligibleStudent>> GetEligibleStudentsAsync(UserContext user)
    {
        var students = await _accessScope.ReviewableStudents(user).AsNoTracking()
            .Where(s => s.User.IsActive)
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .Select(s => new { s.Id, s.User.LastName, s.User.FirstName, s.User.Patronymic, GroupName = s.Group.Name })
            .ToListAsync();

        return students
            .Select(s => new EligibleStudent(s.Id, string.Join(' ', new[] { s.LastName, s.FirstName, s.Patronymic }.Where(p => !string.IsNullOrWhiteSpace(p))), s.GroupName))
            .ToList();
    }

    public IReadOnlyList<MarkerInfo> GetMarkers() =>
        MarkerVocabulary.Keys.Select(key => new MarkerInfo(key, "{{" + key + "}}")).ToList();

    private async Task<IQueryable<DocumentTemplate>> VisibleTemplatesAsync(UserContext user)
    {
        if (user.IsAdmin)
        {
            return _dbContext.DocumentTemplates;
        }

        if (user.IsTeacher)
        {
            return _dbContext.DocumentTemplates.Where(t =>
                t.OwnerId == user.UserId
                || t.VisibleToAllTeachers
                || t.Teachers.Any(teacher => teacher.TeacherId == user.UserId));
        }

        var groupId = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == user.UserId)
            .Select(p => (Guid?)p.GroupId)
            .FirstOrDefaultAsync();

        return _dbContext.DocumentTemplates.Where(t =>
            t.VisibleToAllStudents
            || (groupId != null && t.Groups.Any(g => g.GroupId == groupId)));
    }

    private async Task<(DocumentTemplate? template, string? error)> LoadManageableAsync(UserContext user, Guid id)
    {
        var template = await _dbContext.DocumentTemplates
            .Include(t => t.Groups)
            .Include(t => t.Teachers)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template is null)
        {
            return (null, TemplateErrors.NotFound);
        }

        if (user.IsAdmin || (user.IsTeacher && template.OwnerId == user.UserId))
        {
            return (template, null);
        }

        var visible = await (await VisibleTemplatesAsync(user)).AnyAsync(t => t.Id == id);
        return (null, visible ? TemplateErrors.NotOwner : TemplateErrors.NotFound);
    }

    private async Task<string?> ValidateAudienceAsync(UserContext user, bool allStudents, IReadOnlyCollection<Guid> groupIds, IReadOnlyCollection<Guid> teacherIds)
    {
        if (user.IsTeacher && allStudents)
        {
            return TemplateErrors.AudienceNotAllowed;
        }

        var distinctGroups = groupIds.Distinct().ToList();
        if (distinctGroups.Count > 0)
        {
            var existing = await _dbContext.Groups.CountAsync(g => distinctGroups.Contains(g.Id));
            if (existing != distinctGroups.Count)
            {
                return TemplateErrors.GroupInvalid;
            }

            if (user.IsTeacher)
            {
                var visible = await _accessScope.VisibleGroups(user).CountAsync(g => distinctGroups.Contains(g.Id));
                if (visible != distinctGroups.Count)
                {
                    return TemplateErrors.AudienceNotAllowed;
                }
            }
        }

        var distinctTeachers = teacherIds.Distinct().ToList();
        if (distinctTeachers.Count > 0)
        {
            var existing = await _dbContext.Users.CountAsync(u => distinctTeachers.Contains(u.Id) && u.Role == "Teacher" && u.IsActive);
            if (existing != distinctTeachers.Count)
            {
                return TemplateErrors.TeacherInvalid;
            }
        }

        return null;
    }

    private static void ApplyAudience(DocumentTemplate template, IEnumerable<Guid> groupIds, IEnumerable<Guid> teacherIds)
    {
        foreach (var groupId in groupIds.Distinct())
        {
            template.Groups.Add(new DocumentTemplateGroup { TemplateId = template.Id, GroupId = groupId });
        }

        foreach (var teacherId in teacherIds.Distinct())
        {
            template.Teachers.Add(new DocumentTemplateTeacher { TemplateId = template.Id, TeacherId = teacherId });
        }
    }

    private static async Task<(string? error, IReadOnlyList<string>? unknown, byte[]? content)> ReadTemplateFileAsync(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return (TemplateErrors.FileMissing, null, null);
        }

        if (!string.Equals(Path.GetExtension(file.FileName), ".docx", StringComparison.OrdinalIgnoreCase))
        {
            return (TemplateErrors.InvalidFile, null, null);
        }

        if (file.Length > MaxTemplateBytes)
        {
            return (TemplateErrors.TooLarge, null, null);
        }

        using var buffer = new MemoryStream();
        await using (var upload = file.OpenReadStream())
        {
            await upload.CopyToAsync(buffer, cancellationToken);
        }

        var content = buffer.ToArray();
        using var scan = new MemoryStream(content);
        if (!DocxMarkerProcessor.TryReadMarkers(scan, out var markers))
        {
            return (TemplateErrors.InvalidFile, null, null);
        }

        var unknown = markers.Where(marker => !MarkerVocabulary.IsKnown(marker)).OrderBy(m => m, StringComparer.OrdinalIgnoreCase).ToList();
        return unknown.Count > 0 ? (TemplateErrors.UnknownMarkers, unknown, null) : (null, null, content);
    }

    private async Task<(DocumentContext? context, string? lastName, string? error)> BuildContextAsync(
        UserContext user, GenerateDocumentRequest request, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        StudentProfile? student;
        Topic? topic = null;

        if (user.IsStudent)
        {
            student = await LoadStudentAsync(_dbContext.StudentProfiles.Where(p => p.UserId == user.UserId), cancellationToken);
            if (student is null)
            {
                return (null, null, TaskErrors.StudentProfileNotFound);
            }

            if (request.TopicId is not null)
            {
                topic = await _dbContext.Topics.AsNoTracking()
                    .Include(t => t.Supervisor)
                    .FirstOrDefaultAsync(t => t.Id == request.TopicId
                        && ((t.DepartmentId == student.Group.DepartmentId && t.Origin == TopicOrigin.Catalogue && t.Status == TopicStatus.Available && t.Supervisor.IsActive)
                            || t.Reservations.Any(r => r.StudentProfileId == student.Id && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Approved))),
                        cancellationToken);

                if (topic is null)
                {
                    return (null, null, TopicErrors.TopicNotFound);
                }
            }
        }
        else
        {
            if (request.StudentId is null)
            {
                return (DocumentContext.Blank(now), null, null);
            }

            student = await LoadStudentAsync(_accessScope.ReviewableStudents(user).Where(p => p.Id == request.StudentId), cancellationToken);
            if (student is null)
            {
                return (null, null, OnboardingErrors.StudentNotFound);
            }
        }

        topic ??= await DefaultTopicAsync(student, cancellationToken);

        return (new DocumentContext(
            new DocumentPerson(student.User.LastName, student.User.FirstName, student.User.Patronymic, student.User.Email),
            student.StudentNumber,
            student.Group.Name,
            student.Group.AcademicYear,
            student.Group.Department.Name,
            student.Group.Department.ShortName,
            student.Group.Department.Faculty.Name,
            student.Group.Department.Faculty.ShortName,
            topic?.Title,
            topic?.Description,
            topic is null ? null : new DocumentPerson(topic.Supervisor.LastName, topic.Supervisor.FirstName, topic.Supervisor.Patronymic, topic.Supervisor.Email),
            now), student.User.LastName, null);
    }

    private static Task<StudentProfile?> LoadStudentAsync(IQueryable<StudentProfile> query, CancellationToken cancellationToken)
    {
        return query.AsNoTracking()
            .Include(p => p.User)
            .Include(p => p.Group).ThenInclude(g => g.Department).ThenInclude(d => d.Faculty)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<Topic?> DefaultTopicAsync(StudentProfile student, CancellationToken cancellationToken)
    {
        if (student.TopicId is not null)
        {
            return await _dbContext.Topics.AsNoTracking()
                .Include(t => t.Supervisor)
                .FirstOrDefaultAsync(t => t.Id == student.TopicId, cancellationToken);
        }

        return await _dbContext.TopicReservations.AsNoTracking()
            .Where(r => r.StudentProfileId == student.Id && r.Status == ReservationStatus.Pending && r.Topic != null)
            .Select(r => r.Topic!)
            .Include(t => t.Supervisor)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static TemplateResponse Map(DocumentTemplate template, UserContext user)
    {
        var canManage = user.IsAdmin || (user.IsTeacher && template.OwnerId == user.UserId);
        return new TemplateResponse
        {
            Id = template.Id,
            Name = template.Name,
            Description = template.Description,
            OwnerId = template.OwnerId,
            OwnerName = PersonName.Full(template.Owner),
            OriginalFileName = template.OriginalFileName,
            SizeBytes = template.SizeBytes,
            CreatedAt = template.CreatedAt,
            UpdatedAt = template.UpdatedAt,
            CanManage = canManage,
            Audience = canManage
                ? new TemplateAudience
                {
                    VisibleToAllStudents = template.VisibleToAllStudents,
                    VisibleToAllTeachers = template.VisibleToAllTeachers,
                    Groups = template.Groups.Select(g => new NamedOption(g.GroupId, g.Group.Name)).OrderBy(g => g.Name).ToList(),
                    Teachers = template.Teachers.Select(t => new NamedOption(t.TeacherId, PersonName.Full(t.Teacher))).OrderBy(t => t.Name).ToList()
                }
                : null
        };
    }

    private static string SafeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return cleaned.Length == 0 ? "document" : cleaned;
    }
}
```

- [ ] **Step 5: Register and build**

`Program.cs`: `builder.Services.AddScoped<IDocumentTemplateService, DocumentTemplateService>();`

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
```

Expected: `0 Error(s)`.

---

### Task 4: Template endpoints

**Files:**
- Create: `backend/DiplomaTracker.Api/Controllers/TemplatesController.cs`

**Interfaces:**
- Produces the HTTP surface of spec §6 plus `GET /api/templates/students` (Admin, Teacher).

- [ ] **Step 1: Create `Controllers/TemplatesController.cs`**

```csharp
using DiplomaTracker.Api.DTOs.Templates;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/templates")]
[Authorize]
public class TemplatesController : ApiControllerBase
{
    private const long MaxTemplateRequestBytes = 12L * 1024 * 1024;
    private const string DocxContentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    private readonly IDocumentTemplateService _templates;

    public TemplatesController(IDocumentTemplateService templates)
    {
        _templates = templates;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return TryGetCurrentUser(out var user)
            ? Ok(await _templates.GetTemplatesAsync(user))
            : ErrorResult(CommonErrors.Forbidden);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("markers")]
    public IActionResult Markers() => Ok(_templates.GetMarkers());

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("students")]
    public async Task<IActionResult> Students()
    {
        return TryGetCurrentUser(out var user)
            ? Ok(await _templates.GetEligibleStudentsAsync(user))
            : ErrorResult(CommonErrors.Forbidden);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error) = await _templates.GetTemplateAsync(user, id);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    [RequestSizeLimit(MaxTemplateRequestBytes)]
    public async Task<IActionResult> Create([FromForm] TemplateForm form, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error, unknown) = await _templates.CreateAsync(user, form, cancellationToken);
        return template is null
            ? ErrorResult(error, unknown)
            : CreatedAtAction(nameof(Get), new { id = template.Id }, template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTemplateRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error) = await _templates.UpdateAsync(user, id, request);
        return template is null ? ErrorResult(error) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}/file")]
    [RequestSizeLimit(MaxTemplateRequestBytes)]
    public async Task<IActionResult> ReplaceFile(Guid id, IFormFile? file, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (template, error, unknown) = await _templates.ReplaceFileAsync(user, id, file, cancellationToken);
        return template is null ? ErrorResult(error, unknown) : Ok(template);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _templates.DeleteAsync(user, id, cancellationToken);
        return success ? NoContent() : ErrorResult(error);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("{id:guid}/source")]
    public async Task<IActionResult> Source(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (source, error) = await _templates.OpenSourceAsync(user, id, cancellationToken);
        if (source is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(source.Content, DocxContentType, source.FileName);
    }

    [HttpPost("{id:guid}/generate")]
    public async Task<IActionResult> Generate(Guid id, [FromBody] GenerateDocumentRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (document, error) = await _templates.GenerateAsync(user, id, request, cancellationToken);
        if (document is null)
        {
            return ErrorResult(error);
        }

        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(document.Content, DocxContentType, document.FileName);
    }
}
```

- [ ] **Step 2: Build**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
```

Expected: `0 Error(s)` twice; no pending changes.

---

### Task 5: Backend endpoint verification

**Files:**
- Create: `.superpowers/checks/templates-check.mjs` (git-ignored)

- [ ] **Step 1: Start the API** (background): `dotnet run --project backend/DiplomaTracker.Api --launch-profile http`; wait for `/api/registration`.

- [ ] **Step 2: Create `.superpowers/checks/templates-check.mjs`**

```javascript
import { inflateRawSync } from 'node:zlib'

const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []

function check(name, actual, expected) {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

// ---------- minimal zip writer / reader ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}
function unzip(bytes) {
  const buf = Buffer.from(bytes)
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)
  const out = new Map()
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLength = buf.readUInt16LE(ptr + 28)
    const extraLength = buf.readUInt16LE(ptr + 30)
    const commentLength = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLength)
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    const raw = buf.subarray(start, start + compressedSize)
    out.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'))
    ptr += 46 + nameLength + extraLength + commentLength
  }
  return out
}
const textOf = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
function docx(bodyXml, headerText = '{{date.year}}') {
  return zip([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
    { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}<w:sectPr><w:headerReference w:type="default" r:id="rId1"/></w:sectPr></w:body></w:document>` },
    { name: 'word/header1.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}><w:p><w:r><w:t>${headerText}</w:t></w:r></w:p></w:hdr>` }
  ])
}
const paragraph = (runs) => `<w:p>${runs.map(([text, bold]) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`).join('')}</w:p>`
const validBody =
  paragraph([['Student: ', false], ['{{stud', false], ['ent.fullName}}', true]]) +
  paragraph([['Short: {{ student.shortName }}; group {{group.name}}; dept {{department.shortName}}', false]]) +
  `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Topic: {{topic.title}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Supervisor: {{supervisor.shortName}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`

// ---------- http ----------
async function paceAuth() {
  const now = Date.now()
  while (authCalls.length && now - authCalls[0] > 61_000) authCalls.shift()
  if (authCalls.length >= 9) {
    const wait = 61_000 - (now - authCalls[0])
    console.log(`... waiting ${Math.ceil(wait / 1000)}s for the rate-limit window`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    authCalls.length = 0
  }
  authCalls.push(Date.now())
}
async function call(method, path, { token, json, form } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('json')) return { status: response.status, body: await response.json(), headers: response.headers }
  return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers }
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token
function templateForm({ name, bytes, fileName = 'template.docx', allStudents = false, allTeachers = false, groupIds = [], teacherIds = [] }) {
  const form = new FormData()
  form.append('name', name)
  form.append('visibleToAllStudents', String(allStudents))
  form.append('visibleToAllTeachers', String(allTeachers))
  groupIds.forEach((id) => form.append('groupIds', id))
  teacherIds.forEach((id) => form.append('teacherIds', id))
  if (bytes) form.append('file', new Blob([bytes]), fileName)
  return form
}

// ---------- arrange ----------
const admin = await login('admin@diploma.local', 'Admin123!')
const teacher = await login('teacher@diploma.local', 'Teacher123!')
const groups = (await call('GET', '/api/groups', { token: admin })).body
const seedGroup = groups.find((g) => g.name === 'Seed Group A')
const teacherId = (await call('GET', '/api/teachers', { token: admin })).body.find((t) => t.email === 'teacher@diploma.local').id
await call('POST', `/api/groups/${seedGroup.id}/reviewers`, { token: admin, json: { reviewerId: teacherId } })
const otherGroup = (await call('POST', '/api/groups', { token: admin, json: { departmentId: seedGroup.departmentId, name: `Other ${stamp}`, academicYear: '2026/2027', description: '' } })).body
const otherTeacherEmail = `doc.teacher.${stamp}@diploma.local`
await call('POST', '/api/teachers', { token: admin, json: { firstName: 'Олег', lastName: 'Іншенко', email: otherTeacherEmail, password: 'Teacher456!' } })
const otherTeacher = await login(otherTeacherEmail, 'Teacher456!')

const studentEmail = `doc.${stamp}@student.local`
const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Іван', lastName: 'Документенко', patronymic: 'Петрович', email: studentEmail, studentNumber: `D${stamp}`, password: 'Password1!', groupId: seedGroup.id } })).body
const studentToken = await login(studentEmail, 'Password1!')
const outsiderEmail = `outsider.${stamp}@student.local`
await call('POST', '/api/students', { token: admin, json: { firstName: 'Out', lastName: 'Sider', email: outsiderEmail, studentNumber: `O${stamp}`, password: 'Password1!', groupId: otherGroup.id } })
const outsiderToken = await login(outsiderEmail, 'Password1!')

const topicA = (await call('POST', '/api/topics', { token: teacher, json: { title: `Тема A ${stamp}`, departmentId: seedGroup.departmentId } })).body
const topicB = (await call('POST', '/api/topics', { token: teacher, json: { title: `Тема B ${stamp}`, departmentId: seedGroup.departmentId } })).body
await call('PUT', '/api/settings/topic-selection', { token: admin, json: { deadline: null } })
await call('POST', `/api/topics/${topicA.id}/reserve`, { token: studentToken })

// ---------- upload rules ----------
check('01 markers vocabulary size', (await call('GET', '/api/templates/markers', { token: teacher })).body.length, 20)
const unknown = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(paragraph([['{{student.nickname}} {{topic.title}}', false]])), groupIds: [seedGroup.id] }) })
check('02 unknown marker refused', unknown.body.code, 'template.unknownMarkers')
check('03 unknown markers listed', JSON.stringify(unknown.body.errors), JSON.stringify(['student.nickname']))
check('04 not a Word document', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: Buffer.from('plain text'), groupIds: [seedGroup.id] }) })).body.code, 'template.invalidFile')
check('05 teacher cannot target all students', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(validBody), allStudents: true }) })).body.code, 'template.audienceNotAllowed')
check('06 teacher cannot target invisible group', (await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: 'Bad', bytes: docx(validBody), groupIds: [otherGroup.id] }) })).body.code, 'template.audienceNotAllowed')

const created = await call('POST', '/api/templates', { token: teacher, form: templateForm({ name: `Заява ${stamp}`, bytes: docx(validBody), groupIds: [seedGroup.id], allTeachers: true }) })
check('07 teacher uploads template', created.status, 201)
const templateId = created.body.id

// ---------- visibility ----------
check('08 student in group sees template', (await call('GET', '/api/templates', { token: studentToken })).body.some((t) => t.id === templateId), true)
check('09 student outside group does not', (await call('GET', '/api/templates', { token: outsiderToken })).body.some((t) => t.id === templateId), false)
check('10 audience hidden from student', (await call('GET', `/api/templates/${templateId}`, { token: studentToken })).body.audience, null)
check('11 other teacher sees (all teachers)', (await call('GET', '/api/templates', { token: otherTeacher })).body.some((t) => t.id === templateId), true)
check('12 other teacher cannot edit', (await call('PUT', `/api/templates/${templateId}`, { token: otherTeacher, json: { name: 'X', groupIds: [], teacherIds: [] } })).body.code, 'template.notOwner')
check('13 outsider generate refused', (await call('POST', `/api/templates/${templateId}/generate`, { token: outsiderToken, json: {} })).body.code, 'template.notFound')

// ---------- generation ----------
const own = await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: {} })
check('14 student generates', own.status, 200)
const ownParts = unzip(own.bytes)
const ownText = textOf(ownParts.get('word/document.xml'))
check('15 split-run marker filled', ownText.includes('Student: Документенко Іван Петрович'), true)
check('16 spaced marker and short name', ownText.includes('Short: Документенко І. П.; group Seed Group A; dept SE'), true)
check('17 table marker with pending topic', ownText.includes(`Topic: Тема A ${stamp}`), true)
check('18 supervisor short name', ownText.includes('Supervisor: Teacher D.'), true)
check('19 header year filled', textOf(ownParts.get('word/header1.xml')), String(new Date().getFullYear()))
check('20 no markers left', /\{\{/.test(ownText), false)
check('21 file name with last name', decodeURIComponent((own.headers.get('content-disposition') ?? '').split("''")[1] ?? '').endsWith('Документенко.docx'), true)

const chosen = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: studentToken, json: { topicId: topicB.id } })).bytes)
check('22 student picks another topic', textOf(chosen.get('word/document.xml')).includes(`Topic: Тема B ${stamp}`), true)

const forStudent = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: teacher, json: { studentId: student.id } })).bytes)
check('23 reviewer generates for student', textOf(forStudent.get('word/document.xml')).includes('Документенко Іван Петрович'), true)
const blank = unzip((await call('POST', `/api/templates/${templateId}/generate`, { token: teacher, json: {} })).bytes)
check('24 blank form has no student', textOf(blank.get('word/document.xml')).includes('Документенко'), false)
check('25 unrelated teacher cannot generate for student', (await call('POST', `/api/templates/${templateId}/generate`, { token: otherTeacher, json: { studentId: student.id } })).body.code, 'student.notFound')
check('26 eligible students for reviewer', (await call('GET', '/api/templates/students', { token: teacher })).body.some((s) => s.id === student.id), true)

// ---------- management ----------
const source = await call('GET', `/api/templates/${templateId}/source`, { token: teacher })
check('27 owner downloads source with markers', textOf(unzip(source.bytes).get('word/document.xml')).includes('{{topic.title}}'), true)
check('28 replace file with unknown marker refused', (await call('PUT', `/api/templates/${templateId}/file`, { token: teacher, form: (() => { const f = new FormData(); f.append('file', new Blob([docx(paragraph([['{{oops}}', false]]))]), 'v2.docx'); return f })() })).body.code, 'template.unknownMarkers')
check('29 admin updates audience to all students', (await call('PUT', `/api/templates/${templateId}`, { token: admin, json: { name: `Заява ${stamp}`, visibleToAllStudents: true, visibleToAllTeachers: true, groupIds: [], teacherIds: [] } })).body.audience.visibleToAllStudents, true)
check('30 outsider now sees template', (await call('GET', '/api/templates', { token: outsiderToken })).body.some((t) => t.id === templateId), true)
check('31 owner deletes', (await call('DELETE', `/api/templates/${templateId}`, { token: teacher })).status, 204)
check('32 deleted template gone', (await call('GET', `/api/templates/${templateId}`, { token: admin })).body.code, 'template.notFound')

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

Check 18 expects the seed teacher `Demo Teacher` to render as `Teacher D.`; if the seed names differ, adjust the expected text to the seed teacher's `LastName` and first initial.

- [ ] **Step 3: Run and stop the API**

```bash
node .superpowers/checks/templates-check.mjs
taskkill //F //IM DiplomaTracker.Api.exe
netstat -ano | grep ":5000 .*LISTEN" || echo "port 5000 free"
```

Expected: `32/32 checks passed`; `port 5000 free`.

---

### Task 6: Client, documents page and editor

Shared page rules from the design system plan apply.

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/api/templatesApi.ts`
- Create: `src/components/ui/MultiSelect.tsx`
- Create: `src/components/documents/TemplateEditorModal.tsx`, `MarkerList.tsx`, `DownloadDocumentDialog.tsx`
- Create: `src/pages/DocumentsPage.tsx`
- Modify: `src/components/layout/navigation.ts`, `src/App.tsx`
- Modify: `src/i18n/uk.json`, `src/i18n/en.json`

**Interfaces:**
- Types: `NamedOption { id, name }`, `TemplateAudience`, `DocumentTemplate`, `TemplateInput { name, description?, visibleToAllStudents, visibleToAllTeachers, groupIds: string[], teacherIds: string[] }`, `MarkerInfo { key, marker }`, `EligibleStudent { id, name, groupName }`.
- Functions: `getTemplates()`, `getTemplateMarkers()`, `getEligibleStudents()`, `createTemplate(input, file)`, `updateTemplate(id, input)`, `replaceTemplateFile(id, file)`, `deleteTemplate(id)`, `downloadTemplateSource(id, fallbackName)`, `generateDocument(id, request, fallbackName)`.
- `MultiSelect({ label, values: string[], onChange: (values: string[]) => void, options: SelectOption[], placeholder?, hint?, error?, disabled? })`.

- [ ] **Step 1: Types and API module**

Append to `types.ts`:

```typescript
export type NamedOption = {
  id: string
  name: string
}

export type TemplateAudience = {
  visibleToAllStudents: boolean
  visibleToAllTeachers: boolean
  groups: NamedOption[]
  teachers: NamedOption[]
}

export type DocumentTemplate = {
  id: string
  name: string
  description: string | null
  ownerId: string
  ownerName: string
  originalFileName: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
  canManage: boolean
  audience: TemplateAudience | null
}

export type TemplateInput = {
  name: string
  description?: string
  visibleToAllStudents: boolean
  visibleToAllTeachers: boolean
  groupIds: string[]
  teacherIds: string[]
}

export type MarkerInfo = {
  key: string
  marker: string
}

export type EligibleStudent = {
  id: string
  name: string
  groupName: string
}
```

Create `src/api/templatesApi.ts`:

```typescript
import { apiDownload, apiRequest } from './apiClient'
import type { DocumentTemplate, EligibleStudent, MarkerInfo, TemplateInput } from './types'

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function toForm(input: TemplateInput, file: File): FormData {
  const form = new FormData()
  form.append('name', input.name)
  if (input.description) form.append('description', input.description)
  form.append('visibleToAllStudents', String(input.visibleToAllStudents))
  form.append('visibleToAllTeachers', String(input.visibleToAllTeachers))
  input.groupIds.forEach((id) => form.append('groupIds', id))
  input.teacherIds.forEach((id) => form.append('teacherIds', id))
  form.append('file', file)
  return form
}

export function getTemplates(): Promise<DocumentTemplate[]> {
  return apiRequest<DocumentTemplate[]>('/api/templates')
}

export function getTemplateMarkers(): Promise<MarkerInfo[]> {
  return apiRequest<MarkerInfo[]>('/api/templates/markers')
}

export function getEligibleStudents(): Promise<EligibleStudent[]> {
  return apiRequest<EligibleStudent[]>('/api/templates/students')
}

export function createTemplate(input: TemplateInput, file: File): Promise<DocumentTemplate> {
  return apiRequest<DocumentTemplate>('/api/templates', { method: 'POST', body: toForm(input, file) })
}

export function updateTemplate(id: string, input: TemplateInput): Promise<DocumentTemplate> {
  return apiRequest<DocumentTemplate>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function replaceTemplateFile(id: string, file: File): Promise<DocumentTemplate> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<DocumentTemplate>(`/api/templates/${id}/file`, { method: 'PUT', body: form })
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiRequest<void>(`/api/templates/${id}`, { method: 'DELETE' })
}

export async function downloadTemplateSource(id: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/templates/${id}/source`)
  saveBlob(blob, fileName ?? fallbackName)
}

export async function generateDocument(id: string, request: { studentId?: string; topicId?: string }, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/templates/${id}/generate`, {
    method: 'POST',
    body: JSON.stringify(request)
  })
  saveBlob(blob, fileName ?? fallbackName)
}
```

- [ ] **Step 2: Create `src/components/ui/MultiSelect.tsx`**

```tsx
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import type { SelectOption } from './Select'
import { controlClasses } from './styles'

type MultiSelectProps = {
  label: ReactNode
  values: string[]
  onChange: (values: string[]) => void
  options: SelectOption[]
  placeholder?: string
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function MultiSelect({ label, values, onChange, options, placeholder, hint, error, disabled }: MultiSelectProps) {
  const id = useId()
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label)

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <Listbox value={values} onChange={onChange} multiple disabled={disabled}>
        <ListboxButton id={id} className={cn(controlClasses, 'flex h-auto min-h-10 items-center justify-between py-2 text-left', Boolean(error) && 'border-danger')}>
          <span className={cn('line-clamp-2', selectedLabels.length === 0 && 'text-text-muted')}>
            {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder ?? ''}
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-50 mt-1 max-h-64 w-(--button-width) overflow-auto rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="group flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-strong data-focus:bg-surface data-selected:font-semibold"
            >
              <span className="truncate">{option.label}</span>
              <Check className="invisible size-4 text-accent group-data-selected:visible" aria-hidden />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </FieldShell>
  )
}
```

- [ ] **Step 3: Documents components and page**

Specifics:
- `MarkerList()`: loads `getTemplateMarkers()`; renders a compact two-column grid; each row shows the marker in `font-mono text-xs bg-surface rounded-control px-2 py-1`, its description `templates.markerDescriptions.<key with dots replaced by _>`, and a ghost `Copy` icon button writing the marker to `navigator.clipboard` with `toast.success(t('templates.copied'))`.
- `TemplateEditorModal({ open, template?: DocumentTemplate, onClose, onSaved })` (size `lg`): fields name, description (`Textarea`), file `FileInput accept=".docx"` (required on create; on edit, optional "replace file" that calls `replaceTemplateFile` after metadata save), audience: `MultiSelect` groups (options from `getGroups()` — admin sees all, teacher sees visible groups), `MultiSelect` teachers (from `getTopicSupervisors()`), `Checkbox` `templates.allTeachers`, and `Checkbox` `templates.allStudents` rendered only for administrators. Collapsible section `templates.markersTitle` (a `ghost` toggle button) containing `MarkerList`. On `template.unknownMarkers`, show a `bg-danger-soft` block titled `errors.template.unknownMarkers` listing each marker from `(error as ApiError).payload.errors` in monospace. Client checks: `.docx` extension, ≤ 10 MB.
- `DownloadDocumentDialog({ template, open, onClose })`:
  - Student: topic `Select` built from `getTopics()` (visible catalogue plus own) with the first option `templates.myTopicDefault` (value `''`, meaning default); button `templates.download` calls `generateDocument(template.id, { topicId: value || undefined }, `${template.name}.docx`)`.
  - Teacher/Admin: `SegmentedControl` `templates.blank` / `templates.forStudent`; for a student, `Select` of `getEligibleStudents()` labelled `{{name}} · {{groupName}}`; button `templates.download`.
  - Errors via `useErrorMessage`; success closes the dialog.
- `DocumentsPage` (`/documents`, every role): `PageHeader` `templates.title` with description `templates.subtitle`; action `templates.add` (primary, `FilePlus2`) for Admin/Teacher. `DataTable` columns: name with description muted below, owner, updated at, actions: `templates.download` (primary `sm`, `Download` icon) opening `DownloadDocumentDialog`; when `canManage`: edit (`Pencil`, opens editor), source download (`FileCode2`, `downloadTemplateSource`), delete (`Trash2`, `ConfirmDialog` `templates.deleteConfirm`). Admin/Teacher rows with `canManage` show a small audience summary line (`templates.audienceSummary` with counts, or `templates.allStudentsBadge` / `templates.allTeachersBadge` badges). Empty state `templates.empty` with `FileText`.
- Navigation: add `{ to: '/documents', labelKey: 'nav.documents' }` to every role, placed before `nav.taskTemplates` for Admin/Teacher and last for Student. `App.tsx`: inside the protected layout (any role) add `documents` → `DocumentsPage`.

**Translation blocks.** Add `"documents": "Документи"` / `"documents": "Documents"` to `nav`. Add to `uk.json`:

```json
  "templates": {
    "title": "Документи",
    "subtitle": "Шаблони заяв і бланків; завантажені документи заповнюються вашими даними.",
    "add": "Додати шаблон",
    "edit": "Редагувати шаблон",
    "name": "Назва",
    "description": "Опис",
    "owner": "Автор",
    "updatedAt": "Оновлено",
    "file": "Файл шаблону (.docx)",
    "replaceFile": "Замінити файл",
    "fileHint": "Word-документ до 10 МБ із маркерами, наприклад:",
    "audienceTitle": "Хто бачить шаблон",
    "groups": "Групи",
    "teachers": "Викладачі",
    "allTeachers": "Усі викладачі",
    "allStudents": "Усі студенти",
    "audienceSummary": "Групи: {{groups}}, викладачі: {{teachers}}",
    "allStudentsBadge": "Усім студентам",
    "allTeachersBadge": "Усім викладачам",
    "markersTitle": "Доступні маркери",
    "copied": "Маркер скопійовано",
    "download": "Завантажити",
    "downloadTitle": "Завантажити «{{name}}»",
    "myTopicDefault": "Моя тема (за замовчуванням)",
    "topic": "Тема",
    "blank": "Порожній бланк",
    "forStudent": "Для студента",
    "student": "Студент",
    "sourceDownload": "Завантажити оригінал",
    "deleteConfirm": "Видалити шаблон «{{name}}»?",
    "empty": "Доступних документів немає.",
    "saved": "Шаблон збережено",
    "unknownMarkersList": "Невідомі маркери:",
    "markerDescriptions": {
      "student_lastName": "Прізвище студента",
      "student_firstName": "Ім'я студента",
      "student_patronymic": "По батькові студента",
      "student_fullName": "Прізвище, ім'я та по батькові студента",
      "student_shortName": "Прізвище та ініціали студента",
      "student_email": "Електронна пошта студента",
      "student_number": "Номер студентського квитка",
      "group_name": "Назва групи",
      "group_academicYear": "Навчальний рік групи",
      "department_name": "Назва кафедри",
      "department_shortName": "Скорочена назва кафедри",
      "faculty_name": "Назва факультету",
      "faculty_shortName": "Скорочена назва факультету",
      "topic_title": "Назва теми",
      "topic_description": "Опис теми",
      "supervisor_fullName": "ПІБ керівника",
      "supervisor_shortName": "Прізвище та ініціали керівника",
      "supervisor_email": "Електронна пошта керівника",
      "date_today": "Сьогоднішня дата (дд.мм.рррр)",
      "date_year": "Поточний рік"
    }
  }
```

Add to `errors` in `uk.json`:

```json
    "template": {
      "notFound": "Шаблон не знайдено.",
      "notOwner": "Змінювати можна лише власні шаблони.",
      "fileMissing": "Додайте шаблон у форматі .docx.",
      "invalidFile": "Файл не є коректним документом Word.",
      "unknownMarkers": "Шаблон містить невідомі маркери.",
      "tooLarge": "Шаблон більший за 10 МБ.",
      "audienceNotAllowed": "Ви не можете надати доступ цій аудиторії.",
      "groupInvalid": "Однієї з обраних груп не існує.",
      "teacherInvalid": "Один з обраних викладачів не існує або неактивний."
    }
```

Add to `en.json`:

```json
  "templates": {
    "title": "Documents",
    "subtitle": "Application and form templates; downloaded documents are filled with your data.",
    "add": "Add template",
    "edit": "Edit template",
    "name": "Name",
    "description": "Description",
    "owner": "Author",
    "updatedAt": "Updated",
    "file": "Template file (.docx)",
    "replaceFile": "Replace file",
    "fileHint": "A Word document up to 10 MB with markers such as:",
    "audienceTitle": "Who can see the template",
    "groups": "Groups",
    "teachers": "Teachers",
    "allTeachers": "All teachers",
    "allStudents": "All students",
    "audienceSummary": "Groups: {{groups}}, teachers: {{teachers}}",
    "allStudentsBadge": "All students",
    "allTeachersBadge": "All teachers",
    "markersTitle": "Available markers",
    "copied": "Marker copied",
    "download": "Download",
    "downloadTitle": "Download \"{{name}}\"",
    "myTopicDefault": "My topic (default)",
    "topic": "Topic",
    "blank": "Blank form",
    "forStudent": "For a student",
    "student": "Student",
    "sourceDownload": "Download original",
    "deleteConfirm": "Delete template \"{{name}}\"?",
    "empty": "No documents are available.",
    "saved": "Template saved",
    "unknownMarkersList": "Unknown markers:",
    "markerDescriptions": {
      "student_lastName": "Student's last name",
      "student_firstName": "Student's first name",
      "student_patronymic": "Student's patronymic",
      "student_fullName": "Student's full name",
      "student_shortName": "Student's last name and initials",
      "student_email": "Student's email",
      "student_number": "Student ID number",
      "group_name": "Group name",
      "group_academicYear": "Group academic year",
      "department_name": "Department name",
      "department_shortName": "Department short name",
      "faculty_name": "Faculty name",
      "faculty_shortName": "Faculty short name",
      "topic_title": "Topic title",
      "topic_description": "Topic description",
      "supervisor_fullName": "Supervisor's full name",
      "supervisor_shortName": "Supervisor's last name and initials",
      "supervisor_email": "Supervisor's email",
      "date_today": "Today's date (dd.mm.yyyy)",
      "date_year": "Current year"
    }
  }
```

Add to `errors` in `en.json`:

```json
    "template": {
      "notFound": "Template not found.",
      "notOwner": "You can change only your own templates.",
      "fileMissing": "Attach a .docx template.",
      "invalidFile": "The file is not a valid Word document.",
      "unknownMarkers": "The template contains unknown markers.",
      "tooLarge": "The template is larger than 10 MB.",
      "audienceNotAllowed": "You cannot share the template with this audience.",
      "groupInvalid": "A selected group does not exist.",
      "teacherInvalid": "A selected teacher does not exist or is inactive."
    }
```

The `templates.fileHint` text ends with a colon; render the example marker after it as `<code className="font-mono">{'{{student.fullName}}'}</code>`, outside the translation, because i18next would treat `{{…}}` inside a translation as a variable.

- [ ] **Step 4: Gates**

```bash
cd frontend/diploma-tracker-web
npx tsc -b
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean.

---

### Task 7: Walkthrough, verification and commit

**Files:**
- Modify: `docs/superpowers/test-backlog.md`, `docs/superpowers/PROJECT_MEMORY.md`

- [ ] **Step 1: Walkthrough with the owner** (owner signs in; controller drives `api` and `web`)
1. The owner prepares a `.docx` in Word with body text, a table and a header containing markers from the vocabulary (copied from the marker list), including one marker typed with a deliberate typo.
2. Teacher → Documents → Add template: the typo is reported with the marker name; fix it in Word, upload again, share with a reviewed group and *All teachers*.
3. Student of that group → Documents: download with the default topic; open the file in Word — name, group, department, topic, supervisor and date are filled and formatting is kept.
4. Student downloads again choosing another available topic; the topic and supervisor change.
5. Teacher downloads a blank form and a form for the student.
6. Admin edits the audience to *All students*; a student from another group now sees it; admin deletes it.
7. UK/EN switch on the page and dialogs.

- [ ] **Step 2: Gates**

```bash
cd backend
dotnet build DiplomaTracker.Api --nologo -v q
dotnet build DiplomaTracker.Api.Tests --nologo -v q
dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api
cd ../frontend/diploma-tracker-web
npm run lint
npm run i18n:check
VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: clean.

- [ ] **Step 3: Append the templates section to `docs/superpowers/test-backlog.md`**

```markdown

## Document templates

### Unit level (no database)
- `MarkerVocabulary`: 20 keys; case-insensitive lookup; full name with and without patronymic; short name initials; `date.today` and `date.year` in Kyiv time around midnight UTC; unknown key resolves to empty.
- `DocxMarkerProcessor.TryReadMarkers`: body, table, header, footer; split runs; spaces inside braces; non-Word input returns false; text boxes counted once.
- `DocxMarkerProcessor.Fill`: split-run replacement keeps the first run's formatting and empties the rest; several markers in one paragraph; adjacent markers; multi-line values produce breaks; markers in headers and footers; unaffected paragraphs unchanged.

### Service level, InMemory
- `DocumentTemplateService` visibility for admin, owner teacher, all-teachers, named teacher, all-students, named group, other group.
- Audience rules: teacher with all-students; teacher with invisible group; unknown group; inactive teacher.
- Management: non-owner teacher (`template.notOwner` when visible, `template.notFound` when not); replacing the file deletes the old stored file; deleting removes the stored file; failed save deletes the newly stored file.
- Generation: student default topic order (approved, pending, none); student named topic visible vs not; staff for reviewable vs unrelated student; blank form; file name sanitisation.

### SQL Server integration
- Cascade from groups to `DocumentTemplateGroups`; restrict from users to `DocumentTemplateTeachers`.

### HTTP level
- Multipart binding of `groupIds`/`teacherIds` lists; `errors` array on `template.unknownMarkers`; download headers; 12 MB request limit.

### Frontend
- Editor: admin-only all-students checkbox; unknown-marker list rendering; replace-file flow.
- Download dialog: student topic default; staff blank vs student.
- Marker list copy to clipboard.
```

- [ ] **Step 4: Update `docs/superpowers/PROJECT_MEMORY.md`**

- Status row: `| 6 Document templates | Done — commit \`Implement document templates\` | \`2026-09-17-document-templates-design.md\` |`.
- `## Environment facts`: add `\`DocumentFormat.OpenXml\` <version> is referenced by the API for template scanning and generation.` (use the installed version).
- `## Gotchas`: add `**Template markers** are matched per paragraph after joining its runs; a new marker key must be added to \`MarkerVocabulary\` and to \`templates.markerDescriptions\` in both translation files.`
- `## Log`: today's date — `Document templates implemented. Phase 7 (preview and commenting) remains deferred.`

- [ ] **Step 5: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add backend/DiplomaTracker.Api backend/DiplomaTracker.Api.Tests frontend/diploma-tracker-web/src docs/superpowers/test-backlog.md docs/superpowers/PROJECT_MEMORY.md
git diff --cached --name-only | grep -E '/bin/|/obj/|node_modules|App_Data|PROJECT_PAPER|README'; echo "exit=$?"
git commit -m "Implement document templates"
git log --oneline -1
```

Expected: grep prints nothing, `exit=1`; the log's first line ends with `Implement document templates`.
