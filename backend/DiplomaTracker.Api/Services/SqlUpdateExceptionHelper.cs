using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

/// <summary>
/// Classifies <see cref="DbUpdateException"/> instances raised by SQL Server so services can
/// translate uniqueness and foreign-key races into the same error strings the pre-save guards use.
/// </summary>
internal static class SqlUpdateExceptionHelper
{
    private const int UniqueIndexViolation = 2601;
    private const int UniqueConstraintViolation = 2627;
    private const int ForeignKeyViolation = 547;

    public static bool IsUniqueConstraintViolation(this DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: UniqueIndexViolation or UniqueConstraintViolation };

    public static bool IsForeignKeyViolation(this DbUpdateException exception) =>
        exception.InnerException is SqlException { Number: ForeignKeyViolation };
}
