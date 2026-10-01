using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §4, and phase 12 §4: a direction manager opens directions in the departments
/// their role covers and manages their own; an administrator manages every direction and names or
/// changes its manager, who must cover the direction's department.
public class DirectionService : IDirectionService
{
    private readonly AppDbContext _dbContext;
    private readonly IReservationService _reservations;
    private readonly IStudentWorkflowService _workflow;
    private readonly ILogger<DirectionService> _logger;

    public DirectionService(AppDbContext dbContext, IReservationService reservations, IStudentWorkflowService workflow, ILogger<DirectionService> logger)
    {
        _dbContext = dbContext;
        _reservations = reservations;
        _workflow = workflow;
        _logger = logger;
    }

    public async Task<(IReadOnlyList<DirectionResponse>? directions, string? error)> GetDirectionsAsync(UserContext user, DirectionQuery query)
    {
        IQueryable<Direction> directions = _dbContext.Directions.AsNoTracking();

        if (user.IsStudent)
        {
            // A student sees the directions of their own group's department - the ones a
            // proposal may name (§4.3).
            var departmentId = await StudentDepartmentAsync(user.UserId);
            if (departmentId is null)
            {
                return (null, TopicErrors.StudentProfileRequired);
            }

            directions = directions.Where(d => d.DepartmentId == departmentId);
        }
        else if (user.IsAdmin || user.IsStaff)
        {
            if (query.DepartmentId is not null)
            {
                directions = directions.Where(d => d.DepartmentId == query.DepartmentId);
            }

            if (query.ManagerId is not null)
            {
                directions = directions.Where(d => d.ManagerId == query.ManagerId);
            }

            if (query.Mine)
            {
                directions = directions.Where(d => d.ManagerId == user.UserId);
            }

            if (query.Covered && !user.IsAdmin)
            {
                if (user.ActingRole is { } role)
                {
                    var covered = _dbContext.DepartmentsCoveredBy(user.UserId, role);
                    directions = directions.Where(d => covered.Contains(d.DepartmentId));
                }
                else
                {
                    directions = directions.Where(_ => false);
                }
            }
        }
        else
        {
            return (null, CommonErrors.Forbidden);
        }

        var rows = await directions
            .OrderBy(d => d.Department.Faculty.Name)
            .ThenBy(d => d.Department.Name)
            .ThenBy(d => d.Name)
            .Select(Projection(user))
            .ToListAsync();

        return (rows, null);
    }

    public async Task<(DirectionResponse? direction, string? error)> GetDirectionAsync(UserContext user, Guid id)
    {
        var row = await _dbContext.Directions.AsNoTracking()
            .Where(d => d.Id == id)
            .Select(Projection(user))
            .FirstOrDefaultAsync();

        if (row is null)
        {
            return (null, DirectionErrors.NotFound);
        }

        if (user.IsStudent && row.DepartmentId != await StudentDepartmentAsync(user.UserId))
        {
            return (null, DirectionErrors.NotFound);
        }

        return (row, null);
    }

    public async Task<(DirectionResponse? direction, string? error)> CreateDirectionAsync(UserContext user, CreateDirectionRequest request)
    {
        if (!user.IsAdmin && !user.IsDirectionManager)
        {
            return (null, CommonErrors.Forbidden);
        }

        if (!await _dbContext.Departments.AnyAsync(d => d.Id == request.DepartmentId))
        {
            return (null, DirectionErrors.DepartmentInvalid);
        }

        // Phase 12 §4: the manager covers the direction's department. An administrator names one who
        // does; a direction manager opens a direction only where their own role reaches.
        Guid managerId;
        if (user.IsAdmin)
        {
            if (request.ManagerId is not { } named
                || !await _dbContext.CoversDepartmentAsync(named, StaffRole.DirectionManager, request.DepartmentId))
            {
                return (null, DirectionErrors.ManagerInvalid);
            }

            managerId = named;
        }
        else
        {
            if (!await _dbContext.CoversDepartmentAsync(user.UserId, StaffRole.DirectionManager, request.DepartmentId))
            {
                return (null, RoleErrors.NotCovered);
            }

            managerId = user.UserId;
        }

        var name = request.Name.Trim();
        if (await _dbContext.Directions.AnyAsync(d => d.DepartmentId == request.DepartmentId && d.Name == name))
        {
            return (null, DirectionErrors.NameTaken);
        }

        var now = DateTime.UtcNow;
        var direction = new Direction
        {
            Id = Guid.NewGuid(),
            DepartmentId = request.DepartmentId,
            Name = name,
            Description = IdentityNormalizer.Optional(request.Description),
            ManagerId = managerId,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Directions.Add(direction);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, DirectionErrors.NameTaken);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Created", "Direction", direction.Id);
        return await GetDirectionAsync(user, direction.Id);
    }

    public async Task<(DirectionResponse? direction, string? error)> UpdateDirectionAsync(UserContext user, Guid id, UpdateDirectionRequest request)
    {
        var direction = await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == id);
        var access = CheckManageable(user, direction);
        if (access is not null)
        {
            return (null, access);
        }

        var editable = direction!;

        if (request.DepartmentId != editable.DepartmentId)
        {
            if (!await _dbContext.Departments.AnyAsync(d => d.Id == request.DepartmentId))
            {
                return (null, DirectionErrors.DepartmentInvalid);
            }

            // §4.2: the department decides who may discover the direction's topics, so a direction
            // moves only while it has none.
            if (await _dbContext.Topics.AnyAsync(t => t.DirectionId == editable.Id))
            {
                return (null, DirectionErrors.HasTopics);
            }
        }

