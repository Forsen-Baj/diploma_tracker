using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.DTOs.Staff;

/// A staff role named in a query string. Enum values travel as their names (plan ruling), so a
/// number such as "1" is not a role; names are matched without regard to case.
public static class StaffRoleName
{
    /// True when the value is absent or names a role; `role` is then that role, or null.
    public static bool TryParse(string? value, out StaffRole? role)
    {
        role = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var name = Enum.GetNames<StaffRole>().FirstOrDefault(n => string.Equals(n, value.Trim(), StringComparison.OrdinalIgnoreCase));
        if (name is null)
        {
            return false;
        }

        role = Enum.Parse<StaffRole>(name);
        return true;
    }
}
