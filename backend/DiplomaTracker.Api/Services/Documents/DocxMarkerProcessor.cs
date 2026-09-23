using System.Text.RegularExpressions;
using System.Xml;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace DiplomaTracker.Api.Services.Documents;

public static partial class DocxMarkerProcessor
{
    // A paragraph whose own text is this long cannot come from a legitimate template (fix wave
    // H1) - refused at upload before the marker regex ever runs against it.
    private const int MaxParagraphTextLength = 100_000;

    // Fix wave M2 (sec): caps the DOM a single part can grow to when the SDK loads it, mirroring
    // the zip pre-check's per-entry XML budget (OfficePackageInspector.Inspect).
    private const int MaxCharactersInPart = 20_000_000;

    private static readonly OpenSettings PartSizeLimit = new() { MaxCharactersInPart = MaxCharactersInPart };

    // Matches any {{ ... }} pair with no braces between them, so a typo such as
    // {{студент.імя}} or {{student-name}} is recognised as a marker (and refused as unknown)
    // rather than silently passed through - see pre-flight A2. Linear (no nested quantifiers that
    // can backtrack) per fix wave H1/security-audit H1; the key is trimmed by the caller rather
    // than trimmed inside the pattern, so an all-whitespace or empty key is treated as unknown.
    // The explicit timeout is defence in depth even though the pattern itself cannot backtrack.
    [GeneratedRegex(@"\{\{([^{}]*)\}\}", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex MarkerPattern();

    public static bool TryReadMarkers(Stream docx, out IReadOnlySet<string> markers)
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        markers = found;

        try
        {
            using var document = WordprocessingDocument.Open(docx, false, PartSizeLimit);
            if (document.MainDocumentPart?.Document is null || !IsSafePackage(document))
            {
                return false;
            }

            foreach (var root in Roots(document))
            {
                foreach (var texts in TextsByParagraph(root).Values)
                {
                    if (texts.Count == 0)
                    {
                        continue;
                    }

                    var text = string.Concat(texts.Select(t => t.Text));
                    if (text.Length > MaxParagraphTextLength)
                    {
                        return false;
                    }

                    foreach (Match match in MarkerPattern().Matches(text))
                    {
                        found.Add(match.Groups[1].Value.Trim());
                    }
                }
            }

            return true;
        }
        catch (Exception exception) when (exception is OpenXmlPackageException or InvalidDataException
            or FileFormatException or IOException or XmlException or ArgumentException
            or NotSupportedException or InvalidOperationException or RegexMatchTimeoutException)
        {
            return false;
        }
    }

    public static byte[] Fill(Stream source, DocumentContext context)
    {
        using var buffer = new MemoryStream();
        source.CopyTo(buffer);
        buffer.Position = 0;

        using (var document = WordprocessingDocument.Open(buffer, true, PartSizeLimit))
        {
            // Fix wave L8: a generated document must not carry the template author's identity or
            // authoring environment forward to every recipient.
            ClearAuthorProperties(document);

            foreach (var root in Roots(document))
            {
                foreach (var texts in TextsByParagraph(root).Values)
                {
                    FillParagraph(texts, context);
                }

                if (root is OpenXmlPartRootElement partRoot)
                {
                    partRoot.Save();
                }
            }
        }

        return buffer.ToArray();
    }

    // Fix wave M1 (sec) + review M1: refuses a package that could carry active or external
    // content to every recipient - macro-enabled/template packages, embedded OLE objects or
    // packages, ActiveX controls, a VBA project, an altChunk import, ribbon/custom-UI
    // customisation, an external relationship other than a plain hyperlink, a remote attached
    // template, or a field code that fetches or executes external content.
    private static bool IsSafePackage(WordprocessingDocument document)
    {
        if (document.DocumentType != WordprocessingDocumentType.Document)
        {
            return false;
        }

        foreach (var part in document.GetAllParts())
        {
            if (part is VbaProjectPart or VbaDataPart or EmbeddedPackagePart or EmbeddedObjectPart
                or EmbeddedControlPersistencePart or AlternativeFormatImportPart or CustomUIPart
                or RibbonExtensibilityPart)
            {
                return false;
            }

            // The Open XML SDK does not put every external relationship in ExternalRelationships:
            // one with relationship type "hyperlink" - the common case, and exactly how a remote
            // UNC path or a non-http(s)/mailto scheme would arrive - is routed to the part's own
            // HyperlinkRelationships collection instead, and is invisible to ExternalRelationships
            // alone. DataPartReferenceRelationships (embedded media) is included too, defensively,
            // even though its members reference an internal DataPart and are not external in
            // practice; every one of the three is filtered by IsExternal before the URI is judged.
            foreach (var external in part.ExternalRelationships
                .Concat<ReferenceRelationship>(part.HyperlinkRelationships)
                .Concat(part.DataPartReferenceRelationships)
                .Where(r => r.IsExternal))
            {
                if (!IsAllowedExternalUri(external.Uri))
                {
                    return false;
                }
            }
        }

        if (document.MainDocumentPart!.DocumentSettingsPart?.Settings?.GetFirstChild<AttachedTemplate>() is not null)
        {
            return false;
        }

        foreach (var root in Roots(document))
        {
            // Re-review new defect 2: a complex field's instruction text is legitimately (and
            // trivially, for an attacker) split across several <w:instrText> elements between its
            // w:fldChar begin and the first separate/end, so each FieldCode must never be judged
            // in isolation - the whole field's instruction has to be reassembled first.
            foreach (var instruction in ComplexFieldInstructions(root))
            {
                if (HasDangerousInstruction(instruction))
                {
                    return false;
                }
            }

            foreach (var simpleField in root.Descendants<SimpleField>())
            {
                if (HasDangerousInstruction(simpleField.Instruction?.Value))
                {
                    return false;
                }
            }
        }

        return true;
    }

    private static bool IsAllowedExternalUri(Uri uri) =>
        uri.IsAbsoluteUri && uri.Scheme is "http" or "https" or "mailto";

    // Re-review new defect 2: walks a root's descendants in document order, tracking complex
    // field boundaries with a stack so nested fields are handled correctly, and yields the
    // reassembled instruction text of each field (the concatenation of every FieldCode between
    // its w:fldChar begin and the first separate/end it reaches).
    private static IEnumerable<string> ComplexFieldInstructions(OpenXmlElement root)
    {
        var open = new Stack<System.Text.StringBuilder>();

        foreach (var element in root.Descendants())
        {
            if (element is FieldChar fieldChar)
            {
                var type = fieldChar.FieldCharType?.Value;
                if (type == FieldCharValues.Begin)
                {
                    open.Push(new System.Text.StringBuilder());
                }
                else if ((type == FieldCharValues.Separate || type == FieldCharValues.End) && open.Count > 0)
                {
                    yield return open.Pop().ToString();
                }
            }
            else if (element is FieldCode fieldCode && open.Count > 0)
            {
                open.Peek().Append(fieldCode.Text);
            }
        }
    }

    // Re-review new defect 1: matches only the instruction's leading keyword (the first
    // whitespace-delimited token, trimmed, case-insensitive) against an exact blocklist, rather
    // than a raw substring search - a substring search wrongly refused HYPERLINK (it contains
    // "LINK") even though HYPERLINK cannot fetch or execute external content on its own.
    private static readonly HashSet<string> DangerousFieldKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        "INCLUDE", "INCLUDETEXT", "INCLUDEPICTURE", "INCLUDETIFF", "LINK", "DDE", "DDEAUTO",
    };

