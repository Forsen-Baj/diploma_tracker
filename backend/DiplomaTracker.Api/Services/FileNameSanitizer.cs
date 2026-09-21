namespace DiplomaTracker.Api.Services;

/// One OS-independent rule for turning arbitrary text into a safe file name component, shared by
/// every place that builds a file name from user input or from data the server composes itself
/// (fix wave L3). `Path.GetInvalidFileNameChars()` is OS-dependent - on Linux it is effectively
/// only '/' and NUL - so control characters and the Windows-reserved characters (`\ / : * ? " < >
/// |`) would otherwise survive on a Linux host and break a later download's Content-Disposition
/// header, or produce a file a Windows client cannot save.
public static class FileNameSanitizer
{
    private static readonly char[] ReservedCharacters = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

    public static string Sanitize(string name)
    {
        var characters = new char[name.Length];
        for (var i = 0; i < name.Length; i++)
        {
            var ch = name[i];
            characters[i] = IsInvalid(ch) ? '_' : ch;
        }

        return new string(characters).TrimEnd('.', ' ');
    }

    private static bool IsInvalid(char ch) =>
        ch < 0x20 || ch == 0x7F || Array.IndexOf(ReservedCharacters, ch) >= 0;
}
