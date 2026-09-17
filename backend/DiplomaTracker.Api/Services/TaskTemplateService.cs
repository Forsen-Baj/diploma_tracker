using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.TaskTemplates;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class TaskTemplateService : ITaskTemplateService
{
    private readonly AppDbContext _dbContext;

    public TaskTemplateService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
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

    public async Task<(TaskTemplateResponse? template, string? error)> CreateTaskTemplateAsync(CreateTaskTemplateRequest request)
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
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> UpdateTaskTemplateAsync(Guid id, UpdateTaskTemplateRequest request)
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

        template.FacultyId = faculty.Id;
        template.Title = title;
        template.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        template.Order = request.Order;
        template.IsActive = request.IsActive;
        template.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        template.Faculty = faculty;
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> ActivateTaskTemplateAsync(Guid id)
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
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> DeactivateTaskTemplateAsync(Guid id)
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
        return (Map(template), null);
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
