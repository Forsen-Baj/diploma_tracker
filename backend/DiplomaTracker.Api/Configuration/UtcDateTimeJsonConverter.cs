using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DiplomaTracker.Api.Configuration;

/// Every DateTime in this API represents an instant in UTC. EF returns DateTimeKind.Unspecified
/// from datetime2 columns, and the default serializer omits an offset for that kind, which a
/// browser then parses as local time. These converters make every wire value end in "Z" on the
/// way out, and treat an offset-less value as UTC (not local) on the way in.
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetString();
        if (string.IsNullOrEmpty(value))
        {
            return default;
        }

        return ParseAsUtc(value);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(FormatAsUtc(value));
    }

    // Note: the fix-wave spec asked for `DateTimeStyles.AdjustToUniversal | DateTimeStyles.RoundtripKind`
    // on DateTime.Parse. That combination throws at runtime - .NET rejects AdjustToUniversal (and
    // AssumeLocal/AssumeUniversal) together with RoundtripKind with "The DateTimeStyles value
    // RoundtripKind cannot be used with the values AssumeLocal, AssumeUniversal or
    // AdjustToUniversal" (confirmed live: it 500'd the first write this converter touched).
    // DateTimeOffset.Parse with AssumeUniversal + AdjustToUniversal is the standard equivalent:
    // AssumeUniversal treats a naive (offset-less) value as UTC, and AdjustToUniversal converts an
    // explicit offset (including "Z") to the same UTC instant - exactly the two cases §F1 asks for.
    internal static DateTime ParseAsUtc(string value)
    {
        var offset = DateTimeOffset.Parse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);

        return offset.UtcDateTime;
    }

    internal static string FormatAsUtc(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("O", CultureInfo.InvariantCulture);
}

public sealed class UtcNullableDateTimeJsonConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        var value = reader.GetString();
        return string.IsNullOrEmpty(value) ? null : UtcDateTimeJsonConverter.ParseAsUtc(value);
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(UtcDateTimeJsonConverter.FormatAsUtc(value.Value));
    }
}
