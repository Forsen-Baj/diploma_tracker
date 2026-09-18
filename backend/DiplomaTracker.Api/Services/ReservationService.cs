using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class ReservationService : IReservationService
{
    private readonly AppDbContext _dbContext;
    private readonly ITopicSettingsService _settings;
    private readonly ILogger<ReservationService> _logger;

    public ReservationService(AppDbContext dbContext, ITopicSettingsService settings, ILogger<ReservationService> logger)
    {
        _dbContext = dbContext;
        _settings = settings;
        _logger = logger;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student.Id);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .FirstOrDefaultAsync(t => t.Id == topicId);

        if (topic is null)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        // Checked before the origin filter below: a student's own proposal is never in the
        // catalogue, so filtering it out first would make this unreachable and a student
        // "reserving" the proposal they already hold would be told it does not exist.
        if (student.TopicId == topic.Id)
        {
            return (null, TopicErrors.TopicAlreadyYours);
        }

        if (topic.Origin != TopicOrigin.Catalogue)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (topic.DepartmentId != student.Group.DepartmentId)
        {
            return (null, TopicErrors.TopicNotInYourDepartment);
        }

        if (topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var now = DateTime.UtcNow;
        topic.Status = TopicStatus.Reserved;
        topic.UpdatedAt = now;

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Pending,
            CreatedAt = now
        };
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ProposeAsync(UserContext user, ProposeTopicRequest request)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student.Id);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var teacherIsValid = await _dbContext.Users.AnyAsync(u => u.Id == request.SupervisorId && u.Role == "Teacher" && u.IsActive);
        if (!teacherIsValid)
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = request.SupervisorId,
            DepartmentId = student.Group.DepartmentId,
            Origin = TopicOrigin.StudentProposal,
            Status = TopicStatus.Reserved,
            CreatedAt = now,
            UpdatedAt = now
        };

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Pending,
            CreatedAt = now
        };

        _dbContext.Topics.Add(topic);
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.ReservationAlreadyActive);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Pending);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        if (!reservation.Topic!.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var now = DateTime.UtcNow;

        // Approving a request from a student who already holds a topic is approving a change
        // request: the topic they are leaving goes back to the catalogue, or disappears if they
        // had proposed it.
        //
        // The release must be saved BEFORE the new reservation becomes Approved. Both rows are
        // keyed by the same student under IX_TopicReservations_ApprovedPerStudent, so doing both
        // in one SaveChanges transiently violates that index whenever EF emits the new row's
        // UPDATE before the old one's — which it is free to do, so the failure is intermittent
        // and surfaces as a bogus reservation.invalidState. The transaction keeps the pair
        // atomic: a student is never left between topics, and nothing commits unless both do.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        await ReleaseCurrentTopicAsync(reservation.StudentProfileId, now, null);
        var phase1Conflict = await SaveRequestAsync(reservation.StudentProfileId, TopicErrors.TopicNotAvailable);
        if (phase1Conflict is not null)
        {
            return (null, phase1Conflict);
        }

        reservation.Status = ReservationStatus.Approved;
        reservation.DecidedAt = now;
        reservation.Topic!.Status = TopicStatus.Approved;
        reservation.Topic.UpdatedAt = now;
        reservation.StudentProfile.TopicId = reservation.Topic.Id;
        reservation.StudentProfile.SupervisorId = reservation.Topic.SupervisorId;
        reservation.StudentProfile.UpdatedAt = now;

        var result = await SaveDecisionAsync(reservation.Id, user);
        if (result.error is null)
        {
            await transaction.CommitAsync();
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Pending);
        if (error is not null)
        {
            return (null, error);
        }

        var now = DateTime.UtcNow;
        reservation!.Status = ReservationStatus.Rejected;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (reservation.Status != ReservationStatus.Pending || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        // The deadline blocks cancelling a first reservation, but not withdrawing a change
        // request: a student who already holds a topic is revising, not still choosing.
        // Checked after the state, so cancelling a reservation that is not Pending is always
        // reported as an invalid state rather than a closed selection.
        if (!await _settings.IsSelectionOpenAsync()
            && !await HasApprovedReservationAsync(reservation.StudentProfileId))
        {
            return (null, TopicErrors.SelectionClosed);
        }

        var now = DateTime.UtcNow;
        reservation.Status = ReservationStatus.Cancelled;
        reservation.DecidedAt = now;
        ReturnOrRemoveTopic(reservation.Topic, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForDecisionAsync(reservationId);
        var error = CheckDecider(user, reservation, ReservationStatus.Approved);
        if (error is not null)
        {
            return (null, error);
        }

        var now = DateTime.UtcNow;
        reservation!.Status = ReservationStatus.Released;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        reservation.StudentProfile.TopicId = null;
        reservation.StudentProfile.SupervisorId = null;
        reservation.StudentProfile.UpdatedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await SaveDecisionAsync(reservation.Id, user);
    }

    /// <summary>
    /// The administrator's way of setting a student's topic outright, from the student form.
    /// It replaces rather than refuses: a request awaiting a decision is cancelled and a topic
    /// the student already holds is released, all in the same save, because a topic set by an
    /// administrator is a decision, not a request. A null <paramref name="topicId"/> clears the
    /// student's topic and supervisor.
    /// </summary>
    public async Task<(ReservationResponse? reservation, string? error)> SetStudentTopicAsync(Guid studentId, Guid? topicId, Guid administratorId)
    {
        var student = await _dbContext.StudentProfiles
            .Include(p => p.User)
            .Include(p => p.Group)
            .FirstOrDefaultAsync(p => p.Id == studentId && p.User.Role == "Student");

        if (student is null)
        {
            return (null, OnboardingErrors.StudentNotFound);
        }

        if (student.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var now = DateTime.UtcNow;

        Topic? topic = null;
        if (topicId is not null)
        {
            topic = await _dbContext.Topics
                .Include(t => t.Supervisor)
                .FirstOrDefaultAsync(t => t.Id == topicId.Value);

            // topicId is a request-body field, not a route id: an unknown value is 400, never
            // the 404 the same endpoint already uses for an unknown student id in the URL.
            if (topic is null)
            {
                return (null, TopicErrors.TopicInvalid);
            }

            if (topic.Id == student.TopicId)
            {
                return (null, TopicErrors.TopicAlreadyYours);
            }

            if (topic.DepartmentId != student.Group.DepartmentId)
            {
                return (null, TopicErrors.TopicNotInYourDepartment);
            }

            if (topic.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
            {
                return (null, TopicErrors.TopicNotAvailable);
            }
        }

        // Same two-phase rule as ApproveAsync, for the same reason: the row being released and
        // the row being created are both this student's under
        // IX_TopicReservations_ApprovedPerStudent, so what they displace must be saved before
        // the replacement is written. The transaction keeps the whole assignment atomic.
        //
        // ReleaseCurrentTopicAsync also clears the student's TopicId/SupervisorId as part of this
        // same save, so a released StudentProposal topic can be deleted here without leaving the
        // profile's FK pointing at a row that no longer exists.
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        await CancelPendingRequestAsync(student.Id, now);
        await ReleaseCurrentTopicAsync(student.Id, now, null);
        var phase1Conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (phase1Conflict is not null)
        {
            return (null, phase1Conflict);
        }

        if (topic is null)
        {
            student.TopicId = null;
            student.SupervisorId = null;
            student.UpdatedAt = now;
            var clearConflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
            if (clearConflict is not null)
            {
                return (null, clearConflict);
            }

            await transaction.CommitAsync();
            _logger.LogInformation(
                "Student topic cleared by administrator: StudentProfileId={StudentProfileId}, AdministratorId={AdministratorId}",
                student.Id,
                administratorId);
            return (null, null);
        }

        topic.Status = TopicStatus.Approved;
        topic.UpdatedAt = now;
        student.TopicId = topic.Id;
        student.SupervisorId = topic.SupervisorId;
        student.UpdatedAt = now;

        var reservation = new TopicReservation
        {
            Id = Guid.NewGuid(),
            TopicId = topic.Id,
            TopicTitle = topic.Title,
            StudentProfileId = student.Id,
            Status = ReservationStatus.Approved,
            CreatedAt = now,
            DecidedAt = now
        };
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        await transaction.CommitAsync();
        _logger.LogInformation(
            "Student topic assigned by administrator: StudentProfileId={StudentProfileId}, TopicId={TopicId}, AdministratorId={AdministratorId}",
            student.Id,
            topic.Id,
            administratorId);
        return (await LoadResponseAsync(reservation.Id, new UserContext(administratorId, "Admin")), null);
    }

    /// <summary>
    /// Withdraws a request awaiting a decision because an administrator has decided instead.
    /// A topic the student had proposed disappears with it; a catalogue topic goes back to
    /// <c>Available</c>. The caller saves.
    /// </summary>
    private async Task CancelPendingRequestAsync(Guid studentProfileId, DateTime now)
    {
        var pending = await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .FirstOrDefaultAsync(r => r.StudentProfileId == studentProfileId
                && r.Status == ReservationStatus.Pending);
        if (pending is null)
        {
            return;
        }

        pending.Status = ReservationStatus.Cancelled;
        pending.DecidedAt = now;

        if (pending.Topic is not null)
        {
            ReturnOrRemoveTopic(pending.Topic, now);
        }
    }

    public async Task<(IReadOnlyList<ReservationResponse>? reservations, string? error)> GetMineAsync(UserContext user)
    {
        var studentId = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == user.UserId)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync();

        if (studentId is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        // A student who already holds a topic may cancel a change request after the deadline —
        // the deadline governs choosing a topic, not revising the choice.
        var selectionOpen = await _settings.IsSelectionOpenAsync()
            || await HasApprovedReservationAsync(studentId.Value);
        var rows = await QueryRows(r => r.StudentProfileId == studentId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, selectionOpen && row.Status == ReservationStatus.Pending)).ToList(), null);
    }

    public async Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status)
    {
        // A teacher must be scoped by the topic's supervisor, which requires the topic to still
        // exist. An administrator needs no such scoping, so a declined or cancelled proposal
        // (its topic deleted by design — see ReturnOrRemoveTopic) is not filtered out of an
        // admin's history the way it would be from a teacher's.
        var rows = await QueryRows(r => r.Status == status
                && (user.IsAdmin || (r.Topic != null && r.Topic.SupervisorId == user.UserId)))
            .OrderBy(r => r.CreatedAt)
            .ToListAsync();

        return rows.Select(row => ToResponse(row, canCancel: false)).ToList();
    }

    private async Task<StudentProfile?> LoadStudentForActionAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles
            .Include(p => p.Group)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.UserId == userId && p.User.Role == "Student" && p.User.IsActive);
    }

    /// <summary>
    /// A student may ask for a topic whenever nothing of theirs is awaiting a decision. Already
    /// holding an approved topic is not an obstacle — such a request is a change request, and the
    /// selection deadline does not bind it: the deadline exists to make everyone choose
    /// something by a date, not to freeze the choice for the rest of the year.
    /// </summary>
    private async Task<string?> CheckStudentMayRequestAsync(Guid studentProfileId)
    {
        if (await HasPendingReservationAsync(studentProfileId))
        {
            return TopicErrors.ReservationAlreadyActive;
        }

        if (!await HasApprovedReservationAsync(studentProfileId) && !await _settings.IsSelectionOpenAsync())
        {
            return TopicErrors.SelectionClosed;
        }

        return null;
    }

    private Task<bool> HasPendingReservationAsync(Guid studentProfileId)
    {
        return _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && r.Status == ReservationStatus.Pending);
    }

    private Task<bool> HasApprovedReservationAsync(Guid studentProfileId)
    {
        return _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && r.Status == ReservationStatus.Approved);
    }

    /// <summary>
    /// Settles the approved topic a student is leaving behind: the reservation becomes
    /// <c>Released</c>, a catalogue topic returns to <c>Available</c> for someone else, and a
    /// topic the student had proposed is deleted, since a proposal never enters the catalogue.
    /// Called when a change request is approved, when an administrator assigns a topic over an
    /// existing one, and when a student holding a topic is archived. The caller saves.
    /// </summary>
    /// <remarks>
    /// Clears the student's <c>TopicId</c>/<c>SupervisorId</c> in the same pass as any topic
    /// deletion below (<see cref="ReturnOrRemoveTopic"/>): <c>StudentProfile.Topic</c> is mapped
    /// <c>DeleteBehavior.Restrict</c>, so a bare "delete the topic" statement with the profile
    /// still pointing at it fails the foreign key at the database. Nulling the FK on the tracked
    /// <see cref="StudentProfile"/> here — the same instance the caller has loaded, thanks to
    /// EF's identity resolution — makes the phase-1 save a complete settle. The caller re-sets
    /// both fields afterwards for the replacement topic, or leaves them cleared.
    /// </remarks>
    private async Task ReleaseCurrentTopicAsync(Guid studentProfileId, DateTime now, string? comment)
    {
        var current = await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .Include(r => r.StudentProfile)
            .FirstOrDefaultAsync(r => r.StudentProfileId == studentProfileId
                && r.Status == ReservationStatus.Approved);
        if (current is null)
        {
            return;
        }

        current.Status = ReservationStatus.Released;
        current.DecisionComment = comment;
        current.DecidedAt = now;
        current.StudentProfile.TopicId = null;
        current.StudentProfile.SupervisorId = null;
        current.StudentProfile.UpdatedAt = now;

        if (current.Topic is not null)
        {
            ReturnOrRemoveTopic(current.Topic, now);
        }
    }

    /// <summary>
    /// Cancels a pending request and releases an approved topic for a student who is being
    /// archived, so an archived profile is never left with a live reservation nobody can see —
    /// a topic's supervisor still lists it under <c>GET /api/reservations/pending</c> otherwise,
    /// and could approve it into a topic permanently held by an inactive account. Does not call
    /// <c>SaveChangesAsync</c> — the caller commits, in the same save as archiving the profile.
    /// Unlike the assignment paths, nothing new is created to replace what is settled here, so a
    /// single save is enough.
    /// </summary>
    public async Task SettleReservationsForArchiveAsync(Guid studentProfileId, DateTime now)
    {
        await CancelPendingRequestAsync(studentProfileId, now);
        await ReleaseCurrentTopicAsync(studentProfileId, now, null);
    }

    private async Task<TopicReservation?> LoadForDecisionAsync(Guid reservationId)
    {
        return await _dbContext.TopicReservations
            .Include(r => r.Topic).ThenInclude(t => t!.Supervisor)
            .Include(r => r.StudentProfile)
            .FirstOrDefaultAsync(r => r.Id == reservationId);
    }

    private static string? CheckDecider(UserContext user, TopicReservation? reservation, ReservationStatus requiredStatus)
    {
        if (reservation is null)
        {
            return TopicErrors.ReservationNotFound;
        }

        if (reservation.Topic is null)
        {
            return TopicErrors.ReservationInvalidState;
        }

        if (!user.IsAdmin && reservation.Topic.SupervisorId != user.UserId)
        {
            return TopicErrors.ReservationNotSupervisor;
        }

        return reservation.Status != requiredStatus ? TopicErrors.ReservationInvalidState : null;
    }

    private void ReturnOrRemoveTopic(Topic topic, DateTime now)
    {
        if (topic.Origin == TopicOrigin.StudentProposal)
        {
            _dbContext.Topics.Remove(topic);
            return;
        }

        topic.Status = TopicStatus.Available;
        topic.UpdatedAt = now;
    }

    private async Task<string?> SaveRequestAsync(Guid studentProfileId, string topicConflictError)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return topicConflictError;
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();

            // Which per-student index was hit decides the message, and only the *pending* one
            // can be: reserve and propose insert a Pending row, and the one path that inserts an
            // Approved row releases the previous one in the same save. Asking whether the student
            // has any active reservation would misreport the common change-request race — a
            // student who legitimately holds an approved topic and loses the race for the topic
            // they asked for would be told they already have a request, not that the topic went.
            return await HasPendingReservationAsync(studentProfileId)
                ? TopicErrors.ReservationAlreadyActive
                : topicConflictError;
        }
    }

    private async Task<(ReservationResponse? reservation, string? error)> SaveDecisionAsync(Guid reservationId, UserContext user)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return (null, TopicErrors.ReservationInvalidState);
        }

        return (await LoadResponseAsync(reservationId, user), null);
    }

    private async Task<ReservationResponse?> LoadResponseAsync(Guid reservationId, UserContext user)
    {
        var row = await QueryRows(r => r.Id == reservationId).FirstOrDefaultAsync();
        if (row is null)
        {
            return null;
        }

        // Mirrors GetMineAsync: a student who already holds an approved topic may cancel a
        // change request after the deadline, so a response returned straight from a write
        // (reserve, propose) must widen the same way GetMineAsync's list does, or a caller
        // driven off this response alone hides Cancel until the page reloads.
        var canCancel = user.IsStudent
            && row.Status == ReservationStatus.Pending
            && (await _settings.IsSelectionOpenAsync() || await HasApprovedReservationAsync(row.StudentProfileId));
        return ToResponse(row, canCancel);
    }

    private IQueryable<ReservationRow> QueryRows(System.Linq.Expressions.Expression<Func<TopicReservation, bool>> predicate)
    {
        return _dbContext.TopicReservations.AsNoTracking()
            .Where(predicate)
            .Select(r => new ReservationRow
            {
                Id = r.Id,
                TopicId = r.TopicId,
                TopicTitle = r.TopicTitle,
                TopicDescription = r.Topic != null ? r.Topic.Description : null,
                Origin = r.Topic != null ? (TopicOrigin?)r.Topic.Origin : null,
                SupervisorId = r.Topic != null ? (Guid?)r.Topic.SupervisorId : null,
                SupervisorLastName = r.Topic != null ? r.Topic.Supervisor.LastName : null,
                SupervisorFirstName = r.Topic != null ? r.Topic.Supervisor.FirstName : null,
                SupervisorPatronymic = r.Topic != null ? r.Topic.Supervisor.Patronymic : null,
                StudentProfileId = r.StudentProfileId,
                StudentLastName = r.StudentProfile.User.LastName,
                StudentFirstName = r.StudentProfile.User.FirstName,
                StudentPatronymic = r.StudentProfile.User.Patronymic,
                StudentEmail = r.StudentProfile.User.Email,
                GroupCode = r.StudentProfile.Group.Code,
                Status = r.Status,
                DecisionComment = r.DecisionComment,
                CreatedAt = r.CreatedAt,
                DecidedAt = r.DecidedAt,
                // The student's current topic, so a Pending row from a student who already
                // holds a different one can be told apart as a change request in ToResponse.
                StudentCurrentTopicId = r.StudentProfile.TopicId,
                StudentCurrentTopicTitle = r.StudentProfile.Topic != null ? r.StudentProfile.Topic.Title : null
            });
    }

    private static ReservationResponse ToResponse(ReservationRow row, bool canCancel)
    {
        static string JoinName(params string?[] parts) =>
            string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));

        var isChangeRequest = row.Status == ReservationStatus.Pending
            && row.StudentCurrentTopicId is not null
            && row.StudentCurrentTopicId != row.TopicId;

        return new ReservationResponse
        {
            Id = row.Id,
            TopicId = row.TopicId,
            TopicTitle = row.TopicTitle,
            TopicDescription = row.TopicDescription,
            Origin = row.Origin?.ToString(),
            SupervisorId = row.SupervisorId,
            SupervisorName = row.SupervisorId is null ? null : JoinName(row.SupervisorLastName, row.SupervisorFirstName, row.SupervisorPatronymic),
            StudentProfileId = row.StudentProfileId,
            StudentName = JoinName(row.StudentLastName, row.StudentFirstName, row.StudentPatronymic),
            StudentEmail = row.StudentEmail,
            GroupCode = row.GroupCode,
            Status = row.Status.ToString(),
            DecisionComment = row.DecisionComment,
            CreatedAt = row.CreatedAt,
            DecidedAt = row.DecidedAt,
            CanCancel = canCancel,
            // Only a pending request from a student who already holds a different topic is a
            // change request; everything else leaves these null.
            CurrentTopicId = isChangeRequest ? row.StudentCurrentTopicId : null,
            CurrentTopicTitle = isChangeRequest ? row.StudentCurrentTopicTitle : null
        };
    }

    private sealed class ReservationRow
    {
        public Guid Id { get; init; }
        public Guid? TopicId { get; init; }
        public string TopicTitle { get; init; } = string.Empty;
        public string? TopicDescription { get; init; }
        public TopicOrigin? Origin { get; init; }
        public Guid? SupervisorId { get; init; }
        public string? SupervisorLastName { get; init; }
        public string? SupervisorFirstName { get; init; }
        public string? SupervisorPatronymic { get; init; }
        public Guid StudentProfileId { get; init; }
        public string StudentLastName { get; init; } = string.Empty;
        public string StudentFirstName { get; init; } = string.Empty;
        public string? StudentPatronymic { get; init; }
        public string StudentEmail { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;
        public ReservationStatus Status { get; init; }
        public string? DecisionComment { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? DecidedAt { get; init; }

        /// <summary>
        /// The topic the student holds right now, projected from
        /// <c>StudentProfile.Topic</c>. <see cref="ToResponse"/> copies it into
        /// <c>CurrentTopicId</c>/<c>CurrentTopicTitle</c> only when this row is
        /// <c>Pending</c> and the held topic is a different one — that is, when the row is a
        /// change request — and leaves both null otherwise.
        /// </summary>
        public Guid? StudentCurrentTopicId { get; init; }
        public string? StudentCurrentTopicTitle { get; init; }
    }
}
