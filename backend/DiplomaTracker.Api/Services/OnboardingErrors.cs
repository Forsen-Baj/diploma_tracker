using DiplomaTracker.Api.Errors;

namespace DiplomaTracker.Api.Services;

public static class OnboardingErrors
{
    public const string InvalidCredentials = "auth.invalidCredentials";
    public const string RegistrationClosed = "registration.closed";
    public const string ClaimDetailsMismatch = "auth.claimMismatch";
    public const string CurrentPasswordIncorrect = "auth.currentPasswordIncorrect";
    public const string UserNotFound = "auth.userNotFound";

    public const string StudentNotFound = "student.notFound";
    public const string TeacherNotFound = "teacher.notFound";
    public const string GroupNotFound = "student.groupNotFound";
    public const string SupervisorNotFound = "student.supervisorNotFound";
    public const string SupervisorMustBeActiveTeacher = "student.supervisorInvalid";
    public const string SupervisorLockedByTopic = "student.supervisorLockedByTopic";
    public const string EmailTaken = "user.emailTaken";
    public const string StudentNumberTaken = "student.numberTaken";
    public const string StudentArchived = "student.archived";

    public const string ImportGroupNotFound = "import.groupNotFound";
    public const string ImportFileMissing = "import.fileMissing";
    public const string ImportFileNotCsv = "import.notCsv";
    public const string ImportFileTooLarge = "import.tooLarge";
    public const string ImportFileNotUtf8 = "import.notUtf8";
    public const string ImportTooManyRows = "import.tooManyRows";
    public const string ImportHeaderInvalid = "import.headerInvalid";
    public const string ImportHasRowErrors = "import.rowErrors";
    public const string ImportConflict = "import.conflict";

    public const string RowRequired = "import.row.required";
    public const string RowNameTooLong = "import.row.nameTooLong";
    public const string RowInvalidEmail = "import.row.invalidEmail";
    public const string RowNumberTooLong = "import.row.numberTooLong";
    public const string RowDuplicateEmail = "import.row.duplicateEmail";
    public const string RowDuplicateNumber = "import.row.duplicateNumber";
    public const string RowStaffEmail = "import.row.staffEmail";
    public const string RowEmailNumberMismatch = "import.row.emailNumberMismatch";
    public const string RowNumberEmailMismatch = "import.row.numberEmailMismatch";
    public const string RowMalformedQuote = "import.row.malformedQuote";

    public static readonly ErrorDefinition[] All =
    [
        new(InvalidCredentials, StatusCodes.Status401Unauthorized, "Invalid email or password."),
        new(RegistrationClosed, StatusCodes.Status403Forbidden, "Registration is closed."),
        new(ClaimDetailsMismatch, StatusCodes.Status400BadRequest, "These details don't match an account waiting to be claimed."),
        new(CurrentPasswordIncorrect, StatusCodes.Status400BadRequest, "Current password is incorrect."),
        new(UserNotFound, StatusCodes.Status401Unauthorized, "User not found."),
        new(StudentNotFound, StatusCodes.Status404NotFound, "Student not found."),
        new(TeacherNotFound, StatusCodes.Status404NotFound, "Teacher not found."),
        new(GroupNotFound, StatusCodes.Status400BadRequest, "The selected group does not exist."),
        new(SupervisorNotFound, StatusCodes.Status400BadRequest, "The selected supervisor does not exist."),
        new(SupervisorMustBeActiveTeacher, StatusCodes.Status400BadRequest, "Supervisor must be an active teacher."),
        new(SupervisorLockedByTopic, StatusCodes.Status409Conflict, "This student's supervisor is set by their topic; change the topic instead."),
        new(EmailTaken, StatusCodes.Status409Conflict, "Email already exists."),
        new(StudentNumberTaken, StatusCodes.Status409Conflict, "Student number already exists."),
        new(StudentArchived, StatusCodes.Status409Conflict, "Student is archived."),
        new(ImportGroupNotFound, StatusCodes.Status404NotFound, "Group not found."),
        new(ImportFileMissing, StatusCodes.Status400BadRequest, "Choose a CSV file to upload."),
        new(ImportFileNotCsv, StatusCodes.Status400BadRequest, "Only .csv files can be imported."),
        new(ImportFileTooLarge, StatusCodes.Status400BadRequest, "The file is larger than 1 MB."),
        new(ImportFileNotUtf8, StatusCodes.Status400BadRequest, "Save the file as \"CSV UTF-8\" and upload it again."),
        new(ImportTooManyRows, StatusCodes.Status400BadRequest, "The file contains more than 500 students."),
        new(ImportHeaderInvalid, StatusCodes.Status400BadRequest, "The first line must name the columns lastName, firstName, email and studentNumber."),
        new(ImportHasRowErrors, StatusCodes.Status400BadRequest, "The file contains errors. Nothing was imported."),
        new(ImportConflict, StatusCodes.Status409Conflict, "The student list changed during import; upload the file again."),
        new(PasswordPolicy.Violation, StatusCodes.Status400BadRequest, "Password must be between 8 and 128 characters."),
        new(PasswordPolicy.ElevatedViolation, StatusCodes.Status400BadRequest, "An administrator password must be between 12 and 128 characters.")
    ];

    public static readonly IReadOnlyDictionary<string, string> RowMessages = new Dictionary<string, string>
    {
        [RowRequired] = "lastName, firstName, email and studentNumber are required.",
        [RowNameTooLong] = "Names must be at most 100 characters.",
        [RowInvalidEmail] = "\"{email}\" is not a valid email address.",
        [RowNumberTooLong] = "Student number must be at most 32 characters.",
        [RowDuplicateEmail] = "Email {email} already appears on line {line}.",
        [RowDuplicateNumber] = "Student number {number} already appears on line {line}.",
        [RowStaffEmail] = "Email belongs to a teacher or an administrator.",
        [RowEmailNumberMismatch] = "Email belongs to an existing student with a different student number.",
        [RowNumberEmailMismatch] = "Student number {number} already belongs to an existing student with a different email.",
        [RowMalformedQuote] = "The file has a misplaced or unclosed quote."
    };
}
