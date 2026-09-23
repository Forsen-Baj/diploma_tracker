using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

public static class SubmissionFileRules
{
    public const long MaxFileBytes = 20L * 1024 * 1024;
    public const long MaxRequestBytes = 90L * 1024 * 1024;
    public const int MaxSupportingFiles = 3;
    private const int MaxOriginalNameLength = 255;

    private static readonly Dictionary<string, string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf"
    };

    /// Phase 8 §3: supporting files are an allowlist too. A file is accepted because it is
    /// recognised, not because it failed to match a list of things known to be bad. Images are
    /// here because a scan or a screenshot is the common reason for a supporting file.
    private static readonly Dictionary<string, string> SupportingContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".pdf"] = "application/pdf",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg"
    };

    private static readonly byte[] PdfSignature = [0x25, 0x50, 0x44, 0x46];
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    private static readonly byte[] JpegSignature = [0xFF, 0xD8, 0xFF];

    public static async Task<string?> ValidateMainAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return WorkflowErrors.MainFileMissing;
        }

        var (name, extension) = Normalize(file.FileName);
        if (name.Length == 0 || !AllowedContentTypes.ContainsKey(extension))
        {
            return WorkflowErrors.FileTypeNotAllowed;
        }

        if (file.Length > MaxFileBytes)
        {
            return WorkflowErrors.FileTooLarge;
        }

        return await MatchesExtensionAsync(file, extension) ? null : WorkflowErrors.FileContentMismatch;
    }

    public static async Task<string?> ValidateSupportingAsync(IReadOnlyList<IFormFile> files)
    {
        if (files.Count > MaxSupportingFiles)
        {
            return WorkflowErrors.TooManyFiles;
        }

        foreach (var file in files)
        {
            var (name, extension) = Normalize(file.FileName);
            if (name.Length == 0 || !SupportingContentTypes.ContainsKey(extension))
            {
                return WorkflowErrors.FileTypeNotAllowed;
            }

            if (file.Length == 0 || file.Length > MaxFileBytes)
            {
                return file.Length == 0 ? WorkflowErrors.FileContentMismatch : WorkflowErrors.FileTooLarge;
            }

            if (!await MatchesExtensionAsync(file, extension))
            {
                return WorkflowErrors.FileContentMismatch;
            }
        }

        return null;
    }

    /// A package is opened; a PDF and an image are matched against their signature. The stream is
    /// buffered because IFormFile's stream is forward-only and the inspector must read it whole.
    private static async Task<bool> MatchesExtensionAsync(IFormFile file, string extension)
    {
        await using var stream = file.OpenReadStream();

        switch (extension.ToLowerInvariant())
        {
            case ".docx":
            case ".pptx":
            {
                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer);
                buffer.Position = 0;
                var kind = extension.Equals(".docx", StringComparison.OrdinalIgnoreCase)
                    ? OfficePackageKind.Word
                    : OfficePackageKind.Presentation;
                return OfficePackageInspector.Inspect(buffer, kind);
            }
            case ".pdf":
                return await StartsWithAsync(stream, PdfSignature);
            case ".png":
                return await StartsWithAsync(stream, PngSignature);
            case ".jpg":
            case ".jpeg":
                return await StartsWithAsync(stream, JpegSignature);
            default:
                return false;
        }
    }

    private static async Task<bool> StartsWithAsync(Stream stream, byte[] signature)
    {
        var header = new byte[signature.Length];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false);
        return read == header.Length && header.AsSpan().SequenceEqual(signature);
    }

    public static string ContentTypeFor(IFormFile file, SubmissionFileKind kind)
    {
        var (_, extension) = Normalize(file.FileName);

        // A supporting file is still served as application/octet-stream on download, whatever it
        // is: being a real PNG does not make it safe to render in place. This value is what is
        // stored, and the download endpoint overrides it for supporting files as it already does.
        return kind == SubmissionFileKind.Main && AllowedContentTypes.TryGetValue(extension, out var contentType)
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
