using System.Text;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services.Import;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class StudentImportService : IStudentImportService
{
    public const long MaxFileBytes = 1024 * 1024;
    public const int MaxRows = 500;

    private const string LastNameColumn = "lastname";
    private const string FirstNameColumn = "firstname";
    private const string PatronymicColumn = "patronymic";
    private const string EmailColumn = "email";
    private const string StudentNumberColumn = "studentnumber";
    private static readonly string[] RequiredColumns = [LastNameColumn, FirstNameColumn, EmailColumn, StudentNumberColumn];
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    private readonly AppDbContext _dbContext;

    public StudentImportService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<StudentImportOutcome> ImportAsync(Guid groupId, IFormFile? file)
    {
        if (!await _dbContext.Groups.AnyAsync(g => g.Id == groupId))
        {
            return StudentImportOutcome.Failed(OnboardingErrors.GroupNotFound);
        }

        if (file is null || file.Length == 0)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileMissing);
        }

        if (!string.Equals(Path.GetExtension(file.FileName), ".csv", StringComparison.OrdinalIgnoreCase))
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileNotCsv);
        }

        if (file.Length > MaxFileBytes)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileTooLarge);
        }

        var text = await ReadStrictUtf8Async(file);
        if (text is null)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportFileNotUtf8);
        }

        List<CsvRecord> records;
        try
        {
            records = SimpleCsv.Parse(text, SimpleCsv.DetectDelimiter(text))
                .Where(record => record.Fields.Any(value => !string.IsNullOrWhiteSpace(value)))
                .ToList();
        }
        catch (CsvFormatException exception)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportCsvMisplacedOrUnclosedQuote(exception.Line));
        }

        var columns = records.Count == 0 ? null : MapColumns(records[0].Fields);
        if (columns is null)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportHeaderInvalid);
        }

        var dataRecords = records.Skip(1).ToList();
        if (dataRecords.Count > MaxRows)
        {
            return StudentImportOutcome.Failed(OnboardingErrors.ImportTooManyRows);
        }

        var errors = new List<ImportRowError>();
        var rows = ValidateRows(dataRecords, columns, errors);

        var emails = rows.Select(r => r.Email).ToList();
        var numbers = rows.Select(r => r.StudentNumber).ToList();

        var usersByEmail = await _dbContext.Users.AsNoTracking()
            .Include(u => u.StudentProfile)
            .Where(u => emails.Contains(u.Email))
            .ToDictionaryAsync(u => u.Email);

        var numbersInUse = await _dbContext.StudentProfiles.AsNoTracking()
            .Where(p => numbers.Contains(p.StudentNumber))
            .Select(p => p.StudentNumber)
            .ToListAsync();
        var numbersInUseSet = numbersInUse.ToHashSet();

        var skipped = new List<SkippedImportRow>();
        var toCreate = new List<ImportRow>();

        foreach (var row in rows)
        {
            if (usersByEmail.TryGetValue(row.Email, out var existingUser))
            {
                if (existingUser.Role != "Student" || existingUser.StudentProfile is null)
                {
                    errors.Add(new ImportRowError(row.Line, OnboardingErrors.ImportRowEmailBelongsToNonStudent));
                }
                else if (existingUser.StudentProfile.StudentNumber != row.StudentNumber)
                {
                    errors.Add(new ImportRowError(row.Line, OnboardingErrors.ImportRowEmailNumberMismatch));
                }
                else
                {
                    skipped.Add(new SkippedImportRow(row.Line, row.Email));
                }
            }
            else if (numbersInUseSet.Contains(row.StudentNumber))
            {
                errors.Add(new ImportRowError(row.Line, OnboardingErrors.ImportRowNumberEmailMismatch));
            }
            else
            {
                toCreate.Add(row);
            }
        }

        if (errors.Count > 0)
        {
            return StudentImportOutcome.Invalid(errors.OrderBy(e => e.Line).ToList());
        }

        var now = DateTime.UtcNow;
        foreach (var row in toCreate)
        {
            var user = new AppUser
            {
                Id = Guid.NewGuid(),
                FirstName = row.FirstName,
                LastName = row.LastName,
                Patronymic = row.Patronymic,
                Email = row.Email,
                PasswordHash = null,
                Role = "Student",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            };

            _dbContext.Users.Add(user);
            _dbContext.StudentProfiles.Add(new StudentProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                StudentNumber = row.StudentNumber,
                GroupId = groupId,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return StudentImportOutcome.Failed(OnboardingErrors.ImportConflict);
        }
        catch (DbUpdateException exception) when (exception.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return StudentImportOutcome.Failed(OnboardingErrors.GroupNotFound);
        }

        return StudentImportOutcome.Succeeded(new StudentImportResult
        {
            Created = toCreate.Count,
            Skipped = skipped
        });
    }

    private static async Task<string?> ReadStrictUtf8Async(IFormFile file)
    {
        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer);

        try
        {
            var text = StrictUtf8.GetString(buffer.ToArray());
            return text.Length > 0 && text[0] == (char)0xFEFF ? text[1..] : text;
        }
        catch (DecoderFallbackException)
        {
            return null;
        }
    }

    private static Dictionary<string, int>? MapColumns(IReadOnlyList<string> header)
    {
        var columns = new Dictionary<string, int>();
        for (var i = 0; i < header.Count; i++)
        {
            var name = header[i].Trim().ToLowerInvariant();
            if (name.Length > 0 && !columns.ContainsKey(name))
            {
                columns[name] = i;
            }
        }

        return RequiredColumns.All(columns.ContainsKey) ? columns : null;
    }

    private static List<ImportRow> ValidateRows(
        IReadOnlyList<CsvRecord> records,
        IReadOnlyDictionary<string, int> columns,
        List<ImportRowError> errors)
    {
        var rows = new List<ImportRow>();
        var emailLines = new Dictionary<string, int>();
        var numberLines = new Dictionary<string, int>();

        foreach (var record in records)
        {
            string Value(string column) =>
                columns.TryGetValue(column, out var index) && index < record.Fields.Count
                    ? record.Fields[index].Trim()
                    : string.Empty;

            var lastName = Value(LastNameColumn);
            var firstName = Value(FirstNameColumn);
            var patronymic = Value(PatronymicColumn);
            var email = IdentityNormalizer.Email(Value(EmailColumn));
            var studentNumber = IdentityNormalizer.StudentNumber(Value(StudentNumberColumn));
            var errorsBefore = errors.Count;

            if (lastName.Length == 0 || firstName.Length == 0 || email.Length == 0 || studentNumber.Length == 0)
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowFieldsRequired));
                continue;
            }

            if (lastName.Length > 100 || firstName.Length > 100 || patronymic.Length > 100)
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowNamesTooLong));
            }

            if (email.Length > 256 || !IdentityNormalizer.IsValidEmail(email))
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowInvalidEmail(email)));
            }

            if (studentNumber.Length > 32)
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowStudentNumberTooLong));
            }

            if (emailLines.TryGetValue(email, out var firstEmailLine))
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowDuplicateEmail(email, firstEmailLine)));
            }
            else
            {
                emailLines[email] = record.LineNumber;
            }

            if (numberLines.TryGetValue(studentNumber, out var firstNumberLine))
            {
                errors.Add(new ImportRowError(record.LineNumber, OnboardingErrors.ImportRowDuplicateStudentNumber(studentNumber, firstNumberLine)));
            }
            else
            {
                numberLines[studentNumber] = record.LineNumber;
            }

            if (errors.Count == errorsBefore)
            {
                rows.Add(new ImportRow(
                    record.LineNumber,
                    lastName,
                    firstName,
                    patronymic.Length == 0 ? null : patronymic,
                    email,
                    studentNumber));
            }
        }

        return rows;
    }

    private sealed record ImportRow(
        int Line,
        string LastName,
        string FirstName,
        string? Patronymic,
        string Email,
        string StudentNumber);
}
