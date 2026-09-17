namespace DiplomaTracker.Api.Services;

public static class OnboardingErrors
{
    public const string RegistrationClosed = "Registration is closed.";
    public const string ClaimDetailsMismatch = "These details don't match an account waiting to be claimed.";
    public const string CurrentPasswordIncorrect = "Current password is incorrect.";
    public const string UserNotFound = "User not found.";

    public const string StudentNotFound = "Student not found.";
    public const string TeacherNotFound = "Teacher not found.";
    public const string GroupNotFound = "Group not found.";
    public const string SupervisorNotFound = "Supervisor not found.";
    public const string SupervisorMustBeActiveTeacher = "Supervisor must be an active teacher.";
    public const string EmailTaken = "Email already exists.";
    public const string StudentNumberTaken = "Student number already exists.";

    public const string ImportFileMissing = "Choose a CSV file to upload.";
    public const string ImportFileNotCsv = "Only .csv files can be imported.";
    public const string ImportFileTooLarge = "The file is larger than 1 MB.";
    public const string ImportFileNotUtf8 = "Save the file as \"CSV UTF-8\" and upload it again.";
    public const string ImportTooManyRows = "The file contains more than 500 students.";
    public const string ImportHeaderInvalid = "The first line must name the columns lastName, firstName, email and studentNumber.";
    public const string ImportHasRowErrors = "The file contains errors. Nothing was imported.";
    public const string ImportConflict = "The student list changed during import; upload the file again.";

    public const string ImportRowFieldsRequired = "lastName, firstName, email and studentNumber are required.";
    public const string ImportRowNamesTooLong = "Names must be at most 100 characters.";
    public const string ImportRowStudentNumberTooLong = "Student number must be at most 32 characters.";
    public const string ImportRowEmailBelongsToNonStudent = "Email belongs to a teacher or an administrator.";
    public const string ImportRowEmailNumberMismatch = "Email belongs to an existing student with a different student number.";
    public const string ImportRowNumberEmailMismatch = "Student number belongs to an existing student with a different email.";

    public static string ImportRowInvalidEmail(string email) => $"\"{email}\" is not a valid email address.";

    public static string ImportRowDuplicateEmail(string email, int firstLine) =>
        $"Email {email} already appears on line {firstLine}.";

    public static string ImportRowDuplicateStudentNumber(string studentNumber, int firstLine) =>
        $"Student number {studentNumber} already appears on line {firstLine}.";

    public static string ImportCsvMisplacedOrUnclosedQuote(int line) =>
        $"The file has a misplaced or unclosed quote near line {line}.";

    public const string TooManyAttempts = "Too many attempts. Try again in a minute.";
}
