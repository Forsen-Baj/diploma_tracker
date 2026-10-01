namespace DiplomaTracker.Api.DTOs.Directions;

public class DirectionQuery
{
    public Guid? DepartmentId { get; set; }
    public Guid? ManagerId { get; set; }

    /// Only the caller's own directions.
    public bool Mine { get; set; }

    /// Only directions of departments the caller's acting role covers - the ones a teacher may
    /// publish topics under (design 2026-09-27, phase 12, §4).
    public bool Covered { get; set; }
}
