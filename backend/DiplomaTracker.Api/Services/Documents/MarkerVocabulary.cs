using System.Globalization;
using System.Text;
using System.Xml;

namespace DiplomaTracker.Api.Services.Documents;

public static class MarkerVocabulary
{
    private static readonly (string Key, Func<DocumentContext, string?> Value)[] Definitions =
    [
        ("student.lastName", c => c.Student?.LastName),
        ("student.firstName", c => c.Student?.FirstName),
        ("student.patronymic", c => c.Student?.Patronymic),
        ("student.fullName", c => FullName(c.Student)),
        ("student.shortName", c => ShortName(c.Student)),
        ("student.email", c => c.Student?.Email),
        ("student.number", c => c.StudentNumber),
        ("group.code", c => c.GroupCode),
        ("group.academicYear", c => c.AcademicYear),
        ("department.name", c => c.DepartmentName),
        ("department.shortName", c => c.DepartmentShortName),
        ("faculty.name", c => c.FacultyName),
        ("faculty.shortName", c => c.FacultyShortName),
        ("topic.title", c => c.TopicTitle),
        ("topic.description", c => c.TopicDescription),
        ("supervisor.fullName", c => FullName(c.Supervisor)),
        ("supervisor.shortName", c => ShortName(c.Supervisor)),
        ("supervisor.email", c => c.Supervisor?.Email),
        ("date.today", c => ToKyiv(c.NowUtc).ToString("dd.MM.yyyy", CultureInfo.InvariantCulture)),
        ("date.year", c => ToKyiv(c.NowUtc).Year.ToString(CultureInfo.InvariantCulture))
    ];

    private static readonly Dictionary<string, Func<DocumentContext, string?>> ByKey =
        Definitions.ToDictionary(d => d.Key, d => d.Value, StringComparer.OrdinalIgnoreCase);

    private static readonly (TimeZoneInfo Zone, bool IsUtcFallback) KyivResolution = ResolveKyivTimeZone();
    private static TimeZoneInfo KyivTimeZone => KyivResolution.Zone;

    // Fix wave M15: read once by Program.cs at startup so it can log a single warning if the
    // Kyiv time zone could not be resolved (a trimmed Linux container without tzdata/ICU) -
    // otherwise date.today silently uses UTC, printing yesterday's date between 00:00 and
    // 02:00/03:00 Kyiv time with no trace of why.
    public static bool KyivTimeZoneFallenBackToUtc => KyivResolution.IsUtcFallback;

    public static IReadOnlyList<string> Keys { get; } = Definitions.Select(d => d.Key).ToList();

    public static bool IsKnown(string key) => ByKey.ContainsKey(key);

    public static string Resolve(string key, DocumentContext context) =>
        NormalizeValue(ByKey.TryGetValue(key, out var resolve) ? resolve(context) ?? string.Empty : string.Empty);

    // Fix wave I2 / security-audit L2: every resolved value goes straight into a Word run's text.
    // Word's plain-text clipboard writes a manual line break (Shift+Enter) as U+000B, and other C0
    // control characters can arrive through the JSON API or CSV-imported names; the XML writer
    // (CheckCharacters defaults to true) throws when it meets one, turning every generation that
    // uses that value into a 500. All line-break variants are normalised to '\n' (ReplaceRange
    // already turns that into a Word line break); a tab is kept as a literal tab character (the
    // runs it lands in are marked xml:space="preserve", so Word renders it as a tab stop); every
    // other character invalid in XML 1.0 is dropped, with surrogate pairs kept or dropped whole.
    private static string NormalizeValue(string value)
    {
        if (value.Length == 0)
        {
            return value;
        }

        var builder = new StringBuilder(value.Length);
        var i = 0;
        while (i < value.Length)
        {
            var ch = value[i];

            if (ch == '\r')
            {
                builder.Append('\n');
                i += i + 1 < value.Length && value[i + 1] == '\n' ? 2 : 1;
                continue;
            }

            if (ch is '\v' or '\f' or (char)0x2028 or (char)0x2029)
            {
                builder.Append('\n');
                i++;
                continue;
            }

            if (ch is '\n' or '\t')
            {
                builder.Append(ch);
                i++;
                continue;
            }

            if (char.IsHighSurrogate(ch) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                if (XmlConvert.IsXmlSurrogatePair(value[i + 1], ch))
                {
                    builder.Append(ch);
                    builder.Append(value[i + 1]);
                }

                i += 2;
                continue;
            }

            if (XmlConvert.IsXmlChar(ch))
            {
                builder.Append(ch);
            }

            i++;
        }

        return builder.ToString();
    }

    private static string? FullName(DocumentPerson? person) =>
        person is null
            ? null
            : string.Join(' ', new[] { person.LastName, person.FirstName, person.Patronymic }.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static string? ShortName(DocumentPerson? person)
    {
        if (person is null)
        {
            return null;
        }

        static string Initial(string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : $" {char.ToUpperInvariant(value.Trim()[0])}.";
        return $"{person.LastName}{Initial(person.FirstName)}{Initial(person.Patronymic)}";
    }

    private static DateTime ToKyiv(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), KyivTimeZone);

    private static (TimeZoneInfo Zone, bool IsUtcFallback) ResolveKyivTimeZone()
    {
        foreach (var id in new[] { "Europe/Kyiv", "Europe/Kiev", "FLE Standard Time" })
        {
            try
            {
                return (TimeZoneInfo.FindSystemTimeZoneById(id), false);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return (TimeZoneInfo.Utc, true);
    }
}
