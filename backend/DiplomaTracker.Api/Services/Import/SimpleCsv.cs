using System.Text;

namespace DiplomaTracker.Api.Services.Import;

public sealed record CsvRecord(int LineNumber, IReadOnlyList<string> Fields);

/// <summary>
/// Thrown when the CSV text has a quote that is not a valid field opener, a valid field closer,
/// or part of a doubled quote inside a quoted field.
/// </summary>
public sealed class CsvFormatException : Exception
{
    public CsvFormatException(int line)
    {
        Line = line;
    }

    public int Line { get; }
}

/// <summary>
/// Minimal RFC 4180 tokenizer: quoted fields, doubled quotes, CRLF or LF line ends, and quoted line breaks.
/// Line numbers are 1-based and refer to the line on which a record starts.
/// A quote only opens a quoted field at the start of a field; a quote anywhere else in an
/// unquoted field, or any character other than the delimiter/line break/end of input right after
/// a closing quote, is a malformed-file error. An unterminated quoted field at end of input is
/// also an error.
/// </summary>
public static class SimpleCsv
{
    public static char DetectDelimiter(string text)
    {
        var semicolons = 0;
        var commas = 0;
        var inQuotes = false;

        foreach (var ch in text)
        {
            if (ch == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (!inQuotes && (ch == '\r' || ch == '\n'))
            {
                break;
            }
            else if (!inQuotes && ch == ';')
            {
                semicolons++;
            }
            else if (!inQuotes && ch == ',')
            {
                commas++;
            }
        }

        return semicolons > commas ? ';' : ',';
    }

    public static IReadOnlyList<CsvRecord> Parse(string text, char delimiter)
    {
        var records = new List<CsvRecord>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var fieldStarted = false;
        var afterClosingQuote = false;
        var line = 1;
        var recordLine = 1;
        var quoteOpenedOnLine = 0;
        var index = 0;

        while (index < text.Length)
        {
            var ch = text[index];

            if (inQuotes)
            {
                if (ch == '"')
                {
                    if (index + 1 < text.Length && text[index + 1] == '"')
                    {
                        field.Append('"');
                        index += 2;
                        continue;
                    }

                    inQuotes = false;
                    afterClosingQuote = true;
                    index++;
                    continue;
                }

                if (ch == '\n')
                {
                    line++;
                }

                field.Append(ch);
                index++;
                continue;
            }

            if (ch == '"')
            {
                if (fieldStarted)
                {
                    throw new CsvFormatException(line);
                }

                inQuotes = true;
                fieldStarted = true;
                quoteOpenedOnLine = line;
                index++;
                continue;
            }

            if (ch == delimiter)
            {
                fields.Add(field.ToString());
                field.Clear();
                fieldStarted = false;
                afterClosingQuote = false;
                index++;
                continue;
            }

            if (ch == '\r' || ch == '\n')
            {
                fields.Add(field.ToString());
                field.Clear();
                records.Add(new CsvRecord(recordLine, fields.ToArray()));
                fields.Clear();
                fieldStarted = false;
                afterClosingQuote = false;

                if (ch == '\r' && index + 1 < text.Length && text[index + 1] == '\n')
                {
                    index++;
                }

                index++;
                line++;
                recordLine = line;
                continue;
            }

            if (afterClosingQuote)
            {
                throw new CsvFormatException(line);
            }

            field.Append(ch);
            fieldStarted = true;
            index++;
        }

        if (inQuotes)
        {
            throw new CsvFormatException(quoteOpenedOnLine);
        }

        if (field.Length > 0 || fields.Count > 0)
        {
            fields.Add(field.ToString());
            records.Add(new CsvRecord(recordLine, fields.ToArray()));
        }

        return records;
    }
}