    private static bool HasDangerousInstruction(string? instruction)
    {
        if (string.IsNullOrWhiteSpace(instruction))
        {
            return false;
        }

        var trimmed = instruction.AsSpan().TrimStart();
        var end = 0;
        while (end < trimmed.Length && !char.IsWhiteSpace(trimmed[end]))
        {
            end++;
        }

        return DangerousFieldKeywords.Contains(trimmed[..end].ToString());
    }

    private static void ClearAuthorProperties(WordprocessingDocument document)
    {
        var core = document.PackageProperties;
        core.Creator = string.Empty;
        core.LastModifiedBy = string.Empty;
        core.LastPrinted = null;
        // Title/Subject are left as authored - unlike Creator/Company they are reviewer-facing
        // content, not authoring-environment metadata, so clearing them is not "trivially easy"
        // without also losing something the recipient may expect to see (fix wave L8).

        var extended = document.ExtendedFilePropertiesPart?.Properties;
        if (extended is null)
        {
            return;
        }

        if (extended.Company is not null) extended.Company.Text = string.Empty;
        if (extended.Manager is not null) extended.Manager.Text = string.Empty;
        if (extended.Template is not null) extended.Template.Text = string.Empty;
        extended.Save();
    }

    private static IEnumerable<OpenXmlElement> Roots(WordprocessingDocument document)
    {
        var main = document.MainDocumentPart!;
        yield return main.Document!;

        foreach (var header in main.HeaderParts)
        {
            if (header.Header is not null) yield return header.Header;
        }

        foreach (var footer in main.FooterParts)
        {
            if (footer.Footer is not null) yield return footer.Footer;
        }

        // Fix wave M2 (review): footnotes, endnotes and comments carry runs and paragraphs just
        // like the body, so a marker placed there was previously accepted at upload and then
        // never filled in - every recipient would see the raw {{...}}.
        if (main.FootnotesPart?.Footnotes is not null) yield return main.FootnotesPart.Footnotes;
        if (main.EndnotesPart?.Endnotes is not null) yield return main.EndnotesPart.Endnotes;
        if (main.WordprocessingCommentsPart?.Comments is not null) yield return main.WordprocessingCommentsPart.Comments;
    }

