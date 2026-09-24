namespace DiplomaTracker.Api.DTOs.Teachers;

/// A teacher or administrator offered as an extra reviewer (design 2026-09-24 §3.5).
public sealed record StaffOptionResponse(Guid Id, string Name, string Role, string Email);
