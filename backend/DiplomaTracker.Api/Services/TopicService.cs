using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class TopicService : ITopicService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<TopicService> _logger;

    public TopicService(AppDbContext dbContext, ILogger<TopicService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<(IReadOnlyList<TopicResponse>? topics, string? error)> GetTopicsAsync(UserContext user, TopicQuery query)
    {
        IQueryable<Topic> topics = _dbContext.Topics.AsNoTracking();

        if (user.IsStudent)
        {
            var student = await LoadStudentAsync(user.UserId);
            if (student is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            // The topic the student HOLDS comes from their profile (§5.3); a topic they have
            // REQUESTED is a pending reservation, which is what a request is. Both stay visible
            // in the catalogue, because a student mid-change-request must see the one they hold
            // and the one they want.
            var requestedTopicId = await _dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.StudentProfileId == student.Id && r.Status == ReservationStatus.Pending)
                .Select(r => r.TopicId)
                .FirstOrDefaultAsync();

            var ownTopicIds = new List<Guid>();
            if (student.TopicId is not null)
            {
                ownTopicIds.Add(student.TopicId.Value);
            }
            if (requestedTopicId is not null && requestedTopicId != student.TopicId)
            {
                ownTopicIds.Add(requestedTopicId.Value);
            }

            topics = topics.Where(t =>
                ownTopicIds.Contains(t.Id)
                || (t.DepartmentId == student.DepartmentId
                    && t.Origin == TopicOrigin.Catalogue
                    && t.Status == TopicStatus.Available
                    && t.Supervisor.IsActive));
        }
        else if (user.IsTeacher)
        {
            topics = topics.Where(t => t.SupervisorId == user.UserId);
        }
        else if (!user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Escape SQL Server's own LIKE wildcards before they reach Contains(), which
            // translates to LIKE '%...%': unescaped, a search for "50%" or "a_b" would match
            // as a pattern instead of literal text. The bracket form is itself how SQL Server
            // escapes inside a pattern, so no ESCAPE clause is needed.
            var search = query.Search.Trim()
                .Replace("[", "[[]")
                .Replace("%", "[%]")
                .Replace("_", "[_]");
            topics = topics.Where(t => EF.Functions.Like(t.Title, $"%{search}%")
                || (t.Description != null && EF.Functions.Like(t.Description, $"%{search}%")));
        }

        if (query.SupervisorId is not null)
        {
            topics = topics.Where(t => t.SupervisorId == query.SupervisorId);
        }

        if (user.IsAdmin && query.DepartmentId is not null)
        {
            topics = topics.Where(t => t.DepartmentId == query.DepartmentId);
        }

        if (!user.IsStudent && !string.IsNullOrWhiteSpace(query.Status))
        {
            if (!Enum.TryParse<TopicStatus>(query.Status, ignoreCase: true, out var status))
            {
                return (null, CommonErrors.ValidationFailed);
            }

            topics = topics.Where(t => t.Status == status);
        }

        var rows = await topics
            .OrderBy(t => t.Title)
            .Select(Projection)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, user)).ToList(), null);
    }

    public async Task<(TopicResponse? topic, string? error)> GetTopicAsync(UserContext user, Guid id)
    {
        var row = await _dbContext.Topics.AsNoTracking()
            .Where(t => t.Id == id)
            .Select(Projection)
            .FirstOrDefaultAsync();

        if (row is null)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (user.IsTeacher && row.SupervisorId != user.UserId)
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Topic", id);
            return (null, TopicErrors.TopicNotFound);
        }

        if (user.IsStudent)
        {
            var student = await LoadStudentAsync(user.UserId);
            if (student is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            var isOwn = row.Holder?.StudentProfileId == student.Id || row.Request?.StudentProfileId == student.Id;
            var isVisibleCatalogue = row.DepartmentId == student.DepartmentId
                && row.Origin == TopicOrigin.Catalogue
                && row.Status == TopicStatus.Available
                && row.SupervisorIsActive;

            if (!isOwn && !isVisibleCatalogue)
            {
                SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Topic", id);
                return (null, TopicErrors.TopicNotFound);
            }
        }

        return (ToResponse(row, user), null);
    }

    public async Task<(TopicResponse? topic, string? error)> CreateTopicAsync(UserContext user, CreateTopicRequest request)
    {
        var supervisorId = user.IsTeacher ? user.UserId : request.SupervisorId;
        var validation = await ValidateReferencesAsync(request.DepartmentId, supervisorId);
        if (validation is not null)
        {
            return (null, validation);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = supervisorId!.Value,
            DepartmentId = request.DepartmentId,
            Origin = TopicOrigin.Catalogue,
            Status = TopicStatus.Available,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Topics.Add(topic);
        await _dbContext.SaveChangesAsync();

        SecurityLog.AdministratorAction(_logger, user.UserId, "Created", "Topic", topic.Id);
        return await GetTopicAsync(user, topic.Id);
    }

    public async Task<(TopicResponse? topic, string? error)> UpdateTopicAsync(UserContext user, Guid id, UpdateTopicRequest request)
    {
        var topic = await _dbContext.Topics.FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckUpdatable(user, topic);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var editable = topic!;
        var supervisorId = user.IsAdmin ? request.SupervisorId ?? editable.SupervisorId : editable.SupervisorId;
        var validation = await ValidateReferencesAsync(request.DepartmentId, supervisorId);
        if (validation is not null)
        {
            return (null, validation);
        }

        // An administrator may move a topic that a student already holds — or has merely
        // reserved — to another supervisor. The student's supervisor moves with it, in this
        // same save, so the topic and the student never disagree about who supervises the work.
        // StudentProfile.TopicId is written only on approval, so an Approved topic's holder is
        // found there; a Reserved topic's holder has no such FK yet and is found through its
        // Pending reservation instead.
        if (supervisorId != editable.SupervisorId && editable.Status != TopicStatus.Available)
        {
            var holder = editable.Status == TopicStatus.Approved
                ? await _dbContext.StudentProfiles.FirstOrDefaultAsync(p => p.TopicId == editable.Id)
                : await _dbContext.TopicReservations
                    .Where(r => r.TopicId == editable.Id && r.Status == ReservationStatus.Pending)
                    .Select(r => r.StudentProfile)
                    .FirstOrDefaultAsync();

            if (holder is not null)
            {
                holder.SupervisorId = supervisorId;
                holder.UpdatedAt = DateTime.UtcNow;
            }
        }

        editable.Title = request.Title.Trim();
        editable.Description = IdentityNormalizer.Optional(request.Description);
        editable.DepartmentId = request.DepartmentId;
        editable.SupervisorId = supervisorId;
        editable.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            // A lost RowVersion race is a concurrency conflict on the topic itself, per spec §4
            // ("the RowVersion check makes the second save fail, which is reported as
            // topic.notAvailable") — not the same thing as the topic being at a status that
            // forbids editing it, which is what topic.notEditable means.
            return (null, TopicErrors.TopicNotAvailable);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Updated", "Topic", editable.Id);
        return await GetTopicAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id)
    {
        var topic = await _dbContext.Topics.FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckDeletable(user, topic);
        if (accessError is not null)
        {
            return (false, accessError);
        }

        _dbContext.Topics.Remove(topic!);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return (false, TopicErrors.TopicNotAvailable);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Deleted", "Topic", id);
        return (true, null);
    }

    public async Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync()
    {
        var teachers = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Role == "Teacher" && u.IsActive)
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return teachers.Select(t => new SupervisorOption(t.Id, PersonName.Full(t))).ToList();
    }

    /// <summary>
    /// Editing: an administrator may amend any topic at any status — that is how a wording,
    /// department or supervisor is corrected once work is already under way. A teacher may still
    /// only touch their own catalogue topics while nobody has reserved them.
    /// </summary>
    private static string? CheckUpdatable(UserContext user, Topic? topic)
    {
        var access = CheckTopicAccess(user, topic);
        if (access is not null)
        {
            return access;
        }

        if (user.IsAdmin)
        {
            return null;
        }

        return topic!.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available
            ? TopicErrors.TopicNotEditable
            : null;
    }

    /// <summary>
    /// Deleting stays restricted to available catalogue topics for everyone, administrators
    /// included: removing a topic a student is working on would strand them. Release it first.
    /// </summary>
    private static string? CheckDeletable(UserContext user, Topic? topic)
    {
        var access = CheckTopicAccess(user, topic);
        if (access is not null)
        {
            return access;
        }

        return topic!.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available
            ? TopicErrors.TopicNotEditable
            : null;
    }

    private static string? CheckTopicAccess(UserContext user, Topic? topic)
    {
        if (topic is null || (user.IsTeacher && topic.SupervisorId != user.UserId))
        {
            return user.IsTeacher && topic is not null ? TopicErrors.TopicNotOwner : TopicErrors.TopicNotFound;
        }

        return !user.IsAdmin && !user.IsTeacher ? CommonErrors.Forbidden : null;
    }

    private async Task<string?> ValidateReferencesAsync(Guid departmentId, Guid? supervisorId)
    {
        if (!await _dbContext.Departments.AnyAsync(d => d.Id == departmentId))
        {
            return TopicErrors.TopicDepartmentInvalid;
        }

        if (supervisorId is null
            || !await _dbContext.Users.AnyAsync(u => u.Id == supervisorId && u.Role == "Teacher" && u.IsActive))
        {
            return TopicErrors.TopicSupervisorInvalid;
        }

        return null;
    }

    private async Task<StudentScope?> LoadStudentAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => new StudentScope(p.Id, p.Group.DepartmentId, p.TopicId))
            .FirstOrDefaultAsync();
    }

    private static TopicResponse ToResponse(TopicRow row, UserContext user)
    {
        var showStudent = !user.IsStudent;

        // The holder wins: a topic can be held by one student and requested by another only
        // through an administrator's assignment, and the holder is the topic's real state.
        var party = row.Holder ?? row.Request;
        var partyStatus = row.Holder is not null ? ReservationStatus.Approved : ReservationStatus.Pending;

        return new TopicResponse
        {
            Id = row.Id,
            Title = row.Title,
            Description = row.Description,
            SupervisorId = row.SupervisorId,
            SupervisorName = string.Join(' ', new[] { row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic }.Where(p => !string.IsNullOrWhiteSpace(p))),
            DepartmentId = row.DepartmentId,
            DepartmentName = row.DepartmentName,
            FacultyName = row.FacultyName,
            Origin = row.Origin.ToString(),
            Status = row.Status.ToString(),
            ActiveReservationId = party?.ReservationId,
            ActiveReservationStatus = party is null ? null : partyStatus.ToString(),
            StudentProfileId = showStudent ? party?.StudentProfileId : null,
            StudentName = showStudent ? party?.Name : null,
            GroupCode = showStudent ? party?.GroupCode : null,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }

    /// Phase 8 §5.3 and §8. The holder comes from StudentProfile.TopicId - the source of truth -
    /// and the pending request from TopicReservations, which is what a request actually is.
    ///
    /// Both are projected as one nested object each, so SQL Server plans two OUTER APPLYs rather
    /// than the five correlated scalar subqueries this used to issue per topic row (reservation
    /// id, status, student id, student name and group code, each its own scan).
    private static readonly Expression<Func<Topic, TopicRow>> Projection = t => new TopicRow
    {
        Id = t.Id,
        Title = t.Title,
        Description = t.Description,
        SupervisorId = t.SupervisorId,
        SupervisorFirstName = t.Supervisor.FirstName,
        SupervisorLastName = t.Supervisor.LastName,
        SupervisorPatronymic = t.Supervisor.Patronymic,
        SupervisorIsActive = t.Supervisor.IsActive,
        DepartmentId = t.DepartmentId,
        DepartmentName = t.Department.Name,
        FacultyName = t.Department.Faculty.Name,
        Origin = t.Origin,
        Status = t.Status,
        Holder = t.Holders
            .Select(p => new TopicPartyRow
            {
                ReservationId = p.TopicReservations
                    .Where(r => r.Status == ReservationStatus.Approved)
                    .Select(r => (Guid?)r.Id)
                    .FirstOrDefault(),
                StudentProfileId = p.Id,
                LastName = p.User.LastName,
                FirstName = p.User.FirstName,
                GroupCode = p.Group.Code
            })
            .FirstOrDefault(),
        Request = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending)
            .Select(r => new TopicPartyRow
            {
                ReservationId = r.Id,
                StudentProfileId = r.StudentProfileId,
                LastName = r.StudentProfile.User.LastName,
                FirstName = r.StudentProfile.User.FirstName,
                GroupCode = r.StudentProfile.Group.Code
            })
            .FirstOrDefault(),
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt
    };

    private sealed record StudentScope(Guid Id, Guid DepartmentId, Guid? TopicId);

    private sealed class TopicRow
    {
        public Guid Id { get; init; }
        public string Title { get; init; } = string.Empty;
        public string? Description { get; init; }
        public Guid SupervisorId { get; init; }
        public string SupervisorFirstName { get; init; } = string.Empty;
        public string SupervisorLastName { get; init; } = string.Empty;
        public string? SupervisorPatronymic { get; init; }
        public bool SupervisorIsActive { get; init; }
        public Guid DepartmentId { get; init; }
        public string DepartmentName { get; init; } = string.Empty;
        public string FacultyName { get; init; } = string.Empty;
        public TopicOrigin Origin { get; init; }
        public TopicStatus Status { get; init; }
        public TopicPartyRow? Holder { get; init; }
        public TopicPartyRow? Request { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime UpdatedAt { get; init; }
    }

    /// One party on a topic: the student who holds it, or the student asking for it.
    private sealed class TopicPartyRow
    {
        public Guid? ReservationId { get; init; }
        public Guid StudentProfileId { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;

        public string Name => LastName + " " + FirstName;
    }
}