    // Fix wave M2 (sec): a single pass per root that assigns every Text to its nearest enclosing
    // Paragraph, replacing the old per-paragraph `Descendants<Text>().Where(Ancestors...)` scan
    // (O(paragraphs x depth) - quadratic for a deeply nested document such as one built from
    // nested text boxes). A Text inside a paragraph nested in another paragraph's drawing (a text
    // box) is grouped under the nested paragraph, matching the previous "own text" semantics.
    private static Dictionary<Paragraph, List<Text>> TextsByParagraph(OpenXmlElement root)
    {
        var map = new Dictionary<Paragraph, List<Text>>();
        Visit(root, null);
        return map;

        void Visit(OpenXmlElement element, Paragraph? current)
        {
            if (element is Paragraph paragraph)
            {
                current = paragraph;
                if (!map.ContainsKey(paragraph))
                {
                    map[paragraph] = [];
                }
            }
            else if (element is Text text && current is not null)
            {
                map[current].Add(text);
            }

            foreach (var child in element.Elements())
            {
                Visit(child, current);
            }
        }
    }

    private static void FillParagraph(List<Text> texts, DocumentContext context)
    {
        if (texts.Count == 0)
        {
            return;
        }

        var matches = MarkerPattern().Matches(string.Concat(texts.Select(t => t.Text))).ToList();
        for (var index = matches.Count - 1; index >= 0; index--)
        {
            var match = matches[index];
            var value = MarkerVocabulary.Resolve(match.Groups[1].Value.Trim(), context);
            ReplaceRange(texts, match.Index, match.Index + match.Length, value);
        }
    }

    private static void ReplaceRange(List<Text> texts, int start, int end, string value)
    {
        var (startText, startOffset) = Locate(texts, start);
        var (endText, endOffset) = Locate(texts, end - 1);

        var suffix = texts[endText].Text[(endOffset + 1)..];
        var prefix = texts[startText].Text[..startOffset];

        for (var i = startText + 1; i <= endText; i++)
        {
            texts[i].Text = i == endText ? suffix : string.Empty;
            texts[i].Space = SpaceProcessingModeValues.Preserve;
        }

        var lines = value.Replace("\r\n", "\n").Split('\n');
        var target = texts[startText];
        target.Text = prefix + lines[0] + (startText == endText ? suffix : string.Empty);
        target.Space = SpaceProcessingModeValues.Preserve;

        OpenXmlElement anchor = target;
        foreach (var line in lines.Skip(1))
        {
            var lineBreak = new Break();
            anchor.InsertAfterSelf(lineBreak);
            var next = new Text(line) { Space = SpaceProcessingModeValues.Preserve };
            lineBreak.InsertAfterSelf(next);
            anchor = next;
        }

        if (lines.Length > 1 && startText == endText)
        {
            target.Text = prefix + lines[0];
            ((Text)anchor).Text += suffix;
        }
    }

    private static (int textIndex, int offset) Locate(List<Text> texts, int position)
    {
        var consumed = 0;
        for (var i = 0; i < texts.Count; i++)
        {
            var length = texts[i].Text.Length;
            if (position < consumed + length)
            {
                return (i, position - consumed);
            }

            consumed += length;
        }

        return (texts.Count - 1, Math.Max(0, texts[^1].Text.Length - 1));
    }
}
