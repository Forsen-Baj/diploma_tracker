namespace DiplomaTracker.Api.DTOs.Staff;

/// The pickers (design 2026-09-27, phase 12, §4). `studentTaskId` asks for the extra-reviewer
/// picker of that step: administrators and teachers who cover the student's group. Otherwise `role`
/// narrows to staff holding it - for `groupId` or `departmentId` when given, anywhere when not.
/// Bound from the query string; enum names are matched without regard to case.
public class StaffOptionsQuery
{
    public string? Search { get; set; }
    /// A StaffRole name (StaffRoleName); a number is refused.
    public string? Role { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? DepartmentId { get; set; }
    public Guid? StudentTaskId { get; set; }
}
