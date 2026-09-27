namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class GroupTaskResponse
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public string GroupCode { get; set; } = string.Empty;
    public Guid TaskTemplateId { get; set; }
    public string TaskTitle { get; set; } = string.Empty;
    public string? TaskDescription { get; set; }
    public int TaskOrder { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime Deadline { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int StudentTaskCount { get; set; }

    /// Design 2026-09-27 §6.1.
    public Guid? StandardsControllerId { get; set; }
    public string? StandardsControllerName { get; set; }

    /// Students of the group whose step the current controller has approved.
    public int StandardsControlApproved { get; set; }

    /// Students whose step the current controller checks: every step not approved before the
    /// controller was assigned, since approved steps keep their result (§6.1).
    public int StandardsControlTotal { get; set; }

    /// Students whose step is approved now - the ones a newly assigned controller leaves alone.
    public int ApprovedStepCount { get; set; }
}
