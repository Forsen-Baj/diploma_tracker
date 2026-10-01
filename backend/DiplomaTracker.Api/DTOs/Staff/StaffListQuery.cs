namespace DiplomaTracker.Api.DTOs.Staff;

/// The administrator's staff list. With `role`, only staff holding it - for `groupId` or
/// `departmentId` when given (the student form's supervisor list).
public class StaffListQuery
{
    /// A StaffRole name (StaffRoleName); a number is refused.
    public string? Role { get; set; }
    public Guid? GroupId { get; set; }
    public Guid? DepartmentId { get; set; }
}
