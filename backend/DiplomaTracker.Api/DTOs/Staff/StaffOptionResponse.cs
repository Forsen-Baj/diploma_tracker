namespace DiplomaTracker.Api.DTOs.Staff;

/// A staff member or an administrator offered by a picker (design 2026-09-24 §3.5). Role is the
/// account role, Admin or Staff.
public sealed record StaffOptionResponse(Guid Id, string Name, string Role, string Email);
