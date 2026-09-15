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

    public async Task<IReadOnlyList<TaskTemplateResponse>> GetTaskTemplatesAsync()
    {
        var templates = await _dbContext.DiplomaTaskTemplates.AsNoTracking()
            .OrderBy(t => t.Order)
            .ThenBy(t => t.Title)
            .ToListAsync();
        return templates.Select(Map).ToList();
    }

    public async Task<TaskTemplateResponse?> GetTaskTemplateByIdAsync(Guid id)
    {
        var template = await _dbContext.DiplomaTaskTemplates.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        return template is null ? null : Map(template);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> CreateTaskTemplateAsync(CreateTaskTemplateRequest request)
    {
        if (request.Order <= 0)
        {
            return (null, "Order must be greater than 0.");
        }

        var title = request.Title.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return (null, "Title is required.");
        }

        var normalizedTitle = title.ToLowerInvariant();
        var duplicateActive = await _dbContext.DiplomaTaskTemplates
            .AnyAsync(t => t.IsActive && t.Title.ToLower() == normalizedTitle);
        if (duplicateActive)
        {
            return (null, "Active template with this title already exists.");
        }

        var now = DateTime.UtcNow;
        var template = new DiplomaTaskTemplate
        {
            Id = Guid.NewGuid(),
            Title = title,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Order = request.Order,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.DiplomaTaskTemplates.Add(template);
        await _dbContext.SaveChangesAsync();
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> UpdateTaskTemplateAsync(Guid id, UpdateTaskTemplateRequest request)
    {
        if (request.Order <= 0)
        {
            return (null, "Order must be greater than 0.");
        }

        var title = request.Title.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            return (null, "Title is required.");
        }

        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, "Task template not found.");
        }

        var normalizedTitle = title.ToLowerInvariant();
        if (request.IsActive)
        {
            var duplicateActive = await _dbContext.DiplomaTaskTemplates
                .AnyAsync(t => t.Id != id && t.IsActive && t.Title.ToLower() == normalizedTitle);
            if (duplicateActive)
            {
                return (null, "Active template with this title already exists.");
            }
        }

        template.Title = title;
        template.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        template.Order = request.Order;
        template.IsActive = request.IsActive;
        template.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> ActivateTaskTemplateAsync(Guid id)
    {
        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, "Task template not found.");
        }

        var normalizedTitle = template.Title.Trim().ToLowerInvariant();
        var duplicateActive = await _dbContext.DiplomaTaskTemplates
            .AnyAsync(t => t.Id != id && t.IsActive && t.Title.ToLower() == normalizedTitle);
        if (duplicateActive)
        {
            return (null, "Active template with this title already exists.");
        }

        template.IsActive = true;
        template.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return (Map(template), null);
    }

    public async Task<(TaskTemplateResponse? template, string? error)> DeactivateTaskTemplateAsync(Guid id)
    {
        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template is null)
        {
            return (null, "Task template not found.");
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
            Title = template.Title,
            Description = template.Description,
            Order = template.Order,
            IsActive = template.IsActive,
            CreatedAt = template.CreatedAt,
            UpdatedAt = template.UpdatedAt
        };
    }
}
