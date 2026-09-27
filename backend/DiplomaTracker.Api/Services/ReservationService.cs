using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §5. A request holds its topic while it is open (Pending or Returned). It
/// becomes the student's topic the moment an administrator, the direction's manager and the
/// supervisor have all approved the current wording; TopicApprovalPanel decides that from the
/// ReservationDecision rows. StudentProfile.TopicId stays the single source of truth for which topic
/// a student holds - it is written only when a request completes.
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

    // ---------- the student's requests ----------

    public async Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId)
    {
        var student = await LoadStudentForActionAsync(user.UserId);
        if (student is null)
        {
            return (null, TopicErrors.StudentProfileRequired);
        }

        var precondition = await CheckStudentMayRequestAsync(student);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        var topic = await _dbContext.Topics
            .Include(t => t.Supervisor)
            .Include(t => t.Direction)
            .FirstOrDefaultAsync(t => t.Id == topicId);

        if (topic is null || topic.Origin != TopicOrigin.Catalogue)
        {
            return (null, TopicErrors.TopicNotFound);
        }

        if (topic.Direction.DepartmentId != student.Group.DepartmentId)
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

        var reservation = NewRequest(topic, student, now);
        _dbContext.TopicReservations.Add(reservation);

        // Nobody holds all three seats, so a request made by a student never completes at once.
        await AddCreatorApprovalAsync(reservation, topic, now);

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

        var precondition = await CheckStudentMayRequestAsync(student);
        if (precondition is not null)
        {
            return (null, precondition);
        }

        if (!await _dbContext.Users.AnyAsync(u => u.Id == request.SupervisorId && u.Role == "Teacher" && u.IsActive))
        {
            return (null, TopicErrors.ProposalTeacherInvalid);
        }

        // §4.3: a proposal names a direction of the student's own department.
        var direction = await _dbContext.Directions
            .FirstOrDefaultAsync(d => d.Id == request.DirectionId && d.DepartmentId == student.Group.DepartmentId);
        if (direction is null)
        {
            return (null, DirectionErrors.Invalid);
        }

        var now = DateTime.UtcNow;
        var topic = new Topic
        {
            Id = Guid.NewGuid(),
            Title = request.Title.Trim(),
            Description = IdentityNormalizer.Optional(request.Description),
            SupervisorId = request.SupervisorId,
            DirectionId = direction.Id,
            Direction = direction,
            Origin = TopicOrigin.StudentProposal,
            Status = TopicStatus.Reserved,
            CreatedAt = now,
            UpdatedAt = now
        };

        // A proposal's creator is the student, who holds no seat: it starts with no approvals.
        var reservation = NewRequest(topic, student, now);
        _dbContext.Topics.Add(topic);
        _dbContext.TopicReservations.Add(reservation);

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.ReservationAlreadyActive);
        return conflict is not null ? (null, conflict) : (await LoadResponseAsync(reservation.Id, user), null);
    }

    /// §5.3: the returned student edits the wording - a catalogue topic's too - and sends the
    /// request again. Every approval must then be given again, the creator's included.
    public async Task<(ReservationResponse? reservation, string? error)> ResubmitAsync(UserContext user, Guid reservationId, WordingRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (reservation.Status != ReservationStatus.Returned || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Topic.Title = request.Title.Trim();
        reservation.Topic.Description = IdentityNormalizer.Optional(request.Description);
        reservation.Topic.UpdatedAt = now;
        reservation.ContentChangedAt = now;
        reservation.Status = ReservationStatus.Pending;

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Resubmitted", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForActionAsync(reservationId);
        if (reservation is null)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        if (reservation.StudentProfile.UserId != user.UserId)
        {
            return (null, TopicErrors.ReservationNotYours);
        }

        if (!IsOpen(reservation.Status) || reservation.Topic is null)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        // The deadline blocks cancelling a first request, but not one made while the student
        // already holds a topic. Checked after the state, so cancelling a closed request is always
        // reported as an invalid state rather than a closed selection.
        if (!await _settings.IsSelectionOpenAsync()
            && !await HasApprovedReservationAsync(reservation.StudentProfileId))
        {
            return (null, TopicErrors.SelectionClosed);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Status = ReservationStatus.Cancelled;
        reservation.DecidedAt = now;
        CloseWithoutApproval(reservation, now);

        return await CommitAsync(transaction, reservation.Id, user);
    }

    // ---------- the approvers ----------

    public async Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (seats, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        if (!TopicApprovalPanel.HasOpenSeat(Evaluate(reservation), seats))
        {
            return (null, TopicErrors.ApprovalSeatSatisfied);
        }

        if (!reservation.Topic!.Supervisor.IsActive)
        {
            return (null, TopicErrors.TopicNotAvailable);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        var decision = AddDecision(reservation, user, ReservationDecisionKind.Approved, null, now);
        reservation.Topic.UpdatedAt = now;

        var completes = Evaluate(reservation, decision).IsComplete;
        if (completes)
        {
            var completeError = await CompleteAsync(reservation, now);
            if (completeError is not null)
            {
                return (null, completeError);
            }
        }

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, completes ? "Completed" : "Approved", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReturnAsync(UserContext user, Guid reservationId, ReturnReservationRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (seats, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        // A return is an approver's decision in an open seat, like an approval (§5.3).
        if (!TopicApprovalPanel.HasOpenSeat(Evaluate(reservation), seats))
        {
            return (null, TopicErrors.ApprovalSeatSatisfied);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        AddDecision(reservation, user, ReservationDecisionKind.Returned, request.Comment.Trim(), now);
        reservation.Status = ReservationStatus.Returned;
        reservation.Topic!.UpdatedAt = now;

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Returned", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (!IsOpen(reservation!.Status))
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        var now = DateTime.UtcNow;
        var comment = IdentityNormalizer.Optional(request.Comment);
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        AddDecision(reservation, user, ReservationDecisionKind.Rejected, comment, now);
        reservation.Status = ReservationStatus.Rejected;
        reservation.DecisionComment = comment;
        reservation.DecidedAt = now;
        CloseWithoutApproval(reservation, now);

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Rejected", reservationId);
        }

        return result;
    }

    /// §5.3: an approver edits the wording while the request waits. The edit is their approval,
    /// and every other seat must approve the new wording. It never completes the request: nobody
    /// holds all three seats, so at least one is left open.
    public async Task<(ReservationResponse? reservation, string? error)> EditWordingAsync(UserContext user, Guid reservationId, WordingRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Pending)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        if (reservation.StudentProfile.ArchivedAt is not null)
        {
            return (null, OnboardingErrors.StudentArchived);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Topic!.Title = request.Title.Trim();
        reservation.Topic.Description = IdentityNormalizer.Optional(request.Description);
        reservation.Topic.UpdatedAt = now;
        reservation.ContentChangedAt = now;
        AddDecision(reservation, user, ReservationDecisionKind.Edited, null, now);

        var result = await CommitAsync(transaction, reservation.Id, user);
        if (result.error is null)
        {
            SecurityLog.TopicRequestAction(_logger, user.UserId, "Edited", reservationId);
        }

        return result;
    }

    public async Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request)
    {
        var reservation = await LoadForActionAsync(reservationId);
        var (_, error) = CheckApprover(user, reservation);
        if (error is not null)
        {
            return (null, error);
        }

        if (reservation!.Status != ReservationStatus.Approved)
        {
            return (null, TopicErrors.ReservationInvalidState);
        }

        // O1: a topic cannot be taken away once the student has submitted a step.
        if (await HasSubmissionsAsync(reservation.StudentProfileId))
        {
            return (null, TopicErrors.ReservationHasSubmissions);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        reservation.Status = ReservationStatus.Released;
        reservation.DecisionComment = IdentityNormalizer.Optional(request.Comment);
        reservation.DecidedAt = now;
        reservation.StudentProfile.TopicId = null;
        reservation.StudentProfile.SupervisorId = null;
        reservation.StudentProfile.UpdatedAt = now;
        ReturnOrRemoveTopic(reservation.Topic!, now);

        return await CommitAsync(transaction, reservation.Id, user);
    }

    /// <summary>
    /// The administrator's assignment from the student form (§5.3). Whatever the student had asked
    /// for is withdrawn, and a new request is made carrying the administrator's approval and the
    /// topic creator's. A topic the student already holds stays theirs until the new request
    /// completes, which may be at once when the creator's seats cover the rest. A null
    /// <paramref name="topicId"/> clears the student's topic and supervisor at once, as before.
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

        // O1: only a removal to "no topic" is guarded; replacing the topic stays allowed.
        if (topicId is null && student.TopicId is not null && await HasSubmissionsAsync(student.Id))
        {
            return (null, TopicErrors.ReservationHasSubmissions);
        }

        Topic? topic = null;
        if (topicId is not null)
        {
            topic = await _dbContext.Topics
                .Include(t => t.Supervisor)
                .Include(t => t.Direction)
                .FirstOrDefaultAsync(t => t.Id == topicId.Value);

            // topicId is a request-body field: an unknown value is 400, never the 404 the same
            // endpoint uses for an unknown student id in the URL.
            if (topic is null)
            {
                return (null, TopicErrors.TopicInvalid);
            }

            if (topic.Id == student.TopicId)
            {
                return (null, TopicErrors.TopicAlreadyYours);
            }

            if (topic.Direction.DepartmentId != student.Group.DepartmentId)
            {
                return (null, TopicErrors.TopicNotInYourDepartment);
            }

            if (topic.Origin != TopicOrigin.Catalogue || topic.Status != TopicStatus.Available || !topic.Supervisor.IsActive)
            {
                return (null, TopicErrors.TopicNotAvailable);
            }
        }

        var now = DateTime.UtcNow;
        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        await CancelOpenRequestAsync(student.Id, now);

        if (topic is null)
        {
            await ReleaseCurrentTopicAsync(student.Id, now, null);
            student.TopicId = null;
            student.SupervisorId = null;
            student.UpdatedAt = now;

            var clearConflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
            if (clearConflict is not null)
            {
                return (null, clearConflict);
            }

            await transaction.CommitAsync();
            SecurityLog.TopicAssigned(_logger, student.Id, administratorId, null);
            return (null, null);
        }

        // Two phases, as everywhere a student's reservation is replaced: the withdrawn request is
        // saved before the new open one is inserted under IX_TopicReservations_OpenPerStudent,
        // because EF picks its own statement order within one save.
        var phase1Conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (phase1Conflict is not null)
        {
            return (null, phase1Conflict);
        }

        topic.Status = TopicStatus.Reserved;
        topic.UpdatedAt = now;
        var reservation = NewRequest(topic, student, now);
        _dbContext.TopicReservations.Add(reservation);

        var administration = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = administratorId,
            DeciderWasAdministrator = true,
            Kind = ReservationDecisionKind.Approved,
            DecidedAt = now
        };
        _dbContext.ReservationDecisions.Add(administration);

        // The administrator's row already fills the Administration seat, so a creator whose only
        // seat is that one - any administrator, this one included - adds no second row.
        var creator = await AddCreatorApprovalAsync(reservation, topic, now, administrationFilled: true);

        var added = creator is null ? new[] { administration } : new[] { administration, creator };
        if (Evaluate(reservation, added).IsComplete)
        {
            var completeError = await CompleteAsync(reservation, now);
            if (completeError is not null)
            {
                return (null, completeError);
            }
        }

        var conflict = await SaveRequestAsync(student.Id, TopicErrors.TopicNotAvailable);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        await transaction.CommitAsync();
        SecurityLog.TopicAssigned(_logger, student.Id, administratorId, topic.Id);

        _dbContext.ChangeTracker.Clear();
        return (await LoadResponseAsync(reservation.Id, new UserContext(administratorId, "Admin")), null);
    }

    public async Task CompleteSatisfiedRequestsAsync(IReadOnlyCollection<Guid> topicIds)
    {
        if (topicIds.Count == 0)
        {
            return;
        }

        var ids = await _dbContext.TopicReservations.AsNoTracking()
            .Where(r => r.TopicId != null && topicIds.Contains(r.TopicId.Value) && r.Status == ReservationStatus.Pending)
            .Select(r => r.Id)
            .ToListAsync();

        foreach (var id in ids)
        {
            _dbContext.ChangeTracker.Clear();
            var reservation = await LoadForActionAsync(id);
            if (reservation?.Topic is null
                || reservation.StudentProfile.ArchivedAt is not null
                || !Evaluate(reservation).IsComplete)
            {
                continue;
            }

            var now = DateTime.UtcNow;
            await using var transaction = await _dbContext.Database.BeginTransactionAsync();
            if (await CompleteAsync(reservation, now) is not null)
            {
                continue;
            }

            reservation.Topic.UpdatedAt = now;
            try
            {
                await _dbContext.SaveChangesAsync();
                await transaction.CommitAsync();
                SecurityLog.TopicRequestAction(_logger, Guid.Empty, "Completed", id);
            }
            catch (DbUpdateException)
            {
                // Someone acted on the request at the same moment; their own save decides it.
                _dbContext.ChangeTracker.Clear();
            }
        }

        _dbContext.ChangeTracker.Clear();
    }

    /// Cancels an open request and releases an approved topic for a student who is being
    /// archived, so an archived profile never keeps a live reservation. Does not save - the caller
    /// commits, in the same save as archiving the profile.
    public async Task SettleReservationsForArchiveAsync(Guid studentProfileId, DateTime now)
    {
        await CancelOpenRequestAsync(studentProfileId, now);
        await ReleaseCurrentTopicAsync(studentProfileId, now, null);
    }

    // ---------- reads ----------

    public async Task<(ReservationResponse? reservation, string? error)> GetAsync(UserContext user, Guid reservationId)
    {
        var row = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.Id == reservationId))
            .FirstOrDefaultAsync();

        var visible = row is not null
            && (user.IsAdmin
                || (user.IsStudent && row.StudentUserId == user.UserId)
                || (user.IsTeacher && (row.SupervisorId == user.UserId || row.DirectionManagerId == user.UserId)));

        if (!visible)
        {
            return (null, TopicErrors.ReservationNotFound);
        }

        return (await ToResponseAsync(row!, user), null);
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

        // A student who already holds a topic may cancel an open request after the deadline - the
        // deadline governs choosing a topic, not revising the choice.
        var selectionOpen = await _settings.IsSelectionOpenAsync() || await HasApprovedReservationAsync(studentId.Value);
        var rows = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.StudentProfileId == studentId))
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return (rows.Select(row => ToResponse(row, user, selectionOpen && IsOpen(row.Status))).ToList(), null);
    }

    /// §5.4. "Pending" asks for every open request - those waiting for approvers and those returned
    /// to the student. A teacher sees requests for topics they supervise and, as a direction
    /// manager, every request in their directions. An administrator sees them all, including the
    /// history of proposals whose topic was deleted by design.
    public async Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status, bool waitingForMe)
    {
        var me = user.UserId;
        IQueryable<TopicReservation> query = _dbContext.TopicReservations.AsNoTracking();

        query = status is ReservationStatus.Pending or ReservationStatus.Returned
            ? query.Where(r => r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned)
            : query.Where(r => r.Status == status);

        if (!user.IsAdmin)
        {
            query = query.Where(r => r.Topic != null && (r.Topic.SupervisorId == me || r.Topic.Direction.ManagerId == me));
        }

        var rows = await Project(query).OrderBy(r => r.CreatedAt).ToListAsync();
        var responses = rows.Select(row => ToResponse(row, user, canCancel: false));
        return (waitingForMe ? responses.Where(r => r.CanDecide) : responses).ToList();
    }

    // ---------- helpers ----------

    private static bool IsOpen(ReservationStatus status) =>
        status is ReservationStatus.Pending or ReservationStatus.Returned;

    private static TopicReservation NewRequest(Topic topic, StudentProfile student, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        TopicId = topic.Id,
        Topic = topic,
        TopicTitle = topic.Title,
        TopicDescription = topic.Description,
        StudentProfileId = student.Id,
        StudentProfile = student,
        Status = ReservationStatus.Pending,
        CreatedAt = now,
        ContentChangedAt = now
    };

    private ReservationDecision AddDecision(TopicReservation reservation, UserContext user, ReservationDecisionKind kind, string? comment, DateTime now)
    {
        var decision = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = user.UserId,
            DeciderWasAdministrator = user.IsAdmin,
            Kind = kind,
            Comment = comment,
            DecidedAt = now
        };

        // Added through its DbSet, never only through the tracked parent's collection: a child with
        // a preset key reached through a navigation is taken for an existing row (PROJECT_MEMORY).
        _dbContext.ReservationDecisions.Add(decision);
        return decision;
    }

    /// §5.2: the topic's creator has already approved it in every seat they hold - a teacher who
    /// supervises what they created, a direction manager in their own direction, an administrator.
    /// Only an active creator counts. Returns the row, or null when the creator holds no seat, or
    /// holds only the Administration seat and <paramref name="administrationFilled"/> says an
    /// administrator's approval is already written.
    private async Task<ReservationDecision?> AddCreatorApprovalAsync(TopicReservation reservation, Topic topic, DateTime now, bool administrationFilled = false)
    {
        if (topic.CreatedById is not { } creatorId)
        {
            return null;
        }

        var creator = await _dbContext.Users.AsNoTracking()
            .Where(u => u.Id == creatorId && u.IsActive)
            .Select(u => new { u.Role })
            .FirstOrDefaultAsync();
        if (creator is null)
        {
            return null;
        }

        var isAdministrator = creator.Role == "Admin";
        var holdsTeachingSeat = creatorId == topic.SupervisorId || creatorId == topic.Direction.ManagerId;
        var holdsSeat = (isAdministrator && !administrationFilled) || holdsTeachingSeat;
        if (!holdsSeat)
        {
            return null;
        }

        var decision = new ReservationDecision
        {
            Id = Guid.NewGuid(),
            ReservationId = reservation.Id,
            DeciderId = creatorId,
            DeciderWasAdministrator = isAdministrator,
            Kind = ReservationDecisionKind.Approved,
            DecidedAt = now
        };
        _dbContext.ReservationDecisions.Add(decision);
        return decision;
    }

    /// The seats of a loaded request, counting decisions just added in this unit of work. EF may
    /// or may not have fixed them up into reservation.Decisions yet, hence the de-duplication.
    private static TopicApprovalPanel.State Evaluate(TopicReservation reservation, params ReservationDecision[] added)
    {
        var decisions = reservation.Decisions
            .Concat(added)
            .DistinctBy(d => d.Id)
            .Select(d => new TopicApprovalPanel.DecisionFact(d.DeciderId, d.DeciderWasAdministrator, d.Kind, d.DecidedAt))
            .ToList();

        return TopicApprovalPanel.Evaluate(reservation.Topic!.SupervisorId, reservation.Topic.Direction.ManagerId, reservation.ContentChangedAt, decisions);
    }

    /// §5.2: every seat is satisfied - the request becomes the student's topic. A topic the student
    /// already holds is released first, in its own save inside the caller's transaction: both rows
    /// belong to the same student under IX_TopicReservations_ApprovedPerStudent, and one save
    /// would transiently violate it whenever EF emits the new row's UPDATE first.
    private async Task<string?> CompleteAsync(TopicReservation reservation, DateTime now)
    {
        await ReleaseCurrentTopicAsync(reservation.StudentProfileId, now, null);

        // The student always has this very request open here, so a unique violation in phase 1 is
        // a lost race, never "you already have a request": both conflicts are reservation.changed.
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return TopicErrors.ReservationChanged;
        }

        reservation.Status = ReservationStatus.Approved;
        reservation.DecidedAt = now;
        reservation.Topic!.Status = TopicStatus.Approved;
        reservation.Topic.UpdatedAt = now;
        reservation.StudentProfile.TopicId = reservation.Topic.Id;
        reservation.StudentProfile.SupervisorId = reservation.Topic.SupervisorId;
        reservation.StudentProfile.UpdatedAt = now;
        return null;
    }

    private static (IReadOnlyList<TopicApprovalPanel.Seat> seats, string? error) CheckApprover(UserContext user, TopicReservation? reservation)
    {
        if (reservation is null)
        {
            return ([], TopicErrors.ReservationNotFound);
        }

        if (reservation.Topic is null)
        {
            return ([], TopicErrors.ReservationInvalidState);
        }

        var seats = TopicApprovalPanel.SeatsOf(user, reservation.Topic.SupervisorId, reservation.Topic.Direction.ManagerId);
        return seats.Count == 0 ? (seats, TopicErrors.ApprovalNotApprover) : (seats, null);
    }

    private async Task<TopicReservation?> LoadForActionAsync(Guid reservationId)
    {
        return await _dbContext.TopicReservations
            .Include(r => r.Topic).ThenInclude(t => t!.Supervisor)
            .Include(r => r.Topic).ThenInclude(t => t!.Direction)
            .Include(r => r.StudentProfile)
            .Include(r => r.Decisions)
            .FirstOrDefaultAsync(r => r.Id == reservationId);
    }

    private async Task<StudentProfile?> LoadStudentForActionAsync(Guid userId)
    {
        return await _dbContext.StudentProfiles
            .Include(p => p.Group)
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.UserId == userId && p.User.Role == "Student" && p.User.IsActive);
    }

    /// A student with no topic may ask for one while nothing of theirs is open. A student who holds
    /// a topic cannot file another request; only an administrator replaces it (task 7 bug 9).
    private async Task<string?> CheckStudentMayRequestAsync(StudentProfile student)
    {
        if (student.TopicId is not null)
        {
            return TopicErrors.ReservationTopicHeld;
        }

        if (await HasOpenRequestAsync(student.Id))
        {
            return TopicErrors.ReservationAlreadyActive;
        }

        if (!await _settings.IsSelectionOpenAsync())
        {
            return TopicErrors.SelectionClosed;
        }

        return null;
    }

    private Task<bool> HasOpenRequestAsync(Guid studentProfileId) =>
        _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned));

    private Task<bool> HasApprovedReservationAsync(Guid studentProfileId) =>
        _dbContext.TopicReservations.AnyAsync(r => r.StudentProfileId == studentProfileId
            && r.Status == ReservationStatus.Approved);

    /// O1: whether the student has at least one Submission on any of their steps.
    private Task<bool> HasSubmissionsAsync(Guid studentProfileId) =>
        _dbContext.Submissions.AnyAsync(s => s.StudentTask.StudentProfileId == studentProfileId);

    /// Withdraws a student's open request - an administrator decided instead, or the student is
    /// being archived. The caller saves.
    private async Task CancelOpenRequestAsync(Guid studentProfileId, DateTime now)
    {
        var open = await _dbContext.TopicReservations
            .Include(r => r.Topic)
            .FirstOrDefaultAsync(r => r.StudentProfileId == studentProfileId
                && (r.Status == ReservationStatus.Pending || r.Status == ReservationStatus.Returned));
        if (open is null)
        {
            return;
        }

        open.Status = ReservationStatus.Cancelled;
        open.DecidedAt = now;
        if (open.Topic is not null)
        {
            CloseWithoutApproval(open, now);
        }
    }

    /// Settles the approved topic a student is leaving behind: the reservation becomes Released, a
    /// catalogue topic returns to Available (keeping its wording) and a proposal is deleted. Clears
    /// the student's TopicId/SupervisorId in the same pass, because StudentProfile.Topic is
    /// Restrict and the deleted proposal must not still be referenced. The caller saves.
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

    /// §5.3: a request that ends without approval (rejected or cancelled). A proposal is deleted; a
    /// catalogue topic goes back to the catalogue with the wording it had when the request was
    /// made, so nobody's edits during an unfinished request change the catalogue.
    private void CloseWithoutApproval(TopicReservation reservation, DateTime now)
    {
        var topic = reservation.Topic!;
        if (topic.Origin == TopicOrigin.StudentProposal)
        {
            _dbContext.Topics.Remove(topic);
            return;
        }

        topic.Title = reservation.TopicTitle;
        topic.Description = reservation.TopicDescription;
        topic.Status = TopicStatus.Available;
        topic.UpdatedAt = now;
    }

    /// A released topic: a proposal disappears, a catalogue topic keeps its current wording.
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

            // Two concurrent requests from the same student both pass CheckStudentMayRequestAsync
            // before either inserts; the open-per-student index turns the second into this.
            return await HasOpenRequestAsync(studentProfileId)
                ? TopicErrors.ReservationAlreadyActive
                : topicConflictError;
        }
    }

    private async Task<(ReservationResponse? reservation, string? error)> CommitAsync(IDbContextTransaction transaction, Guid reservationId, UserContext user)
    {
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (Exception exception) when (exception is DbUpdateConcurrencyException
            || (exception is DbUpdateException update && update.IsUniqueConstraintViolation()))
        {
            _dbContext.ChangeTracker.Clear();
            return (null, TopicErrors.ReservationChanged);
        }

        await transaction.CommitAsync();
        _dbContext.ChangeTracker.Clear();
        return (await LoadResponseAsync(reservationId, user), null);
    }

    private async Task<ReservationResponse?> LoadResponseAsync(Guid reservationId, UserContext user)
    {
        var row = await Project(_dbContext.TopicReservations.AsNoTracking().Where(r => r.Id == reservationId))
            .FirstOrDefaultAsync();
        return row is null ? null : await ToResponseAsync(row, user);
    }

    private async Task<ReservationResponse> ToResponseAsync(ReservationRow row, UserContext user)
    {
        var canCancel = user.IsStudent
            && row.StudentUserId == user.UserId
            && IsOpen(row.Status)
            && (await _settings.IsSelectionOpenAsync() || await HasApprovedReservationAsync(row.StudentProfileId));
        return ToResponse(row, user, canCancel);
    }

    private static IQueryable<ReservationRow> Project(IQueryable<TopicReservation> source) =>
        source.Select(r => new ReservationRow
        {
            Id = r.Id,
            TopicId = r.TopicId,
            SnapshotTitle = r.TopicTitle,
            SnapshotDescription = r.TopicDescription,
            LiveTitle = r.Topic != null ? r.Topic.Title : null,
            LiveDescription = r.Topic != null ? r.Topic.Description : null,
            Origin = r.Topic != null ? (TopicOrigin?)r.Topic.Origin : null,
            SupervisorId = r.Topic != null ? (Guid?)r.Topic.SupervisorId : null,
            SupervisorLastName = r.Topic != null ? r.Topic.Supervisor.LastName : null,
            SupervisorFirstName = r.Topic != null ? r.Topic.Supervisor.FirstName : null,
            SupervisorPatronymic = r.Topic != null ? r.Topic.Supervisor.Patronymic : null,
            DirectionId = r.Topic != null ? (Guid?)r.Topic.DirectionId : null,
            DirectionName = r.Topic != null ? r.Topic.Direction.Name : null,
            DirectionManagerId = r.Topic != null ? (Guid?)r.Topic.Direction.ManagerId : null,
            DirectionManagerLastName = r.Topic != null ? r.Topic.Direction.Manager.LastName : null,
            DirectionManagerFirstName = r.Topic != null ? r.Topic.Direction.Manager.FirstName : null,
            DirectionManagerPatronymic = r.Topic != null ? r.Topic.Direction.Manager.Patronymic : null,
            StudentProfileId = r.StudentProfileId,
            StudentUserId = r.StudentProfile.UserId,
            StudentLastName = r.StudentProfile.User.LastName,
            StudentFirstName = r.StudentProfile.User.FirstName,
            StudentPatronymic = r.StudentProfile.User.Patronymic,
            StudentEmail = r.StudentProfile.User.Email,
            GroupCode = r.StudentProfile.Group.Code,
            Status = r.Status,
            DecisionComment = r.DecisionComment,
            CreatedAt = r.CreatedAt,
            DecidedAt = r.DecidedAt,
            ContentChangedAt = r.ContentChangedAt,
            StudentCurrentTopicId = r.StudentProfile.TopicId,
            StudentCurrentTopicTitle = r.StudentProfile.Topic != null ? r.StudentProfile.Topic.Title : null,
            HasSubmissions = r.StudentProfile.StudentTasks.Any(t => t.Submissions.Any()),
            Decisions = r.Decisions
                .OrderBy(d => d.DecidedAt)
                .Select(d => new DecisionRow
                {
                    DeciderId = d.DeciderId,
                    DeciderWasAdministrator = d.DeciderWasAdministrator,
                    Kind = d.Kind,
                    Comment = d.Comment,
                    DecidedAt = d.DecidedAt,
                    LastName = d.Decider.LastName,
                    FirstName = d.Decider.FirstName,
                    Patronymic = d.Decider.Patronymic
                })
                .ToList()
        });

    private static ReservationResponse ToResponse(ReservationRow row, UserContext user, bool canCancel)
    {
        var isOpen = IsOpen(row.Status);
        var isLive = isOpen || row.Status == ReservationStatus.Approved;
        var isChangeRequest = isOpen && row.StudentCurrentTopicId is not null && row.StudentCurrentTopicId != row.TopicId;

        var supervisorName = row.SupervisorId is null ? null : PersonName.Full(row.SupervisorLastName ?? "", row.SupervisorFirstName ?? "", row.SupervisorPatronymic);
        var managerName = row.DirectionManagerId is null ? null : PersonName.Full(row.DirectionManagerLastName ?? "", row.DirectionManagerFirstName ?? "", row.DirectionManagerPatronymic);

        IReadOnlyList<TopicApprovalPanel.Seat> callerSeats = row.SupervisorId is { } supervisorId && row.DirectionManagerId is { } managerId
            ? TopicApprovalPanel.SeatsOf(user, supervisorId, managerId)
            : [];

        TopicApprovalPanel.State? state = isOpen && row.SupervisorId is { } openSupervisorId && row.DirectionManagerId is { } openManagerId
            ? TopicApprovalPanel.Evaluate(
                openSupervisorId,
                openManagerId,
                row.ContentChangedAt,
                row.Decisions.Select(d => new TopicApprovalPanel.DecisionFact(d.DeciderId, d.DeciderWasAdministrator, d.Kind, d.DecidedAt)).ToList())
            : null;

        string? NameOf(Guid? deciderId) => row.Decisions.FirstOrDefault(d => d.DeciderId == deciderId) is { } decision
            ? PersonName.Full(decision.LastName, decision.FirstName, decision.Patronymic)
            : null;

        return new ReservationResponse
        {
            Id = row.Id,
            TopicId = row.TopicId,
            TopicTitle = isLive && row.LiveTitle is not null ? row.LiveTitle : row.SnapshotTitle,
            TopicDescription = isLive && row.TopicId is not null ? row.LiveDescription : row.SnapshotDescription,
            Origin = row.Origin?.ToString(),
            SupervisorId = row.SupervisorId,
            SupervisorName = supervisorName,
            DirectionId = row.DirectionId,
            DirectionName = row.DirectionName,
            DirectionManagerName = managerName,
            StudentProfileId = row.StudentProfileId,
            StudentName = PersonName.Full(row.StudentLastName, row.StudentFirstName, row.StudentPatronymic),
            StudentEmail = row.StudentEmail,
            GroupCode = row.GroupCode,
            Status = row.Status.ToString(),
            DecisionComment = row.DecisionComment,
            CreatedAt = row.CreatedAt,
            DecidedAt = row.DecidedAt,
            CanCancel = canCancel,
            HasSubmissions = row.HasSubmissions,
            CurrentTopicId = isChangeRequest ? row.StudentCurrentTopicId : null,
            CurrentTopicTitle = isChangeRequest ? row.StudentCurrentTopicTitle : null,
            Seats = state?.Seats.Select(seat => new ApprovalSeatResponse
            {
                Seat = seat.Seat.ToString(),
                HolderName = seat.Seat switch
                {
                    TopicApprovalPanel.Seat.Direction => managerName,
                    TopicApprovalPanel.Seat.Supervision => supervisorName,
                    _ => null
                },
                IsSatisfied = seat.IsSatisfied,
                ApprovedByName = seat.IsSatisfied ? NameOf(seat.ApprovedById) : null,
                ApprovedAt = seat.ApprovedAt
            }).ToList() ?? [],
            Timeline = row.Decisions.Select(d => new ReservationDecisionResponse
            {
                Kind = d.Kind.ToString(),
                DeciderName = PersonName.Full(d.LastName, d.FirstName, d.Patronymic),
                Comment = d.Comment,
                DecidedAt = d.DecidedAt
            }).ToList(),
            ReturnComment = row.Status == ReservationStatus.Returned
                ? row.Decisions.LastOrDefault(d => d.Kind == ReservationDecisionKind.Returned)?.Comment
                : null,
            CanDecide = row.Status == ReservationStatus.Pending && state is not null && TopicApprovalPanel.HasOpenSeat(state, callerSeats),
            CanEditWording = row.Status == ReservationStatus.Pending && callerSeats.Count > 0,
            CanReject = isOpen && callerSeats.Count > 0,
            CanRelease = row.Status == ReservationStatus.Approved && callerSeats.Count > 0,
            CanResubmit = user.IsStudent && row.StudentUserId == user.UserId && row.Status == ReservationStatus.Returned
        };
    }

    private sealed class ReservationRow
    {
        public Guid Id { get; init; }
        public Guid? TopicId { get; init; }
        public string SnapshotTitle { get; init; } = string.Empty;
        public string? SnapshotDescription { get; init; }
        public string? LiveTitle { get; init; }
        public string? LiveDescription { get; init; }
        public TopicOrigin? Origin { get; init; }
        public Guid? SupervisorId { get; init; }
        public string? SupervisorLastName { get; init; }
        public string? SupervisorFirstName { get; init; }
        public string? SupervisorPatronymic { get; init; }
        public Guid? DirectionId { get; init; }
        public string? DirectionName { get; init; }
        public Guid? DirectionManagerId { get; init; }
        public string? DirectionManagerLastName { get; init; }
        public string? DirectionManagerFirstName { get; init; }
        public string? DirectionManagerPatronymic { get; init; }
        public Guid StudentProfileId { get; init; }
        public Guid StudentUserId { get; init; }
        public string StudentLastName { get; init; } = string.Empty;
        public string StudentFirstName { get; init; } = string.Empty;
        public string? StudentPatronymic { get; init; }
        public string StudentEmail { get; init; } = string.Empty;
        public string GroupCode { get; init; } = string.Empty;
        public ReservationStatus Status { get; init; }
        public string? DecisionComment { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? DecidedAt { get; init; }
        public DateTime ContentChangedAt { get; init; }
        public Guid? StudentCurrentTopicId { get; init; }
        public string? StudentCurrentTopicTitle { get; init; }
        public bool HasSubmissions { get; init; }
        public List<DecisionRow> Decisions { get; init; } = [];
    }

    private sealed class DecisionRow
    {
        public Guid DeciderId { get; init; }
        public bool DeciderWasAdministrator { get; init; }
        public ReservationDecisionKind Kind { get; init; }
        public string? Comment { get; init; }
        public DateTime DecidedAt { get; init; }
        public string LastName { get; init; } = string.Empty;
        public string FirstName { get; init; } = string.Empty;
        public string? Patronymic { get; init; }
    }
}
