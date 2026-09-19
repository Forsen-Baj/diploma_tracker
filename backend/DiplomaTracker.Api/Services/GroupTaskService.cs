using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class GroupTaskService : IGroupTaskService
{
    private readonly AppDbContext _dbContext;
    private readonly IAccessScope _accessScope;

    public GroupTaskService(AppDbContext dbContext, IAccessScope accessScope)
    {
        _dbContext = dbContext;
        _accessScope = accessScope;
    }

    public async Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetGroupTasksAsync(string role, Guid userId)
    {
        var query = _dbContext.GroupTasks.AsNoTracking().AsQueryable();

        if (role != "Admin")
        {
            var visibleGroupIds = _accessScope.VisibleGroups(new UserContext(userId, role)).Select(g => g.Id);
            query = query.Where(x => visibleGroupIds.Contains(x.GroupId));
        }

        var tasks = await ProjectGroupTasks(query
                .OrderBy(x => x.Group.Code)
                .ThenBy(x => x.DiplomaTaskTemplate.Order)
                .ThenBy(x => x.Deadline))
            .ToListAsync();

        return (tasks, null);
    }

    public async Task<(GroupTaskResponse? task, string? error)> GetGroupTaskByIdAsync(Guid id, string role, Guid userId)
    {
        var groupTask = await ProjectGroupTasks(_dbContext.GroupTasks.AsNoTracking().Where(x => x.Id == id))
            .FirstOrDefaultAsync();

        if (groupTask is null)
        {
            return (null, TaskErrors.GroupTaskNotFound);
        }

        if (!await _accessScope.CanSeeGroupAsync(new UserContext(userId, role), groupTask.GroupId))
        {
            return (null, TaskErrors.GroupTaskNotFound);
        }

        return (groupTask, null);
    }

    public async Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetTasksForGroupAsync(Guid groupId, string role, Guid userId)
    {
        if (!await _accessScope.CanSeeGroupAsync(new UserContext(userId, role), groupId))
        {
            return (null, GroupErrors.NotFound);
        }

        var tasks = await ProjectGroupTasks(_dbContext.GroupTasks.AsNoTracking()
                .Where(x => x.GroupId == groupId)
                .OrderBy(x => x.DiplomaTaskTemplate.Order)
                .ThenBy(x => x.Deadline))
            .ToListAsync();

        return (tasks, null);
    }

    public async Task<(GroupTaskResponse? task, string? error)> CreateGroupTaskAsync(CreateGroupTaskRequest request, string role, Guid userId)
    {
        var group = await _dbContext.Groups
            .Include(g => g.Department)
            .FirstOrDefaultAsync(g => g.Id == request.GroupId);
        if (group is null)
        {
            return (null, TaskErrors.GroupTaskGroupNotFound);
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, request.GroupId);
            if (!allowed)
            {
                // A group that exists but this teacher does not review must look identical to a
                // group that does not exist at all (spec §6) - Forbidden would let a teacher
                // distinguish the two on this write path exactly as the read paths already refuse
                // to. The authorisation rule itself is unchanged: writes stay reviewer-only.
                return (null, GroupErrors.NotFound);
            }
        }

        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == request.TaskTemplateId);
        if (template is null)
        {
            return (null, TaskErrors.GroupTaskTemplateNotFound);
        }

        if (!template.IsActive)
        {
            return (null, TaskErrors.GroupTaskTemplateInactive);
        }

        if (template.FacultyId != group.Department.FacultyId)
        {
            return (null, TaskErrors.GroupTaskTemplateFacultyMismatch);
        }

        if (request.StartDate is not null && request.StartDate > request.Deadline)
        {
            return (null, TaskErrors.GroupTaskStartAfterDeadline);
        }

        var exists = await _dbContext.GroupTasks
            .AnyAsync(x => x.GroupId == request.GroupId && x.DiplomaTaskTemplateId == request.TaskTemplateId);
        if (exists)
        {
            return (null, TaskErrors.GroupTaskAlreadyAssigned);
        }

        var now = DateTime.UtcNow;
        var groupTask = new GroupTask
        {
            Id = Guid.NewGuid(),
            GroupId = request.GroupId,
            DiplomaTaskTemplateId = request.TaskTemplateId,
            StartDate = request.StartDate,
            Deadline = request.Deadline!.Value,
            CreatedAt = now,
            UpdatedAt = null
        };

        _dbContext.GroupTasks.Add(groupTask);

        var students = await _dbContext.StudentProfiles
            .Where(s => s.GroupId == request.GroupId && s.ArchivedAt == null)
            .Select(s => s.Id)
            .ToListAsync();

        foreach (var studentId in students)
        {
            _dbContext.StudentTasks.Add(new StudentTask
            {
                Id = Guid.NewGuid(),
                StudentProfileId = studentId,
                GroupTaskId = groupTask.Id,
                Status = StudentTaskStatus.Pending,
                Mark = null,
                CompletedAt = null,
                CreatedAt = now,
                UpdatedAt = null
            });
        }

        await _dbContext.SaveChangesAsync();

        groupTask.Group = group;
        groupTask.DiplomaTaskTemplate = template;
        groupTask.StudentTasks = await _dbContext.StudentTasks.Where(st => st.GroupTaskId == groupTask.Id).ToListAsync();
        return (MapGroupTask(groupTask), null);
    }

    public async Task<(AssignAllTaskTemplatesResponse? response, string? error)> AssignAllTaskTemplatesAsync(Guid groupId, AssignAllTaskTemplatesRequest request, string role, Guid userId)
    {
        var group = await _dbContext.Groups
            .Include(g => g.Department)
            .FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, GroupErrors.NotFound);
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupId);
            if (!allowed)
            {
                // See CreateGroupTaskAsync: not-found, not forbidden, so existence isn't leaked.
                return (null, GroupErrors.NotFound);
            }
        }

        if (request.Items.Count == 0)
        {
            return (null, TaskErrors.GroupTaskNoTemplates);
        }

        var duplicateTemplateIds = request.Items
            .GroupBy(x => x.TaskTemplateId)
            .Any(g => g.Count() > 1);
        if (duplicateTemplateIds)
        {
            return (null, TaskErrors.GroupTaskDuplicateTemplates);
        }

        var templateIds = request.Items.Select(x => x.TaskTemplateId).Distinct().ToList();
        var templates = await _dbContext.DiplomaTaskTemplates
            .Where(t => templateIds.Contains(t.Id))
            .ToListAsync();

        if (templates.Count != templateIds.Count)
        {
            return (null, TaskErrors.GroupTaskTemplateNotFound);
        }

        var inactiveTemplate = templates.FirstOrDefault(t => !t.IsActive);
        if (inactiveTemplate is not null)
        {
            return (null, TaskErrors.GroupTaskTemplateInactive);
        }

        var mismatchedTemplate = templates.FirstOrDefault(t => t.FacultyId != group.Department.FacultyId);
        if (mismatchedTemplate is not null)
        {
            return (null, TaskErrors.GroupTaskTemplateFacultyMismatch);
        }

        var invalidStartDate = request.Items.Any(x => x.StartDate is not null && x.StartDate > x.Deadline);
        if (invalidStartDate)
        {
            return (null, TaskErrors.GroupTaskStartAfterDeadline);
        }

        var existingTemplateIds = await _dbContext.GroupTasks
            .Where(gt => gt.GroupId == groupId && templateIds.Contains(gt.DiplomaTaskTemplateId))
            .Select(gt => gt.DiplomaTaskTemplateId)
            .ToListAsync();

        var existingSet = existingTemplateIds.ToHashSet();
        var now = DateTime.UtcNow;
        var createdGroupTasks = new List<GroupTask>();
        var createdStudentTasks = 0;

        var studentProfileIds = await _dbContext.StudentProfiles
            .Where(s => s.GroupId == groupId && s.ArchivedAt == null)
            .Select(s => s.Id)
            .ToListAsync();

        foreach (var item in request.Items)
        {
            if (existingSet.Contains(item.TaskTemplateId))
            {
                continue;
            }

            var groupTask = new GroupTask
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                DiplomaTaskTemplateId = item.TaskTemplateId,
                StartDate = item.StartDate,
                Deadline = item.Deadline!.Value,
                CreatedAt = now
            };
            _dbContext.GroupTasks.Add(groupTask);
            createdGroupTasks.Add(groupTask);

            foreach (var studentProfileId in studentProfileIds)
            {
                _dbContext.StudentTasks.Add(new StudentTask
                {
                    Id = Guid.NewGuid(),
                    StudentProfileId = studentProfileId,
                    GroupTaskId = groupTask.Id,
                    Status = StudentTaskStatus.Pending,
                    CreatedAt = now
                });
                createdStudentTasks++;
            }
        }

        await _dbContext.SaveChangesAsync();

        if (createdGroupTasks.Count > 0)
        {
            var createdIds = createdGroupTasks.Select(x => x.Id).ToList();
            createdGroupTasks = await _dbContext.GroupTasks
                .Include(x => x.Group)
                .Include(x => x.DiplomaTaskTemplate)
                .Include(x => x.StudentTasks)
                .Where(x => createdIds.Contains(x.Id))
                .OrderBy(x => x.DiplomaTaskTemplate.Order)
                .ThenBy(x => x.DiplomaTaskTemplate.Title)
                .ToListAsync();
        }

        var response = new AssignAllTaskTemplatesResponse
        {
            GroupId = groupId,
            CreatedGroupTaskCount = createdGroupTasks.Count,
            SkippedExistingGroupTaskCount = request.Items.Count - createdGroupTasks.Count,
            CreatedStudentTaskCount = createdStudentTasks,
            GroupTasks = createdGroupTasks.Select(MapGroupTask).ToList()
        };

        return (response, null);
    }

    public async Task<(GroupTaskResponse? task, string? error)> UpdateGroupTaskAsync(Guid id, UpdateGroupTaskRequest request, string role, Guid userId)
    {
        var groupTask = await _dbContext.GroupTasks
            .FirstOrDefaultAsync(x => x.Id == id);

        if (groupTask is null)
        {
            return (null, TaskErrors.GroupTaskNotFound);
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupTask.GroupId);
            if (!allowed)
            {
                // See CreateGroupTaskAsync: not-found, not forbidden, so existence isn't leaked.
                return (null, GroupErrors.NotFound);
            }
        }

        if (request.StartDate is not null && request.StartDate > request.Deadline)
        {
            return (null, TaskErrors.GroupTaskStartAfterDeadline);
        }

        groupTask.StartDate = request.StartDate;
        groupTask.Deadline = request.Deadline!.Value;
        groupTask.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        var updated = await ProjectGroupTasks(_dbContext.GroupTasks.AsNoTracking().Where(x => x.Id == id))
            .FirstAsync();

        return (updated, null);
    }

    public async Task<(bool success, string? error)> DeleteGroupTaskAsync(Guid id)
    {
        var groupTask = await _dbContext.GroupTasks
            .Include(x => x.StudentTasks)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (groupTask is null)
        {
            return (false, TaskErrors.GroupTaskNotFound);
        }

        var hasNonPending = groupTask.StudentTasks.Any(st => st.Status != StudentTaskStatus.Pending);
        if (hasNonPending)
        {
            return (false, TaskErrors.GroupTaskHasProgress);
        }

        _dbContext.StudentTasks.RemoveRange(groupTask.StudentTasks);
        _dbContext.GroupTasks.Remove(groupTask);
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    private async Task<bool> IsTeacherReviewerOfGroupAsync(Guid teacherId, Guid groupId)
    {
        return await _dbContext.GroupReviewers.AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == teacherId);
    }

    private static IQueryable<GroupTaskResponse> ProjectGroupTasks(IQueryable<GroupTask> query)
    {
        return query.Select(x => new GroupTaskResponse
        {
            Id = x.Id,
            GroupId = x.GroupId,
            GroupCode = x.Group.Code,
            TaskTemplateId = x.DiplomaTaskTemplateId,
            TaskTitle = x.DiplomaTaskTemplate.Title,
            TaskDescription = x.DiplomaTaskTemplate.Description,
            TaskOrder = x.DiplomaTaskTemplate.Order,
            StartDate = x.StartDate,
            Deadline = x.Deadline,
            CreatedAt = x.CreatedAt,
            UpdatedAt = x.UpdatedAt,
            StudentTaskCount = x.StudentTasks.Count(st => st.StudentProfile.ArchivedAt == null)
        });
    }

    private static GroupTaskResponse MapGroupTask(GroupTask groupTask)
    {
        return new GroupTaskResponse
        {
            Id = groupTask.Id,
            GroupId = groupTask.GroupId,
            GroupCode = groupTask.Group.Code,
            TaskTemplateId = groupTask.DiplomaTaskTemplateId,
            TaskTitle = groupTask.DiplomaTaskTemplate.Title,
            TaskDescription = groupTask.DiplomaTaskTemplate.Description,
            TaskOrder = groupTask.DiplomaTaskTemplate.Order,
            StartDate = groupTask.StartDate,
            Deadline = groupTask.Deadline,
            CreatedAt = groupTask.CreatedAt,
            UpdatedAt = groupTask.UpdatedAt,
            StudentTaskCount = groupTask.StudentTasks.Count
        };
    }

}
