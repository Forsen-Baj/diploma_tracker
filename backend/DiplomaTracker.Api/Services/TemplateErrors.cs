using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class TemplateErrors
{
    public const string NotFound = "template.notFound";
    public const string NotOwner = "template.notOwner";
    public const string FileMissing = "template.fileMissing";
    public const string InvalidFile = "template.invalidFile";
    public const string UnknownMarkers = "template.unknownMarkers";
    public const string TooLarge = "template.tooLarge";
    public const string AudienceNotAllowed = "template.audienceNotAllowed";
    public const string GroupInvalid = "template.groupInvalid";
    public const string TeacherInvalid = "template.teacherInvalid";

    public static readonly ErrorDefinition[] All =
    [
        new(NotFound, StatusCodes.Status404NotFound, "Template not found."),
        new(NotOwner, StatusCodes.Status403Forbidden, "You can change only your own templates."),
        new(FileMissing, StatusCodes.Status400BadRequest, "Attach a .docx template."),
        new(InvalidFile, StatusCodes.Status400BadRequest, "The file is not a valid Word document."),
        new(UnknownMarkers, StatusCodes.Status400BadRequest, "The template contains unknown markers."),
        new(TooLarge, StatusCodes.Status400BadRequest, "The template is larger than 10 MB."),
        new(AudienceNotAllowed, StatusCodes.Status403Forbidden, "You cannot share the template with this audience."),
        new(GroupInvalid, StatusCodes.Status400BadRequest, "A selected group does not exist."),
        new(TeacherInvalid, StatusCodes.Status400BadRequest, "A selected teacher does not exist or is inactive.")
    ];
}
