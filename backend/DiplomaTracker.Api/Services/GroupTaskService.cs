using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.GroupTasks;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class GroupTaskService : IGroupTaskService
{
    private readonly AppDbContext _dbContext;

    public GroupTaskService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetGroupTasksAsync(string role, Guid userId)
    {
        var query = _dbContext.GroupTasks
            .Include(x => x.Group)
            .Include(x => x.DiplomaTaskTemplate)
            .Include(x => x.StudentTasks)
            .AsQueryable();

        if (role == "Teacher")
        {
            var groupIds = await _dbContext.GroupReviewers
                .Where(gr => gr.ReviewerId == userId)
                .Select(gr => gr.GroupId)
                .ToListAsync();
            query = query.Where(x => groupIds.Contains(x.GroupId));
        }

        var tasks = await query
            .OrderBy(x => x.Group.Name)
            .ThenBy(x => x.DiplomaTaskTemplate.Order)
            .ThenBy(x => x.Deadline)
            .ToListAsync();

        return (tasks.Select(MapGroupTask).ToList(), null);
    }

    public async Task<(GroupTaskResponse? task, string? error)> GetGroupTaskByIdAsync(Guid id, string role, Guid userId)
    {
        var groupTask = await _dbContext.GroupTasks
            .Include(x => x.Group)
            .Include(x => x.DiplomaTaskTemplate)
            .Include(x => x.StudentTasks)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (groupTask is null)
        {
            return (null, "Group task not found.");
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupTask.GroupId);
            if (!allowed)
            {
                return (null, "Forbidden.");
            }
        }

        return (MapGroupTask(groupTask), null);
    }

    public async Task<(IReadOnlyList<GroupTaskResponse>? tasks, string? error)> GetTasksForGroupAsync(Guid groupId, string role, Guid userId)
    {
        var groupExists = await _dbContext.Groups.AnyAsync(g => g.Id == groupId);
        if (!groupExists)
        {
            return (null, "Group not found.");
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupId);
            if (!allowed)
            {
                return (null, "Forbidden.");
            }
        }

        var tasks = await _dbContext.GroupTasks
            .Include(x => x.Group)
            .Include(x => x.DiplomaTaskTemplate)
            .Include(x => x.StudentTasks)
            .Where(x => x.GroupId == groupId)
            .OrderBy(x => x.DiplomaTaskTemplate.Order)
            .ThenBy(x => x.Deadline)
            .ToListAsync();

        return (tasks.Select(MapGroupTask).ToList(), null);
    }

    public async Task<(GroupTaskResponse? task, string? error)> CreateGroupTaskAsync(CreateGroupTaskRequest request, string role, Guid userId)
    {
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == request.GroupId);
        if (group is null)
        {
            return (null, "Group not found.");
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, request.GroupId);
            if (!allowed)
            {
                return (null, "Forbidden.");
            }
        }

        var template = await _dbContext.DiplomaTaskTemplates.FirstOrDefaultAsync(t => t.Id == request.TaskTemplateId);
        if (template is null)
        {
            return (null, "Task template not found.");
        }

        if (!template.IsActive)
        {
            return (null, "Task template must be active.");
        }

        var exists = await _dbContext.GroupTasks
            .AnyAsync(x => x.GroupId == request.GroupId && x.DiplomaTaskTemplateId == request.TaskTemplateId);
        if (exists)
        {
            return (null, "Task template is already assigned to this group.");
        }

        var now = DateTime.UtcNow;
        var groupTask = new GroupTask
        {
            Id = Guid.NewGuid(),
            GroupId = request.GroupId,
            DiplomaTaskTemplateId = request.TaskTemplateId,
            Deadline = request.Deadline,
            CreatedAt = now,
            UpdatedAt = null
        };

        _dbContext.GroupTasks.Add(groupTask);

        var students = await _dbContext.StudentProfiles
            .Where(s => s.GroupId == request.GroupId)
            .Select(s => s.Id)
            .ToListAsync();

        foreach (var studentId in students)
        {
            _dbContext.StudentTasks.Add(new StudentTask
            {
                Id = Guid.NewGuid(),
                StudentProfileId = studentId,
                GroupTaskId = groupTask.Id,
                Status = "Pending",
                CurrentMark = null,
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
        var group = await _dbContext.Groups.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null)
        {
            return (null, "Group not found.");
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupId);
            if (!allowed)
            {
                return (null, "Forbidden.");
            }
        }

        if (request.Items.Count == 0)
        {
            return (null, "At least one task template is required.");
        }

        var duplicateTemplateIds = request.Items
            .GroupBy(x => x.TaskTemplateId)
            .Any(g => g.Count() > 1);
        if (duplicateTemplateIds)
        {
            return (null, "Request contains duplicate task template IDs.");
        }

        var templateIds = request.Items.Select(x => x.TaskTemplateId).Distinct().ToList();
        var templates = await _dbContext.DiplomaTaskTemplates
            .Where(t => templateIds.Contains(t.Id))
            .ToListAsync();

        if (templates.Count != templateIds.Count)
        {
            return (null, "One or more task templates were not found.");
        }

        var inactiveTemplate = templates.FirstOrDefault(t => !t.IsActive);
        if (inactiveTemplate is not null)
        {
            return (null, "All selected task templates must be active.");
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
            .Where(s => s.GroupId == groupId)
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
                Deadline = item.Deadline,
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
                    Status = "Pending",
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
            .Include(x => x.Group)
            .Include(x => x.DiplomaTaskTemplate)
            .Include(x => x.StudentTasks)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (groupTask is null)
        {
            return (null, "Group task not found.");
        }

        if (role == "Teacher")
        {
            var allowed = await IsTeacherReviewerOfGroupAsync(userId, groupTask.GroupId);
            if (!allowed)
            {
                return (null, "Forbidden.");
            }
        }

        groupTask.Deadline = request.Deadline;
        groupTask.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();

        return (MapGroupTask(groupTask), null);
    }

    public async Task<(bool success, string? error)> DeleteGroupTaskAsync(Guid id)
    {
        var groupTask = await _dbContext.GroupTasks
            .Include(x => x.StudentTasks)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (groupTask is null)
        {
            return (false, "Group task not found.");
        }

        var hasNonPending = groupTask.StudentTasks.Any(st => st.Status != "Pending");
        if (hasNonPending)
        {
            return (false, "Cannot delete group task because related student tasks are no longer pending.");
        }

        _dbContext.StudentTasks.RemoveRange(groupTask.StudentTasks);
        _dbContext.GroupTasks.Remove(groupTask);
        await _dbContext.SaveChangesAsync();

        return (true, null);
    }

    public async Task<(IReadOnlyList<MyStudentTaskResponse>? tasks, string? error)> GetMyTasksAsync(Guid currentUserId, string role)
    {
        if (role != "Student")
        {
            return (null, "Forbidden.");
        }

        var studentProfile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(s => s.UserId == currentUserId);

        if (studentProfile is null)
        {
            return (null, "Student profile not found.");
        }

        var tasks = await _dbContext.StudentTasks
            .Include(st => st.GroupTask)
            .ThenInclude(gt => gt.DiplomaTaskTemplate)
            .Where(st => st.StudentProfileId == studentProfile.Id)
            .OrderBy(st => st.GroupTask.DiplomaTaskTemplate.Order)
            .ThenBy(st => st.GroupTask.Deadline)
            .ToListAsync();

        var now = DateTime.UtcNow;
        return (tasks.Select(t => MapMyTask(t, now)).ToList(), null);
    }

    public async Task<(MyStudentTaskDetailsResponse? task, string? error)> GetMyTaskByIdAsync(Guid id, Guid currentUserId, string role)
    {
        if (role != "Student")
        {
            return (null, "Forbidden.");
        }

        var studentProfile = await _dbContext.StudentProfiles
            .FirstOrDefaultAsync(s => s.UserId == currentUserId);

        if (studentProfile is null)
        {
            return (null, "Student profile not found.");
        }

        var task = await _dbContext.StudentTasks
            .Include(st => st.GroupTask)
            .ThenInclude(gt => gt.DiplomaTaskTemplate)
            .FirstOrDefaultAsync(st => st.Id == id && st.StudentProfileId == studentProfile.Id);

        if (task is null)
        {
            return (null, "Task not found.");
        }

        var now = DateTime.UtcNow;
        return (MapMyTaskDetails(task, now), null);
    }

    private async Task<bool> IsTeacherReviewerOfGroupAsync(Guid teacherId, Guid groupId)
    {
        return await _dbContext.GroupReviewers.AnyAsync(gr => gr.GroupId == groupId && gr.ReviewerId == teacherId);
    }

    private static GroupTaskResponse MapGroupTask(GroupTask groupTask)
    {
        return new GroupTaskResponse
        {
            Id = groupTask.Id,
            GroupId = groupTask.GroupId,
            GroupName = groupTask.Group.Name,
            TaskTemplateId = groupTask.DiplomaTaskTemplateId,
            TaskTitle = groupTask.DiplomaTaskTemplate.Title,
            TaskDescription = groupTask.DiplomaTaskTemplate.Description,
            TaskOrder = groupTask.DiplomaTaskTemplate.Order,
            Deadline = groupTask.Deadline,
            CreatedAt = groupTask.CreatedAt,
            UpdatedAt = groupTask.UpdatedAt,
            StudentTaskCount = groupTask.StudentTasks.Count
        };
    }

    private static MyStudentTaskResponse MapMyTask(StudentTask task, DateTime now)
    {
        var status = task.Status;
        var displayStatus = status == "Pending" && task.GroupTask.Deadline < now ? "MissedDeadline" : status;
        return new MyStudentTaskResponse
        {
            Id = task.Id,
            GroupTaskId = task.GroupTaskId,
            TaskTemplateId = task.GroupTask.DiplomaTaskTemplateId,
            Title = task.GroupTask.DiplomaTaskTemplate.Title,
            Description = task.GroupTask.DiplomaTaskTemplate.Description,
            Order = task.GroupTask.DiplomaTaskTemplate.Order,
            Deadline = task.GroupTask.Deadline,
            Status = status,
            DisplayStatus = displayStatus,
            CurrentMark = task.CurrentMark,
            CompletedAt = task.CompletedAt,
            LatestSubmissionAt = null,
            LatestReviewerComment = null,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt
        };
    }

    private static MyStudentTaskDetailsResponse MapMyTaskDetails(StudentTask task, DateTime now)
    {
        var status = task.Status;
        var displayStatus = status == "Pending" && task.GroupTask.Deadline < now ? "MissedDeadline" : status;
        return new MyStudentTaskDetailsResponse
        {
            Id = task.Id,
            GroupTaskId = task.GroupTaskId,
            TaskTemplateId = task.GroupTask.DiplomaTaskTemplateId,
            Title = task.GroupTask.DiplomaTaskTemplate.Title,
            Description = task.GroupTask.DiplomaTaskTemplate.Description,
            Order = task.GroupTask.DiplomaTaskTemplate.Order,
            Deadline = task.GroupTask.Deadline,
            Status = status,
            DisplayStatus = displayStatus,
            CurrentMark = task.CurrentMark,
            CompletedAt = task.CompletedAt,
            CreatedAt = task.CreatedAt,
            UpdatedAt = task.UpdatedAt,
            Submissions = [],
            Reviews = []
        };
    }
}