        var managerChanged = false;
        var managerId = editable.ManagerId;
        if (request.ManagerId is { } requestedManager && requestedManager != editable.ManagerId)
        {
            if (!user.IsAdmin)
            {
                return (null, CommonErrors.Forbidden);
            }

            managerId = requestedManager;
            managerChanged = true;
        }

        // Phase 12 §4: the manager - a new one, or the current one when the direction moves - covers
        // the department. A manager who moves their own direction outside their role is refused.
        if ((managerChanged || request.DepartmentId != editable.DepartmentId)
            && !await _dbContext.CoversDepartmentAsync(managerId, StaffRole.DirectionManager, request.DepartmentId))
        {
            return (null, user.IsAdmin ? DirectionErrors.ManagerInvalid : RoleErrors.NotCovered);
        }

        if (managerChanged)
        {
            // §4.2: the direction's approval seat and its step-panel seats move to the new manager
            // at once - both are derived from ManagerId whenever they are read.
            editable.ManagerId = managerId;
        }

        var name = request.Name.Trim();
        if (await _dbContext.Directions.AnyAsync(d => d.Id != editable.Id && d.DepartmentId == request.DepartmentId && d.Name == name))
        {
            return (null, DirectionErrors.NameTaken);
        }

        var now = DateTime.UtcNow;
        editable.Name = name;
        editable.Description = IdentityNormalizer.Optional(request.Description);
        editable.DepartmentId = request.DepartmentId;
        editable.UpdatedAt = now;

        List<Guid> reservedTopicIds = [];
        if (managerChanged)
        {
            // §4.2: the former manager's approvals stop counting at once. Touching every open
            // request's topic puts this change under the topic RowVersion, so an approval racing it
            // cannot complete a request on the former manager's seat.
            var reservedTopics = await _dbContext.Topics
                .Where(t => t.DirectionId == editable.Id && t.Status == TopicStatus.Reserved)
                .ToListAsync();
            foreach (var topic in reservedTopics)
            {
                topic.UpdatedAt = now;
            }

            reservedTopicIds = reservedTopics.Select(t => t.Id).ToList();

            // The same for the step panels of the students who hold a topic here: their direction
            // manager seat moves now, and a Submitted step the new manager already satisfies (or
            // that no longer needs a separate seat) is approved in this save.
            var holderIds = await _dbContext.StudentProfiles
                .Where(p => p.Topic != null && p.Topic.DirectionId == editable.Id)
                .Select(p => p.Id)
                .ToListAsync();
            var newManagerId = editable.ManagerId;
            await _workflow.RefreshStudentPanelsAsync(holderIds, now, facts => facts with { DirectionManagerId = newManagerId });
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException exception)
        {
            // An approval on a request or a decision on a step won the race; the manager is unchanged.
            _dbContext.ChangeTracker.Clear();
            return (null, exception.Entries.Any(e => e.Entity is StudentTask)
                ? WorkflowErrors.PanelChanged
                : TopicErrors.ReservationChanged);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, DirectionErrors.NameTaken);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Updated", "Direction", editable.Id);

        if (managerChanged)
        {
            // §4.2: the new manager may already have approved some of the direction's open requests.
            await _reservations.CompleteSatisfiedRequestsAsync(reservedTopicIds);
        }

        return await GetDirectionAsync(user, editable.Id);
    }

    public async Task<(bool success, string? error)> DeleteDirectionAsync(UserContext user, Guid id)
    {
        var direction = await _dbContext.Directions.FirstOrDefaultAsync(d => d.Id == id);
        var access = CheckManageable(user, direction);
        if (access is not null)
        {
            return (false, access);
        }

        if (await _dbContext.Topics.AnyAsync(t => t.DirectionId == id))
        {
            return (false, DirectionErrors.HasTopics);
        }

        _dbContext.Directions.Remove(direction!);
        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (false, DirectionErrors.HasTopics);
        }

        SecurityLog.AdministratorAction(_logger, user.UserId, "Deleted", "Direction", id);
        return (true, null);
    }

    private static string? CheckManageable(UserContext user, Direction? direction)
    {
        if (direction is null)
        {
            return DirectionErrors.NotFound;
        }

        if (user.IsAdmin || (user.IsDirectionManager && direction.ManagerId == user.UserId))
        {
            return null;
        }

        return user.IsDirectionManager ? DirectionErrors.NotManager : CommonErrors.Forbidden;
    }

    private Task<Guid?> StudentDepartmentAsync(Guid userId) =>
        _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => p.UserId == userId && p.User.IsActive)
            .Select(p => (Guid?)p.Group.DepartmentId)
            .FirstOrDefaultAsync();

    private static Expression<Func<Direction, DirectionResponse>> Projection(UserContext user)
    {
        var me = user.UserId;
        var isAdmin = user.IsAdmin;

        return d => new DirectionResponse
        {
            Id = d.Id,
            Name = d.Name,
            Description = d.Description,
            DepartmentId = d.DepartmentId,
            DepartmentName = d.Department.Name,
            FacultyId = d.Department.FacultyId,
            FacultyName = d.Department.Faculty.Name,
            ManagerId = d.ManagerId,
            ManagerName = d.Manager.LastName + " " + d.Manager.FirstName
                + (d.Manager.Patronymic == null ? "" : " " + d.Manager.Patronymic),
            TopicsAvailable = d.Topics.Count(t => t.Status == TopicStatus.Available),
            TopicsReserved = d.Topics.Count(t => t.Status == TopicStatus.Reserved),
            TopicsApproved = d.Topics.Count(t => t.Status == TopicStatus.Approved),
            CanManage = isAdmin || d.ManagerId == me,
            CreatedAt = d.CreatedAt,
            UpdatedAt = d.UpdatedAt
        };
    }
}
