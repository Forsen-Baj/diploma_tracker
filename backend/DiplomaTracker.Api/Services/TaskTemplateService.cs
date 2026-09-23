using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.TaskTemplates;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class TaskTemplateService : ITaskTemplateService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<TaskTemplateService> _logger;

    public TaskTemplateService(AppDbContext dbContext, ILogger<TaskTemplateService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<IReadOnlyList<TaskTemplateResponse>> GetTaskTemplatesAsync(Guid? facultyId)
    {
        var query = _dbContext.DiplomaTaskTemplates.AsNoTracking()
            .Include(t => t.Faculty)
            .AsQueryable();

        if (facultyId is not null)
        {
            query = query.Where(t => t.FacultyId == facultyId.Value);
        }

        var templates = await query
            .OrderBy(t => t.Order)
            .ThenBy(t => t.Title)
            .ToListAsync();
        return templates.Select(Map).ToList();
    }

    public async Task<TaskTemplateResponse?> GetTaskTemplateByIdAsync(Guid id)
    {
        var template = await _dbContext.DiplomaTaskTemplates.AsNoTracking()
            .Include(t => t.Faculty)
            .FirstOrDefaultAsync(t => t.Id == id);
        return template is null ? null : Map(template);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> CreateTaskTemplateAsync(CreateTaskTemplateRequest request, Guid administratorId)
    {
        if (request.Order <= 0)
        {
            return (null, TaskErrors.TemplateOrderInvalid);
        }

        var title = request.Title.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return (null, TaskErrors.TemplateTitleRequired);
        }

        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, TaskErrors.TemplateFacultyNotFound);
        }

        var normalizedTitle = title.ToLowerInvariant();
        var duplicateActive = await _dbContext.DiplomaTaskTemplates
            .AnyAsync(t => t.FacultyId == faculty.Id && t.IsActive && t.Title.ToLower() == normalizedTitle);
        if (duplicateActive)
        {
            return (null, TaskErrors.TemplateTitleTaken);
        }

        var orderTaken = await _dbContext.DiplomaTaskTemplates
            .AnyAsync(t => t.FacultyId == faculty.Id && t.Order == request.Order);
        if (orderTaken)
        {
            return (null, TaskErrors.TemplateOrderTaken);
        }

        var now = DateTime.UtcNow;
        var template = new DiplomaTaskTemplate
        {
            Id = Guid.NewGuid(),
            FacultyId = faculty.Id,
            Title = title,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Order = request.Order,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.DiplomaTaskTemplates.Add(template);
        await _dbContext.SaveChangesAsync();

        template.Faculty = faculty;
        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "TaskTemplate", template.Id);
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> UpdateTaskTemplateAsync(Guid id, UpdateTaskTemplateRequest request, Guid administratorId)
    {
        if (request.Order <= 0)
        {
            return (null, TaskErrors.TemplateOrderInvalid);
        }

        var title = request.Title.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return (null, TaskErrors.TemplateTitleRequired);
        }

        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, TaskErrors.TemplateNotFound);
        }

        Faculty faculty;
        if (request.FacultyId == template.FacultyId)
        {
            var existingFaculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == template.FacultyId);
            if (existingFaculty is null)
            {
                return (null, TaskErrors.TemplateFacultyNotFound);
            }

            faculty = existingFaculty;
        }
        else
        {
            var newFaculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
            if (newFaculty is null)
            {
                return (null, TaskErrors.TemplateFacultyNotFound);
            }

            var isAssignedToGroup = await _dbContext.GroupTasks.AnyAsync(gt => gt.DiplomaTaskTemplateId == id);
            if (isAssignedToGroup)
            {
                return (null, TaskErrors.TemplateInUse);
            }

            faculty = newFaculty;
        }

        var normalizedTitle = title.ToLowerInvariant();
        if (request.IsActive)
        {
            var duplicateActive = await _dbContext.DiplomaTaskTemplates
                .AnyAsync(t => t.FacultyId == faculty.Id && t.Id != id && t.IsActive && t.Title.ToLower() == normalizedTitle);
            if (duplicateActive)
            {
                return (null, TaskErrors.TemplateTitleTaken);
            }
        }

        var oldFacultyId = template.FacultyId;
        var oldOrder = template.Order;
        var newFacultyId = faculty.Id;
        var newOrder = request.Order;
        var now = DateTime.UtcNow;

        var description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();

        if (newOrder == oldOrder && newFacultyId == oldFacultyId)
        {
            template.FacultyId = faculty.Id;
            template.Title = title;
            template.Description = description;
            template.IsActive = request.IsActive;
            template.UpdatedAt = now;
            await _dbContext.SaveChangesAsync();

            template.Faculty = faculty;
            SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "TaskTemplate", template.Id);
            return (Map(template), null);
        }

        // Changing Order (or moving faculty) is a reorder: it shifts neighbouring templates rather
        // than failing. The shift is done in two phases inside a transaction because a straight
        // sequence of updates would transiently violate the unique (FacultyId, Order) index.
        var moves = new List<(DiplomaTaskTemplate Entity, int TargetOrder)> { (template, newOrder) };

        if (newFacultyId == oldFacultyId)
        {
            if (newOrder > oldOrder)
            {
                var neighbours = await _dbContext.DiplomaTaskTemplates
                    .Where(t => t.FacultyId == oldFacultyId && t.Id != id && t.Order > oldOrder && t.Order <= newOrder)
                    .ToListAsync();
                moves.AddRange(neighbours.Select(n => (n, n.Order - 1)));
            }
            else
            {
                var neighbours = await _dbContext.DiplomaTaskTemplates
                    .Where(t => t.FacultyId == oldFacultyId && t.Id != id && t.Order >= newOrder && t.Order < oldOrder)
                    .ToListAsync();
                moves.AddRange(neighbours.Select(n => (n, n.Order + 1)));
            }
        }
        else
        {
            var neighbours = await _dbContext.DiplomaTaskTemplates
                .Where(t => t.FacultyId == newFacultyId && t.Id != id && t.Order >= newOrder)
                .ToListAsync();
            moves.AddRange(neighbours.Select(n => (n, n.Order + 1)));
        }

        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        foreach (var (entity, _) in moves)
        {
            entity.Order = -entity.Order;
        }
        await _dbContext.SaveChangesAsync();

        template.FacultyId = faculty.Id;
        template.Title = title;
        template.Description = description;
        template.IsActive = request.IsActive;

        foreach (var (entity, targetOrder) in moves)
        {
            entity.Order = targetOrder;
            entity.UpdatedAt = now;
        }
        await _dbContext.SaveChangesAsync();

        await transaction.CommitAsync();

        template.Faculty = faculty;
        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "TaskTemplate", template.Id);
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> ActivateTaskTemplateAsync(Guid id, Guid administratorId)
    {
        var template = await _dbContext.DiplomaTaskTemplates
            .Include(t => t.Faculty)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, TaskErrors.TemplateNotFound);
        }

        var normalizedTitle = template.Title.Trim().ToLowerInvariant();
        var duplicateActive = await _dbContext.DiplomaTaskTemplates
            .AnyAsync(t => t.FacultyId == template.FacultyId && t.Id != id && t.IsActive && t.Title.ToLower() == normalizedTitle);
        if (duplicateActive)
        {
            return (null, TaskErrors.TemplateTitleTaken);
        }

        template.IsActive = true;
        template.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        SecurityLog.AdministratorAction(_logger, administratorId, "Activated", "TaskTemplate", template.Id);
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> DeactivateTaskTemplateAsync(Guid id, Guid administratorId)
    {
        var template = await _dbContext.DiplomaTaskTemplates
            .Include(t => t.Faculty)
            .FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, TaskErrors.TemplateNotFound);
        }

        template.IsActive = false;
        template.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        SecurityLog.AdministratorAction(_logger, administratorId, "Deactivated", "TaskTemplate", template.Id);
        return (Map(template), null);
    }

    /// Phase 8 §6. A step no group has been given can be deleted; one that is assigned is
    /// refused, because its group tasks and every student's work on them hang off it. The gap it
    /// leaves in the faculty's order is closed by the next reorder.
    public async Task<(bool success, string? error)> DeleteTaskTemplateAsync(Guid id, Guid administratorId)
    {
        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (false, TaskErrors.TemplateNotFound);
        }

        if (await _dbContext.GroupTasks.AnyAsync(g => g.DiplomaTaskTemplateId == id))
        {
            return (false, TaskErrors.TemplateAssigned);
        }

        _dbContext.DiplomaTaskTemplates.Remove(template);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            // A group was given this step between the check and the delete.
            return (false, TaskErrors.TemplateAssigned);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Deleted", "TaskTemplate", id);
        return (true, null);
    }

    /// Phase 8 §6. One request carries the whole new order, so the result does not depend on the
    /// order the client happened to send individual moves in.
    ///
    /// The two-phase negate-then-assign inside a transaction is the same technique the
    /// single-step move already uses: a straight sequence of updates would transiently violate
    /// the unique (FacultyId, Order) index, and EF chooses its own statement order.
    ///
    /// Orders are rewritten as 1..n, which also closes any gaps left by deleted steps.
    public async Task<(IReadOnlyList<TaskTemplateResponse>? templates, string? error)> ReorderAsync(
        ReorderTaskTemplatesRequest request,
        Guid administratorId)
    {
        var facultyExists = await _dbContext.Faculties.AnyAsync(f => f.Id == request.FacultyId);
        if (!facultyExists)
        {
            return (null, TaskErrors.TemplateFacultyNotFound);
        }

        var templates = await _dbContext.DiplomaTaskTemplates
            .Include(t => t.Faculty)
            .Where(t => t.FacultyId == request.FacultyId)
            .ToListAsync();

        var requested = request.TemplateIds;
        if (requested.Count != templates.Count
            || requested.Distinct().Count() != requested.Count
            || requested.Any(id => templates.All(t => t.Id != id)))
        {
            return (null, TaskErrors.TemplateOrderMismatch);
        }

        var byId = templates.ToDictionary(t => t.Id);
        var now = DateTime.UtcNow;

        await using var transaction = await _dbContext.Database.BeginTransactionAsync();

        foreach (var template in templates)
        {
            template.Order = -template.Order;
        }

        try
        {
            await _dbContext.SaveChangesAsync();

            for (var index = 0; index < requested.Count; index++)
            {
                var template = byId[requested[index]];
                template.Order = index + 1;
                template.UpdatedAt = now;
            }
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // M10: a concurrent reorder, or a reorder racing a single-step move, can violate the
            // unique (FacultyId, Order) index between these two saves. The transaction is rolled
            // back rather than left half-applied, and the tracker is cleared as the sibling create
            // and move paths do.
            await transaction.RollbackAsync();
            _dbContext.ChangeTracker.Clear();
            return (null, TaskErrors.TemplateOrderTaken);
        }

        await transaction.CommitAsync();

        SecurityLog.AdministratorAction(_logger, administratorId, "Reordered", "TaskTemplate", request.FacultyId);

        return (templates.OrderBy(t => t.Order).Select(Map).ToList(), null);
    }

    private static TaskTemplateResponse Map(DiplomaTaskTemplate template)
    {
        return new TaskTemplateResponse
        {
            Id = template.Id,
            FacultyId = template.FacultyId,
            FacultyName = template.Faculty.Name,
            Title = template.Title,
            Description = template.Description,
            Order = template.Order,
            IsActive = template.IsActive,
            CreatedAt = template.CreatedAt,
            UpdatedAt = template.UpdatedAt
        };
    }
}
