namespace DiplomaTracker.Api.Entities;

public class GroupTask
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid DiplomaTaskTemplateId { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime Deadline { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }

    /// Design 2026-09-27 §6.1: the standards controller of this group step. They sit on the panel
    /// of every student step of it that is not yet approved; their approvals count only from
    /// StandardsControllerAssignedAt on.
    public Guid? StandardsControllerId { get; set; }
    public DateTime? StandardsControllerAssignedAt { get; set; }
    public AppUser? StandardsController { get; set; }
    public Group Group { get; set; } = null!;
    public DiplomaTaskTemplate DiplomaTaskTemplate { get; set; } = null!;
    public ICollection<StudentTask> StudentTasks { get; set; } = new List<StudentTask>();
}
