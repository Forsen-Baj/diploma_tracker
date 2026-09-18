using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TaskErrors
{
    public const string TemplateNotFound = "taskTemplate.notFound";
    public const string TemplateOrderInvalid = "taskTemplate.orderInvalid";
    public const string TemplateTitleRequired = "taskTemplate.titleRequired";
    public const string TemplateTitleTaken = "taskTemplate.titleTaken";
    public const string TemplateFacultyNotFound = "taskTemplate.facultyNotFound";
    public const string TemplateInUse = "taskTemplate.inUse";
    public const string TemplateOrderTaken = "taskTemplate.orderTaken";

    public const string GroupTaskNotFound = "groupTask.notFound";
    public const string GroupTaskGroupNotFound = "groupTask.groupNotFound";
    public const string GroupTaskTemplateNotFound = "groupTask.templateNotFound";
    public const string GroupTaskTemplateInactive = "groupTask.templateInactive";
    public const string GroupTaskAlreadyAssigned = "groupTask.alreadyAssigned";
    public const string GroupTaskNoTemplates = "groupTask.noTemplates";
    public const string GroupTaskDuplicateTemplates = "groupTask.duplicateTemplates";
    public const string GroupTaskHasProgress = "groupTask.hasProgress";
    public const string GroupTaskStartAfterDeadline = "groupTask.startAfterDeadline";
    public const string GroupTaskTemplateFacultyMismatch = "groupTask.templateFacultyMismatch";

    public const string StudentTaskNotFound = "studentTask.notFound";
    public const string StudentProfileNotFound = "student.profileNotFound";

    public static readonly ErrorDefinition[] All =
    [
        new(TemplateNotFound, StatusCodes.Status404NotFound, "Task template not found."),
        new(TemplateOrderInvalid, StatusCodes.Status400BadRequest, "Order must be greater than 0."),
        new(TemplateTitleRequired, StatusCodes.Status400BadRequest, "Title is required."),
        new(TemplateTitleTaken, StatusCodes.Status409Conflict, "Active template with this title already exists."),
        new(TemplateFacultyNotFound, StatusCodes.Status400BadRequest, "The selected faculty does not exist."),
        new(TemplateInUse, StatusCodes.Status409Conflict, "Cannot change the faculty of a task template that is assigned to a group."),
        new(TemplateOrderTaken, StatusCodes.Status409Conflict, "Another step in this faculty already uses this order."),
        new(GroupTaskNotFound, StatusCodes.Status404NotFound, "Group task not found."),
        new(GroupTaskGroupNotFound, StatusCodes.Status400BadRequest, "The selected group does not exist."),
        new(GroupTaskTemplateNotFound, StatusCodes.Status400BadRequest, "One or more selected task templates do not exist."),
        new(GroupTaskTemplateInactive, StatusCodes.Status400BadRequest, "Selected task templates must be active."),
        new(GroupTaskAlreadyAssigned, StatusCodes.Status409Conflict, "Task template is already assigned to this group."),
        new(GroupTaskNoTemplates, StatusCodes.Status400BadRequest, "At least one task template is required."),
        new(GroupTaskDuplicateTemplates, StatusCodes.Status400BadRequest, "Request contains duplicate task templates."),
        new(GroupTaskHasProgress, StatusCodes.Status409Conflict, "Cannot delete group task because related student tasks are no longer pending."),
        new(GroupTaskStartAfterDeadline, StatusCodes.Status400BadRequest, "Start date cannot be later than the deadline."),
        new(GroupTaskTemplateFacultyMismatch, StatusCodes.Status400BadRequest, "The task template's faculty does not match the group's faculty."),
        new(StudentTaskNotFound, StatusCodes.Status404NotFound, "Task not found."),
        new(StudentProfileNotFound, StatusCodes.Status404NotFound, "Student profile not found.")
    ];
}
