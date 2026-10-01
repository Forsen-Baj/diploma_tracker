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
    private readonly IReservationService _reservations;
    private readonly IStudentWorkflowService _workflow;
    private readonly ILogger<TopicService> _logger;

    public TopicService(AppDbContext dbContext, IReservationService reservations, IStudentWorkflowService workflow, ILogger<TopicService> logger)
    {
        _dbContext = dbContext;
        _reservations = reservations;
        _workflow = workflow;
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

            // The topic the student HOLDS comes from their profile; a topic they have REQUESTED is
            // their open reservation - Pending, or Returned to them for changes. Both stay visible
            // in the catalogue.
            var requestedTopicId = await _dbContext.TopicReservations.AsNoTracking()
                .Where(r => r.StudentProfileId == student.Id
                    && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned))
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

            // Design 2026-09-27 §4.1: a topic's department is its direction's.
            topics = topics.Where(t =>
                ownTopicIds.Contains(t.Id)
                || (t.Direction.DepartmentId == student.DepartmentId
                    && t.Origin == TopicOrigin.Catalogue
                    && t.Status == TopicStatus.Available
                    && t.Supervisor.IsActive));
        }
        else if (user.IsTeacher)
        {
            // Phase 12 §4.2: acting as teacher, the topics they supervise.
            topics = topics.Where(t => t.SupervisorId == user.UserId);
        }
        else if (user.IsDirectionManager)
        {
            // §5.4: acting as direction manager, every topic in their directions, at any status.
            topics = topics.Where(t => t.Direction.ManagerId == user.UserId);
        }
        else if (!user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // Escape SQL Server's own LIKE wildcards before they reach Contains(), which
            // translates to LIKE '%...%': unescaped, a search for "50%" or "a_b" would match
            // as a pattern instead of literal text.
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

        if (query.DirectionId is not null)
        {
            topics = topics.Where(t => t.DirectionId == query.DirectionId);
        }

        if (user.IsAdmin && query.DepartmentId is not null)
        {
            topics = topics.Where(t => t.Direction.DepartmentId == query.DepartmentId);
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

        if (!user.IsAdmin && !user.IsStudent && !Manages(user, row.SupervisorId, row.DirectionManagerId))
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
        var direction = await _dbContext.Directions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == request.DirectionId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var (supervisorId, supervisorError) = ChooseSupervisor(user, direction.ManagerId, request.SupervisorId, current: null);
        if (supervisorError is not null)
        {
            return (null, supervisorError);
        }

        // Phase 12 §4: a catalogue topic's supervisor covers its department. A teacher publishing
        // outside their own role's reach is told so; anyone else named is not a valid choice.
        if (supervisorId is null || !await _dbContext.CoversDepartmentAsync(supervisorId.Value, StaffRole.Teacher, direction.DepartmentId))
        {
            return (null, user.IsTeacher && supervisorId == user.UserId ? RoleErrors.NotCovered : TopicErrors.TopicSupervisorInvalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = supervisorId.Value,
            DirectionId = direction.Id,
            CreatedById = user.UserId,
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
        var topic = await _dbContext.Topics
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == id);
        var accessError = CheckUpdatable(user, topic);
        if (accessError is not null)
        {
            return (null, accessError);
        }

        var editable = topic!;

        // §4.3: only an administrator moves a topic to another direction.
        if (request.DirectionId != editable.DirectionId && !user.IsAdmin)
        {
            return (null, CommonErrors.Forbidden);
        }

        var direction = request.DirectionId == editable.DirectionId
            ? editable.Direction
            : await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == request.DirectionId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var (supervisorId, supervisorError) = ChooseSupervisor(user, editable.Direction.ManagerId, request.SupervisorId, editable.SupervisorId);
        if (supervisorError is not null)
        {
            return (null, supervisorError);
        }

        if (supervisorId is null)
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }

        // Phase 12 §4: coverage is checked for what is taken on - a new supervisor, or the topic moving
        // to another department. Work already held is not re-checked.
        if ((supervisorId != editable.SupervisorId || direction.DepartmentId != editable.Direction.DepartmentId)
            && !await _dbContext.CoversDepartmentAsync(supervisorId.Value, StaffRole.Teacher, direction.DepartmentId))
        {
            return (null, TopicErrors.TopicSupervisorInvalid);
        }

        var now = DateTime.UtcNow;
        var supervisorChanged = supervisorId != editable.SupervisorId;
        var directionChanged = direction.Id != editable.DirectionId;
        var stepsTouched = false;

        // An administrator may move a topic that a student already holds to another supervisor or
        // direction. The student's supervisor moves with it, in this same save, so the topic and
        // the student never disagree about who supervises the work. A Reserved topic's requester is
        // left alone: the student profile is written only when the request completes (§5.2), and
        // ReservationService.CompleteAsync then copies the topic's supervisor.
        if ((supervisorChanged || directionChanged) && editable.Status == TopicStatus.Approved)
        {
            var holder = await _dbContext.StudentProfiles.FirstOrDefaultAsync(p => p.TopicId == editable.Id);
            if (holder is not null)
            {
                if (supervisorChanged)
                {
                    holder.SupervisorId = supervisorId;
                    holder.UpdatedAt = now;
                }

                // §4.2: the supervisor and direction-manager seats of the holder's unfinished steps
                // move now; a Submitted step the new seats already satisfy is approved in this save.
                var newSupervisorId = supervisorId;
                var newManagerId = direction.ManagerId;
                stepsTouched = await _workflow.RefreshStudentPanelsAsync([holder.Id], now,
                    facts => facts with { SupervisorId = newSupervisorId, DirectionManagerId = newManagerId });
            }
        }

        var title = request.Title.Trim();
        var description = IdentityNormalizer.Optional(request.Description);

        // Design 2026-09-27 §5.3: while a request waits for approvals, a change of wording counts
        // as the editor's approval and every other seat must approve the new wording. Only an
        // administrator reaches here for a Reserved topic - teachers edit available topics only.
        // After approval nothing reopens.
        TopicReservation? open = null;
        if ((title != editable.Title || description != editable.Description) && editable.Status == TopicStatus.Reserved)
        {
            open = await _dbContext.TopicReservations
                .FirstOrDefaultAsync(r => r.TopicId == editable.Id && r.Status == ReservationStatus.Pending);
            if (open is not null)
            {
                open.ContentChangedAt = now;
                _dbContext.ReservationDecisions.Add(new ReservationDecision
                {
                    Id = Guid.NewGuid(),
                    ReservationId = open.Id,
                    DeciderId = user.UserId,
                    DeciderWasAdministrator = user.IsAdmin,
                    Kind = ReservationDecisionKind.Edited,
                    DecidedAt = now
                });
            }
        }

        editable.Title = title;
        editable.Description = description;
        editable.DirectionId = direction.Id;
        editable.SupervisorId = supervisorId.Value;
        editable.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException exception)
        {
            // A lost RowVersion race on a step whose panel moved is panel.changed. On the topic it is
            // reservation.changed when this edit acted on the open request (an Edited decision),
            // otherwise topic.notAvailable, not topic.notEditable.
            _dbContext.ChangeTracker.Clear();
            return (null, stepsTouched && exception.Entries.Any(e => e.Entity is StudentTask)
                ? WorkflowErrors.PanelChanged
                : open is not null ? TopicErrors.ReservationChanged : TopicErrors.TopicNotAvailable);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Updated", "Topic", editable.Id);

        // §5.2: the new supervisor or the new direction's manager may already have approved the
        // current wording, which would complete the request now.
        if ((supervisorChanged || directionChanged) && editable.Status == TopicStatus.Reserved)
        {
            await _reservations.CompleteSatisfiedRequestsAsync([editable.Id]);
        }

        return await GetTopicAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteTopicAsync(UserContext user, Guid id)
    {
        var topic = await _dbContext.Topics
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == id);
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

    /// Phase 12 §4: the teachers a picker offers. A student's proposal names one who covers the
    /// student's group; a topic form one who covers the direction's department; with neither, every
    /// active staff member holding the teacher role (a template's named audience).
    public async Task<IReadOnlyList<SupervisorOption>> GetSupervisorsAsync(UserContext user, Guid? departmentId)
    {
        IQueryable<Guid> teachers;
        if (user.IsStudent)
        {
            var groupId = await _dbContext.StudentProfiles.AsNoTracking()
                .Where(p => p.UserId == user.UserId)
                .Select(p => (Guid?)p.GroupId)
                .FirstOrDefaultAsync();
            if (groupId is null)
            {
                return [];
            }

            teachers = _dbContext.CoveringGroup(StaffRole.Teacher, groupId.Value).Select(a => a.UserId);
        }
        else if (departmentId is { } department)
        {
            teachers = _dbContext.CoveringDepartment(StaffRole.Teacher, department).Select(a => a.UserId);
        }
        else
        {
            teachers = _dbContext.RoleAssignments.Where(a => a.Role == StaffRole.Teacher).Select(a => a.UserId);
        }

        var rows = await _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && u.Role == AccountRoles.Staff && teachers.Contains(u.Id))
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .ToListAsync();

        return rows.Select(t => new SupervisorOption(t.Id, PersonName.Full(t))).ToList();
    }

    /// §4.3, phase 12 §5: acting as teacher, a teacher supervises what they create; acting as
    /// direction manager, a manager names any teacher under their own direction (themselves when they
    /// name nobody); an administrator names anyone. `current` is the topic's supervisor on an edit and
    /// null on a create.
    private static (Guid? id, string? error) ChooseSupervisor(UserContext user, Guid directionManagerId, Guid? requested, Guid? current)
    {
        if (user.IsAdmin)
        {
            return (requested ?? current, null);
        }

        if (user.IsDirectionManager)
        {
            return directionManagerId == user.UserId
                ? (requested ?? current ?? user.UserId, null)
                : (null, DirectionErrors.NotManager);
        }

        var unchanged = current ?? user.UserId;
        return requested is null || requested == unchanged
            ? (unchanged, null)
            : (null, DirectionErrors.NotManager);
    }

    /// Editing: an administrator may amend any topic at any status. The supervisor or the
    /// direction's manager may amend an available catalogue topic only; once a student asks for
    /// it, wording changes go through the request (design 2026-09-27 §5.3).
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

    /// Deleting stays restricted to available catalogue topics for everyone, administrators
    /// included: removing a topic a student is working on would strand them. Release it first.
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
        if (topic is null)
        {
            return TopicErrors.TopicNotFound;
        }

        if (user.IsAdmin)
        {
            return null;
        }

        if (!user.IsTeacher && !user.IsDirectionManager)
        {
            return CommonErrors.Forbidden;
        }

        return Manages(user, topic.SupervisorId, topic.Direction.ManagerId)
            ? null
            : TopicErrors.TopicNotOwner;
    }

    /// Phase 12 §5: a topic is a teacher's to manage when they supervise it, a direction manager's when
    /// it lies in their direction - each in their own acting role; an administrator manages every topic.
    private static bool Manages(UserContext user, Guid supervisorId, Guid directionManagerId) =>
        user.IsAdmin
        || (user.IsTeacher && supervisorId == user.UserId)
        || (user.IsDirectionManager && directionManagerId == user.UserId);

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

        var manages = Manages(user, row.SupervisorId, row.DirectionManagerId);
        var availableCatalogue = row.Origin == TopicOrigin.Catalogue && row.Status == TopicStatus.Available;

        return new TopicResponse
        {
            Id = row.Id,
            Title = row.Title,
            Description = row.Description,
            SupervisorId = row.SupervisorId,
            SupervisorName = PersonName.Full(row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic),
            DepartmentId = row.DepartmentId,
            DepartmentName = row.DepartmentName,
            FacultyName = row.FacultyName,
            DirectionId = row.DirectionId,
            DirectionName = row.DirectionName,
            DirectionManagerId = row.DirectionManagerId,
            DirectionManagerName = PersonName.Full(row.DirectionManagerLastName, row.DirectionManagerFirstName, row.DirectionManagerPatronymic),
            Origin = row.Origin.ToString(),
            Status = row.Status.ToString(),
            ActiveReservationId = party?.ReservationId,
            ActiveReservationStatus = party?.Status.ToString(),
            StudentProfileId = showStudent ? party?.StudentProfileId : null,
            StudentName = showStudent ? party?.Name : null,
            GroupCode = showStudent ? party?.GroupCode : null,
            // O1: only meaningful for the holder (release action) - an open request has nothing
            // to submit against yet, so it is always false there.
            HasSubmissions = row.Holder?.HasSubmissions ?? false,
            CanEdit = user.IsAdmin || (manages && availableCatalogue),
            CanDelete = manages && availableCatalogue,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt
        };
    }

    /// The holder comes from StudentProfile.TopicId - the source of truth - and the open request
    /// from TopicReservations, which is what a request actually is. Each is projected as one
    /// nested object, so SQL Server plans two OUTER APPLYs instead of a scalar subquery per field.
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
        DepartmentId = t.Direction.DepartmentId,
        DepartmentName = t.Direction.Department.Name,
        FacultyName = t.Direction.Department.Faculty.Name,
        DirectionId = t.DirectionId,
        DirectionName = t.Direction.Name,
        DirectionManagerId = t.Direction.ManagerId,
        DirectionManagerFirstName = t.Direction.Manager.FirstName,
        DirectionManagerLastName = t.Direction.Manager.LastName,
        DirectionManagerPatronymic = t.Direction.Manager.Patronymic,
        Origin = t.Origin,
        Status = t.Status,
        Holder = t.Holders
            .Select(p => new TopicPartyRow
            {
                ReservationId = p.TopicReservations
                    .Where(r => r.Status == ReservationStatus.Approved)
                    .Select(r => (Guid?)r.Id)
                    .FirstOrDefault(),
                Status = ReservationStatus.Approved,
                StudentProfileId = p.Id,
                LastName = p.User.LastName,
                FirstName = p.User.FirstName,
                GroupCode = p.Group.Code,
                HasSubmissions = p.StudentTasks.Any(st => st.Submissions.Any())
            })
            .FirstOrDefault(),
        Request = t.Reservations
            .Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned)
            .Select(r => new TopicPartyRow
            {
                ReservationId = r.Id,
                Status = r.Status,
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
        public Guid DirectionId { get; init; }
        public string DirectionName { get; init; } = string.Empty;
        public Guid DirectionManagerId { get; init; }
        public string DirectionManagerFirstName { get; init; } = string.Empty;
        public string DirectionManagerLastName { get; init; } = string.Empty;
        public string? DirectionManagerPatronymic { get; init; }
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
        public ReservationStatus Status { get; init; }
        public Guid StudentProfileId { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;
        public bool HasSubmissions { get; init; }

        public string Name => LastName + " " + FirstName;
    }
}
