namespace DiplomaTracker.Api.DTOs.Directions;

public class DirectionQuery
{
    public Guid? DepartmentId { get; set; }
    public Guid? ManagerId { get; set; }

    /// Only the caller's own directions.
    public bool Mine { get; set; }
}
