namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class SetStandardsControllerRequest
{
    /// The new standards controller, or null to remove the current one.
    public Guid? UserId { get; set; }
}
