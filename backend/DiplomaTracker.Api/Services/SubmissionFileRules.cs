using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class SubmissionFileRules
{
    public const long MaxFileBytes = 20L * 1024 * 1024;
    public const long MaxRequestBytes = 90L * 1024 * 1024;
    public const int MaxSupportingFiles = 3;
    private const int MaxOriginalNameLength = 255;

    private static readonly Dictionary<string, string> MainContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf"
    };

    private static readonly HashSet<string> BlockedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".dll", ".msi", ".bat", ".cmd", ".ps1", ".sh", ".js", ".vbs", ".jar", ".com", ".scr"
    };

    private static readonly byte[] ZipSignature = [0x50, 0x4B, 0x03, 0x04];
    private static readonly byte[] PdfSignature = [0x25, 0x50, 0x44, 0x46];

    public static async Task<string?> ValidateMainAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return WorkflowErrors.MainFileMissing;
        }

        var (name, extension) = Normalize(file.FileName);
        if (name.Length == 0 || !MainContentTypes.ContainsKey(extension))
        {
            return WorkflowErrors.FileTypeNotAllowed;
        }

        if (file.Length > MaxFileBytes)
        {
            return WorkflowErrors.FileTooLarge;
        }

        var header = new byte[4];
        await using var stream = file.OpenReadStream();
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false);
        var expected = extension.Equals(".pdf", StringComparison.OrdinalIgnoreCase) ? PdfSignature : ZipSignature;
        return read == header.Length && header.AsSpan().SequenceEqual(expected) ? null : WorkflowErrors.FileContentMismatch;
    }

    public static string? ValidateSupporting(IReadOnlyList<IFormFile> files)
    {
        if (files.Count > MaxSupportingFiles)
        {
            return WorkflowErrors.TooManyFiles;
        }

        foreach (var file in files)
        {
            var (name, extension) = Normalize(file.FileName);
            if (name.Length == 0 || BlockedExtensions.Contains(extension))
            {
                return WorkflowErrors.FileTypeNotAllowed;
            }

            if (file.Length > MaxFileBytes)
            {
                return WorkflowErrors.FileTooLarge;
            }
        }

        return null;
    }

    public static string ContentTypeFor(IFormFile file, SubmissionFileKind kind)
    {
        var (_, extension) = Normalize(file.FileName);
        return kind == SubmissionFileKind.Main && MainContentTypes.TryGetValue(extension, out var contentType)
            ? contentType
            : "application/octet-stream";
    }

    public static string SafeOriginalName(string fileName)
    {
        var (name, _) = Normalize(fileName);
        return name.Length <= MaxOriginalNameLength ? name : TakeHead(name, MaxOriginalNameLength);
    }

    /// A trailing dot or space is stripped by Windows (and by browsers writing a download to
    /// disk) before the name ever reaches the filesystem, so "tool.exe." and "tool.exe " are the
    /// same file as "tool.exe" as far as the OS is concerned. Path.GetExtension does not know
    /// this: it returns "" for a name ending in a dot and ".exe " (with the space) for one ending
    /// in a space, so neither matches the blocklist. Sanitizing once, here (fix wave L3: control
    /// characters and the Windows-reserved characters replaced, trailing dot/space trimmed),
    /// closes that gap for both the main-file allowlist and the supporting-file blocklist, and
    /// protects every later use of the name (Content-Disposition, on-disk storage key, generated
    /// document names).
    private static (string Name, string Extension) Normalize(string fileName)
    {
        var trimmed = FileNameSanitizer.Sanitize(Path.GetFileName(fileName));
        return (trimmed, Path.GetExtension(trimmed));
    }

    private static string TakeHead(string name, int maxLength)
    {
        var extension = Path.GetExtension(name);
        var stem = name[..^extension.Length];
        var budget = maxLength - extension.Length;

        return budget <= 0 ? SurrogateSafeSlice(name, maxLength) : SurrogateSafeSlice(stem, budget) + extension;
    }

    /// Keeps the first `maxLength` UTF-16 code units, backing off by one when that would split a
    /// surrogate pair (leaving a lone high surrogate, which is invalid UTF-16 and cannot be
    /// stored or re-encoded safely).
    private static string SurrogateSafeSlice(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        var length = maxLength;
        if (length > 0 && char.IsHighSurrogate(value[length - 1]))
        {
            length--;
        }

        return value[..length];
    }
}
