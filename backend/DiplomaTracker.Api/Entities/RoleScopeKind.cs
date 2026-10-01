namespace DiplomaTracker.Api.Entities;

/// Where a role assignment applies. A faculty covers its departments and groups; a department its
/// groups (design 2026-09-27, phase 12, §3). Stored as its name.
public enum RoleScopeKind
{
    Faculty,
    Department,
    Group
}
