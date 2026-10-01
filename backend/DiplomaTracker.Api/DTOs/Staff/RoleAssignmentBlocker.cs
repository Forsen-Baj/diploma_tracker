namespace DiplomaTracker.Api.DTOs.Staff;

/// One piece of work that keeps an assignment from being removed (design 2026-09-27, phase 12, §6).
/// Kind is supervisedStudent, supervisedTopic, panelSeat, managedDirection or controlledStep; Label
/// names it for the administrator.
public sealed record RoleAssignmentBlocker(string Kind, string Label);
