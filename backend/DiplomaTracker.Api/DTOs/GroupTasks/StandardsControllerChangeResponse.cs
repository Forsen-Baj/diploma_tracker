namespace DiplomaTracker.Api.DTOs.GroupTasks;

public class StandardsControllerChangeResponse
{
    public Guid GroupTaskId { get; set; }

    /// Student steps of this group step that were not yet approved - the ones the change applies to.
    public int AffectedSteps { get; set; }

    /// Of those, the Submitted steps the change left with every seat satisfied, approved at once.
    public int ApprovedSteps { get; set; }
}
