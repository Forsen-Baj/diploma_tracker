using System.IO.Compression;
using System.Xml;

namespace DiplomaTracker.Api.Services;

public enum OfficePackageKind
{
    Word,
    Presentation
}

/// Phase 8 §3. A .docx and a .pptx are ZIP archives of XML parts, and every ZIP file on earth
/// begins with the same four bytes - so a Java archive renamed thesis.docx passes a magic-number
/// check and is then stored and served as a Word document. This opens the package instead.
///
/// Every limit is read from the ZIP directory before a single entry is decompressed, so the
/// inspection cannot itself be turned into a decompression bomb. The budgets are phase 6's,
/// unchanged; the required-part rules are new.
public static class OfficePackageInspector
{
    public const int MaxEntries = 1_000;
    public const long MaxUncompressedBytes = 100L * 1024 * 1024;
    public const long MaxXmlUncompressedBytes = 20L * 1024 * 1024;
    public const int MaxXmlDepth = 128;

    // Phase 6's audited cap (fix wave M2): the entry-length budget above bounds compressed/
    // uncompressed bytes, but a small compressed part can still stream a very large character
    // count once the XmlReader decodes it, so the character count itself needs its own limit.
    public const long MaxXmlCharactersPerEntry = 20_000_000;

    private const string ContentTypesEntry = "[Content_Types].xml";

    public static bool Inspect(Stream content, OfficePackageKind kind)
    {
        if (content.CanSeek)
        {
            content.Position = 0;
        }

        try
        {
            using var archive = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);
            if (archive.Entries.Count > MaxEntries)
            {
                return false;
            }

            var requiredFolder = kind == OfficePackageKind.Word ? "word/" : "ppt/";
            var hasContentTypes = false;
            var hasRequiredPart = false;
            long uncompressedTotal = 0;
            long xmlTotal = 0;

            foreach (var entry in archive.Entries)
            {
                uncompressedTotal += entry.Length;
                if (uncompressedTotal > MaxUncompressedBytes)
                {
                    return false;
                }

                var name = entry.FullName.Replace('\\', '/');

                if (string.Equals(name, ContentTypesEntry, StringComparison.OrdinalIgnoreCase))
                {
                    hasContentTypes = true;
                }

                if (name.StartsWith(requiredFolder, StringComparison.OrdinalIgnoreCase) && entry.Length > 0)
                {
                    hasRequiredPart = true;
                }

                if (!IsBudgetedXmlEntry(name, requiredFolder))
                {
                    continue;
                }

                xmlTotal += entry.Length;
                if (xmlTotal > MaxXmlUncompressedBytes || !IsSafeXmlEntry(entry))
                {
                    return false;
                }
            }

            return hasContentTypes && hasRequiredPart;
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or ArgumentException)
        {
            return false;
        }
        finally
        {
            if (content.CanSeek)
            {
                content.Position = 0;
            }
        }
    }

    /// The SDK parses every top-level XML part of the main folder into a DOM, so that subset gets
    /// a much smaller budget than the whole package.
    private static bool IsBudgetedXmlEntry(string normalizedName, string requiredFolder)
    {
        if (!normalizedName.StartsWith(requiredFolder, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var rest = normalizedName[requiredFolder.Length..];
        return rest.Length > 0 && !rest.Contains('/') && rest.EndsWith(".xml", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSafeXmlEntry(ZipArchiveEntry entry)
    {
        try
        {
            using var stream = entry.Open();
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit,
                XmlResolver = null,
                CloseInput = true,
                MaxCharactersInDocument = MaxXmlCharactersPerEntry
            });

            while (reader.Read())
            {
                if (reader.Depth > MaxXmlDepth)
                {
                    return false;
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is XmlException or InvalidDataException or IOException)
        {
            return false;
        }
    }
}
