using System.IO.Compression;
using System.Xml;
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

    // Zip-bomb guard (pre-flight A5): a template is fully parsed by the Open XML SDK, so a small
    // .docx could otherwise inflate into an unbounded amount of work. Checked against the zip
    // directory before the package is ever opened.
    private const int MaxZipEntries = 1000;
    private const long MaxZipUncompressedBytes = 100L * 1024 * 1024;

    // Fix wave M2 (sec): the whole package may be up to 100 MB (mostly images), but only the
    // word/*.xml parts are ever parsed as a DOM, so those get a much smaller budget, checked
    // before the package is opened at all.
    private const long MaxXmlUncompressedBytes = 20L * 1024 * 1024;
    private const long MaxXmlCharactersPerEntry = 20_000_000;
    private const int MaxXmlDepth = 128;

    // Fix wave L5: an upload with hundreds of stray "{{" can otherwise produce an unbounded
    // errors array.
    private const int MaxUnknownMarkers = 50;
    private const int MaxUnknownMarkerLength = 100;

    private readonly AppDbContext _dbContext;
    private readonly IFileStorage _fileStorage;
    private readonly IAccessScope _accessScope;
    private readonly ILogger<DocumentTemplateService> _logger;

    public DocumentTemplateService(AppDbContext dbContext, IFileStorage fileStorage, IAccessScope accessScope, ILogger<DocumentTemplateService> logger)
    {
        _dbContext = dbContext;
        _fileStorage = fileStorage;
        _accessScope = accessScope;
        _logger = logger;
    }

    public async Task<IReadOnlyList<TemplateResponse>> GetTemplatesAsync(UserContext user)
    {
        var query = await VisibleTemplatesAsync(user);
        var templates = await query.AsNoTracking()
            .Include(t => t.Owner)
            .AsSplitQuery()
            .OrderBy(t => t.Name)
            .ToListAsync();

        await LoadManageableAudienceAsync(user, templates);
        return templates.Select(t => Map(t, user)).ToList();
    }

    public async Task<(TemplateResponse? template, string? error)> GetTemplateAsync(UserContext user, Guid id)
    {
        var query = await VisibleTemplatesAsync(user);
        var template = await query.AsNoTracking()
            .Include(t => t.Owner)
            .AsSplitQuery()
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template is null)
        {
            return (null, TemplateErrors.NotFound);
        }

        await LoadManageableAudienceAsync(user, [template]);
        return (Map(template, user), null);
    }

    // Fix wave M7: the audience (groups x teachers) is only ever shown to a caller who can manage
    // the template - an administrator, or the owning teacher - so it is loaded, in one extra split
    // query, only for that subset of the already-visible rows instead of for every row (which
    // multiplied every row by groups x teachers and was wasted for every student and every
    // non-owner teacher).
    private async Task LoadManageableAudienceAsync(UserContext user, List<DocumentTemplate> templates)
    {
        var manageableIds = templates
            .Where(t => user.IsAdmin || (user.IsTeacher && t.OwnerId == user.UserId))
            .Select(t => t.Id)
            .ToList();

        if (manageableIds.Count == 0)
        {
            return;
        }

        var withAudience = await _dbContext.DocumentTemplates.AsNoTracking()
            .Where(t => manageableIds.Contains(t.Id))
            .Include(t => t.Groups).ThenInclude(g => g.Group)
            .Include(t => t.Teachers).ThenInclude(t => t.Teacher)
            .AsSplitQuery()
            .ToDictionaryAsync(t => t.Id);

        foreach (var template in templates)
        {
            if (withAudience.TryGetValue(template.Id, out var full))
            {
                template.Groups = full.Groups;
                template.Teachers = full.Teachers;
            }
        }
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

        var (fileError, unknown, content, safeName) = await ReadTemplateFileAsync(form.File, cancellationToken);
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
            OriginalFileName = safeName!,
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
        catch (Exception exception)
        {
            // Same rule as submissions (StudentWorkflowService.SubmitAsync): only compensate when
            // the exception proves nothing committed. Any other failure could be masking a
            // durably-saved template, and deleting the file in that case would strand a reference
            // to it - a leaked file on disk is far cheaper than a broken one.
            if (exception is DbUpdateConcurrencyException
                || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
            {
                await TryDeleteFileAsync(key, "rolling back a failed template create");
                _dbContext.ChangeTracker.Clear();
                throw;
            }

            _logger.LogWarning(exception,
                "Template save failed with an indeterminate outcome; leaving storage key {StorageKey} on disk rather than risk deleting a committed template's file.",
                key);
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

        var audienceError = await ValidateAudienceUpdateAsync(user, template!, request.VisibleToAllStudents, request.GroupIds, request.TeacherIds);
        if (audienceError is not null)
        {
            return (null, audienceError);
        }

        template!.Name = request.Name.Trim();
        template.Description = IdentityNormalizer.Optional(request.Description);
        template.VisibleToAllStudents = request.VisibleToAllStudents;
        template.VisibleToAllTeachers = request.VisibleToAllTeachers;
        template.UpdatedAt = DateTime.UtcNow;
        UpdateAudience(template, request.GroupIds, request.TeacherIds);

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

        var (fileError, unknown, content, safeName) = await ReadTemplateFileAsync(file, cancellationToken);
        if (fileError is not null)
        {
            return (null, fileError, unknown);
        }

        using var stream = new MemoryStream(content!);
        var newKey = await _fileStorage.SaveAsync(stream, cancellationToken);
        var oldKey = template!.StorageKey;

        template.StorageKey = newKey;
        template.OriginalFileName = safeName!;
        template.SizeBytes = content!.Length;
        template.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            if (exception is DbUpdateConcurrencyException
                || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
            {
                await TryDeleteFileAsync(newKey, "rolling back a failed template file replacement");
                _dbContext.ChangeTracker.Clear();
                throw;
            }

            _logger.LogWarning(exception,
                "Template file replacement save failed with an indeterminate outcome for template {TemplateId}; leaving storage key {StorageKey} on disk rather than risk deleting a committed template's file.",
                id, newKey);
            throw;
        }

        // The save committed, so the old file is definitely no longer referenced; a failure to
        // remove it must not fail the request - the database already reflects the new file.
        await TryDeleteFileAsync(oldKey, "removing the replaced file after a successful template update");

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

        await TryDeleteFileAsync(key, "removing the file after a successful template delete");
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
        // Pre-flight A10: the selector always lists non-archived, active students only - even for
        // an administrator, whose ReviewableStudents otherwise returns everyone. Generating a
        // document by id is unaffected and keeps ReviewableStudents' own visibility rule.
        var students = await _accessScope.ReviewableStudents(user).AsNoTracking()
            .Where(s => s.ArchivedAt == null && s.User.IsActive)
            .OrderBy(s => s.User.LastName)
            .ThenBy(s => s.User.FirstName)
            .Select(s => new { s.Id, s.User.LastName, s.User.FirstName, s.User.Patronymic, GroupCode = s.Group.Code, s.Group.AcademicYear })
            .ToListAsync();

        return students
            .Select(s => new EligibleStudent(
                s.Id,
                string.Join(' ', new[] { s.LastName, s.FirstName, s.Patronymic }.Where(p => !string.IsNullOrWhiteSpace(p))),
                s.GroupCode,
                s.AcademicYear))
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

    /// Create keeps the full check: every requested group and teacher id is validated, since none
    /// of them are already saved.
    private async Task<string?> ValidateAudienceAsync(UserContext user, bool allStudents, IReadOnlyCollection<Guid> groupIds, IReadOnlyCollection<Guid> teacherIds)
    {
        if (user.IsTeacher && allStudents)
        {
            return TemplateErrors.AudienceNotAllowed;
        }

        var groupError = await ValidateGroupsAsync(user, groupIds);
        if (groupError is not null)
        {
            return groupError;
        }

        return await ValidateTeachersAsync(teacherIds);
    }

    /// Fix wave I1: an update validates only what the caller is changing, so a teacher who can no
    /// longer see a group already on their own template (the group's last supervised student was
    /// archived, or the teacher was dropped as a reviewer) can still keep it, remove it, or save
    /// any other change - only a newly added group id needs to be in `VisibleGroups`. Likewise
    /// *All students* is refused only when a teacher is turning it on (false -> true); an
    /// administrator-set true survives every later save the teacher makes, instead of being
    /// silently downgraded to false because the teacher's own request always sends false.
    private async Task<string?> ValidateAudienceUpdateAsync(UserContext user, DocumentTemplate template, bool wantAllStudents, IReadOnlyCollection<Guid> groupIds, IReadOnlyCollection<Guid> teacherIds)
    {
        if (user.IsTeacher && wantAllStudents && !template.VisibleToAllStudents)
        {
            return TemplateErrors.AudienceNotAllowed;
        }

        var currentGroups = template.Groups.Select(g => g.GroupId).ToHashSet();
        var addedGroups = groupIds.Distinct().Where(id => !currentGroups.Contains(id)).ToList();
        var groupError = await ValidateGroupsAsync(user, addedGroups);
        if (groupError is not null)
        {
            return groupError;
        }

        return await ValidateTeachersAsync(teacherIds);
    }

    /// Fix wave L4: for a teacher, a nonexistent group and a real-but-invisible one return the
    /// same code (`audienceNotAllowed`) rather than letting a teacher distinguish the two
    /// (`groupInvalid` vs `audienceNotAllowed`) and so probe which group ids exist. An
    /// administrator has no visibility restriction, so a nonexistent id is still `groupInvalid`.
    private async Task<string?> ValidateGroupsAsync(UserContext user, IReadOnlyCollection<Guid> groupIds)
    {
        var distinctGroups = groupIds.Distinct().ToList();
        if (distinctGroups.Count == 0)
        {
            return null;
        }

        if (user.IsTeacher)
        {
            var visible = await _accessScope.VisibleGroups(user).CountAsync(g => distinctGroups.Contains(g.Id));
            return visible == distinctGroups.Count ? null : TemplateErrors.AudienceNotAllowed;
        }

        var existing = await _dbContext.Groups.CountAsync(g => distinctGroups.Contains(g.Id));
        return existing == distinctGroups.Count ? null : TemplateErrors.GroupInvalid;
    }

    private async Task<string?> ValidateTeachersAsync(IReadOnlyCollection<Guid> teacherIds)
    {
        var distinctTeachers = teacherIds.Distinct().ToList();
        if (distinctTeachers.Count == 0)
        {
            return null;
        }

        var existing = await _dbContext.Users.CountAsync(u => distinctTeachers.Contains(u.Id) && u.Role == "Teacher" && u.IsActive);
        return existing == distinctTeachers.Count ? null : TemplateErrors.TeacherInvalid;
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

    /// Pre-flight A3: EF Core throws "another instance with the same key is already being
    /// tracked" if a kept row is Clear()-ed and then re-Add()-ed with the same key, because the
    /// original instance is still tracked when the new one is added. Updating by difference -
    /// removing only what was dropped, adding only what is new - never re-adds a tracked key.
    private static void UpdateAudience(DocumentTemplate template, IReadOnlyCollection<Guid> groupIds, IReadOnlyCollection<Guid> teacherIds)
    {
        var wantedGroups = groupIds.Distinct().ToHashSet();
        foreach (var existing in template.Groups.Where(g => !wantedGroups.Contains(g.GroupId)).ToList())
        {
            template.Groups.Remove(existing);
        }

        var currentGroups = template.Groups.Select(g => g.GroupId).ToHashSet();
        foreach (var groupId in wantedGroups.Where(id => !currentGroups.Contains(id)))
        {
            template.Groups.Add(new DocumentTemplateGroup { TemplateId = template.Id, GroupId = groupId });
        }

        var wantedTeachers = teacherIds.Distinct().ToHashSet();
        foreach (var existing in template.Teachers.Where(t => !wantedTeachers.Contains(t.TeacherId)).ToList())
        {
            template.Teachers.Remove(existing);
        }

        var currentTeachers = template.Teachers.Select(t => t.TeacherId).ToHashSet();
        foreach (var teacherId in wantedTeachers.Where(id => !currentTeachers.Contains(id)))
        {
            template.Teachers.Add(new DocumentTemplateTeacher { TemplateId = template.Id, TeacherId = teacherId });
        }
    }

    private async Task<(string? error, IReadOnlyList<string>? unknown, byte[]? content, string? safeName)> ReadTemplateFileAsync(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return (TemplateErrors.FileMissing, null, null, null);
        }

        // Reuse the phase 5 normalisation (trailing dots/spaces trimmed, 255-character cap,
        // surrogate-safe) rather than a second copy of the same rules - pre-flight A6. The
        // extension check runs against the normalised name so a name manipulated with a trailing
        // dot or space cannot dodge it.
        var safeName = SubmissionFileRules.SafeOriginalName(file.FileName);
        if (safeName.Length == 0 || !string.Equals(Path.GetExtension(safeName), ".docx", StringComparison.OrdinalIgnoreCase))
        {
            return (TemplateErrors.InvalidFile, null, null, null);
        }

        if (file.Length > MaxTemplateBytes)
        {
            return (TemplateErrors.TooLarge, null, null, null);
        }

        using var buffer = new MemoryStream();
        await using (var upload = file.OpenReadStream())
        {
            await upload.CopyToAsync(buffer, cancellationToken);
        }

        var content = buffer.ToArray();

        if (!IsSafeZipArchive(content))
        {
            return (TemplateErrors.InvalidFile, null, null, null);
        }

        using var scan = new MemoryStream(content);
        if (!DocxMarkerProcessor.TryReadMarkers(scan, out var markers))
        {
            return (TemplateErrors.InvalidFile, null, null, null);
        }

        var unknown = markers.Where(marker => !MarkerVocabulary.IsKnown(marker))
            .OrderBy(m => m, StringComparer.OrdinalIgnoreCase)
            .Take(MaxUnknownMarkers)
            .Select(m => m.Length > MaxUnknownMarkerLength ? m[..MaxUnknownMarkerLength] : m)
            .ToList();
        return unknown.Count > 0 ? (TemplateErrors.UnknownMarkers, unknown, null, null) : (null, null, content, safeName);
    }

    /// Pre-flight A5: a template is fully parsed by the Open XML SDK, so a small .docx could
    /// otherwise inflate into an unbounded amount of work. Refuses anything that is not a zip,
    /// has an implausible number of entries, or would expand past a fixed budget - checked
    /// against the zip directory alone, before the package is ever opened.
    private static bool IsSafeZipArchive(byte[] content)
    {
        using var stream = new MemoryStream(content);
        try
        {
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count > MaxZipEntries)
            {
                return false;
            }

            long uncompressedTotal = 0;
            long xmlTotal = 0;
            foreach (var entry in archive.Entries)
            {
                uncompressedTotal += entry.Length;
                if (uncompressedTotal > MaxZipUncompressedBytes)
                {
                    return false;
                }

                if (!IsWordXmlEntry(entry.FullName))
                {
                    continue;
                }

                // Fix wave M2 (sec): the SDK fully parses every word/*.xml part into a DOM, so
                // that subset gets a much smaller budget than the whole package, checked against
                // the zip directory (and, per entry, with a depth-limited XmlReader) before the
                // package is ever opened as Word.
                xmlTotal += entry.Length;
                if (xmlTotal > MaxXmlUncompressedBytes || !IsSafeXmlEntry(entry))
                {
                    return false;
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or ArgumentException)
        {
            return false;
        }
    }

    private static bool IsWordXmlEntry(string entryName)
    {
        var normalized = entryName.Replace('\\', '/');
        if (!normalized.StartsWith("word/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var rest = normalized["word/".Length..];
        return rest.Length > 0 && !rest.Contains('/') && rest.EndsWith(".xml", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSafeXmlEntry(ZipArchiveEntry entry)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            MaxCharactersInDocument = MaxXmlCharactersPerEntry
        };

        try
        {
            using var entryStream = entry.Open();
            using var reader = XmlReader.Create(entryStream, settings);
            while (reader.Read())
            {
                if (reader.NodeType == XmlNodeType.Element && reader.Depth > MaxXmlDepth)
                {
                    return false;
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is XmlException or InvalidDataException or IOException)
        {
            return false;
        }
    }

    private async Task TryDeleteFileAsync(string key, string action)
    {
        try
        {
            await _fileStorage.DeleteAsync(key, CancellationToken.None);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // A locked or read-only file must not fail (or otherwise disrupt) a request whose
            // database change already committed; the key is logged so it can be cleaned up by
            // hand. On Windows a locked/read-only file often throws UnauthorizedAccessException
            // rather than IOException (fix wave M6).
            _logger.LogWarning(exception,
                "Could not delete template storage key {StorageKey} while {Action}.",
                key, action);
        }
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
            student.Group.Code,
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

        return await _dbContext.Topics.AsNoTracking()
            .Include(t => t.Supervisor)
            .Where(t => t.Reservations.Any(r => r.StudentProfileId == student.Id && r.Status == ReservationStatus.Pending))
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
                    // Fix wave M8 (backend half): groups are unique by (AcademicYear, Code), not
                    // by Code alone, so two groups sharing a code from different years must not
                    // look identical in the audience list or in the fallback label a hidden
                    // selection falls back to.
                    Groups = template.Groups.Select(g => new NamedOption(g.GroupId, $"{g.Group.Code} · {g.Group.AcademicYear}")).OrderBy(g => g.Name).ToList(),
                    Teachers = template.Teachers.Select(t => new NamedOption(t.TeacherId, PersonName.Full(t.Teacher))).OrderBy(t => t.Name).ToList()
                }
                : null
        };
    }

    private static string SafeFileName(string name)
    {
        var cleaned = FileNameSanitizer.Sanitize(name).Trim();
        return cleaned.Length == 0 ? "document" : cleaned;
    }
}
