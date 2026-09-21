using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Faculty> Faculties => Set<Faculty>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<StudentProfile> StudentProfiles => Set<StudentProfile>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupReviewer> GroupReviewers => Set<GroupReviewer>();
    public DbSet<DiplomaTaskTemplate> DiplomaTaskTemplates => Set<DiplomaTaskTemplate>();
    public DbSet<GroupTask> GroupTasks => Set<GroupTask>();
    public DbSet<StudentTask> StudentTasks => Set<StudentTask>();
    public DbSet<PlatformSettings> PlatformSettings => Set<PlatformSettings>();
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<TopicReservation> TopicReservations => Set<TopicReservation>();
    public DbSet<Submission> Submissions => Set<Submission>();
    public DbSet<SubmissionFile> SubmissionFiles => Set<SubmissionFile>();
    public DbSet<DocumentTemplate> DocumentTemplates => Set<DocumentTemplate>();
    public DbSet<ArchivedGroup> ArchivedGroups => Set<ArchivedGroup>();
    public DbSet<ArchivedGroupReviewer> ArchivedGroupReviewers => Set<ArchivedGroupReviewer>();
    public DbSet<ArchivedFile> ArchivedFiles => Set<ArchivedFile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var faculty = modelBuilder.Entity<Faculty>();
        faculty.ToTable("Faculties");
        faculty.HasKey(x => x.Id);
        faculty.Property(x => x.Name).HasMaxLength(200).IsRequired();
        faculty.Property(x => x.ShortName).HasMaxLength(50).IsRequired();
        faculty.Property(x => x.CreatedAt).IsRequired();
        faculty.Property(x => x.UpdatedAt).IsRequired();
        faculty.HasIndex(x => x.Name).IsUnique();
        faculty.HasIndex(x => x.ShortName).IsUnique();

        var department = modelBuilder.Entity<Department>();
        department.ToTable("Departments");
        department.HasKey(x => x.Id);
        department.Property(x => x.Name).HasMaxLength(200).IsRequired();
        department.Property(x => x.ShortName).HasMaxLength(50).IsRequired();
        department.Property(x => x.CreatedAt).IsRequired();
        department.Property(x => x.UpdatedAt).IsRequired();
        department.HasIndex(x => new { x.FacultyId, x.Name }).IsUnique();
        department.HasIndex(x => new { x.FacultyId, x.ShortName }).IsUnique();
        department.HasOne(x => x.Faculty)
            .WithMany(x => x.Departments)
            .HasForeignKey(x => x.FacultyId)
            .OnDelete(DeleteBehavior.Restrict);

        var user = modelBuilder.Entity<AppUser>();
        user.ToTable("Users");
        user.HasKey(x => x.Id);
        user.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        user.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        user.Property(x => x.Patronymic).HasMaxLength(100);
        user.Property(x => x.Email).HasMaxLength(256).IsRequired();
        user.HasIndex(x => x.Email).IsUnique();
        user.Property(x => x.PasswordHash);
        user.Property(x => x.Role).HasMaxLength(50).IsRequired();
        user.Property(x => x.IsActive).IsRequired();
        user.Property(x => x.CreatedAt).IsRequired();
        user.Property(x => x.UpdatedAt).IsRequired();

        var studentProfile = modelBuilder.Entity<StudentProfile>();
        studentProfile.ToTable("StudentProfiles");
        studentProfile.HasKey(x => x.Id);
        studentProfile.Property(x => x.StudentNumber).HasMaxLength(32).IsRequired();
        studentProfile.Property(x => x.StudentNumberCanonical).IsRequired().HasMaxLength(64);
        studentProfile.HasIndex(x => x.StudentNumberCanonical).IsUnique();
        studentProfile.Property(x => x.GroupId).IsRequired();
        studentProfile.Property(x => x.ArchivedAt);
        studentProfile.Property(x => x.CreatedAt).IsRequired();
        studentProfile.Property(x => x.UpdatedAt).IsRequired();
        studentProfile.HasIndex(x => x.UserId).IsUnique();
        studentProfile.HasOne(x => x.User)
            .WithOne(x => x.StudentProfile)
            .HasForeignKey<StudentProfile>(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        studentProfile.HasOne(x => x.Group)
            .WithMany(x => x.Students)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Restrict);
        studentProfile.HasOne(x => x.Supervisor)
            .WithMany(x => x.SupervisedStudents)
            .HasForeignKey(x => x.SupervisorId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);
        studentProfile.HasIndex(x => x.TopicId).IsUnique().HasFilter("[TopicId] IS NOT NULL");
        studentProfile.HasOne(x => x.Topic)
            .WithMany(x => x.Holders)
            .HasForeignKey(x => x.TopicId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        var group = modelBuilder.Entity<Group>();
        group.ToTable("Groups");
        group.HasKey(x => x.Id);
        group.Property(x => x.Code).HasMaxLength(32).IsRequired();
        group.Property(x => x.Description).HasMaxLength(1000);
        group.Property(x => x.AcademicYear).HasMaxLength(20).IsRequired();
        group.Property(x => x.CreatedAt).IsRequired();
        group.Property(x => x.UpdatedAt).IsRequired();
        group.HasIndex(x => new { x.AcademicYear, x.Code }).IsUnique();
        group.HasOne(x => x.Department)
            .WithMany(x => x.Groups)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        var groupReviewer = modelBuilder.Entity<GroupReviewer>();
        groupReviewer.ToTable("GroupReviewers");
        groupReviewer.HasKey(x => x.Id);
        groupReviewer.Property(x => x.CreatedAt).IsRequired();
        groupReviewer.HasIndex(x => new { x.GroupId, x.ReviewerId }).IsUnique();
        groupReviewer.HasOne(x => x.Group)
            .WithMany(x => x.Reviewers)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
        groupReviewer.HasOne(x => x.Reviewer)
            .WithMany(x => x.GroupReviews)
            .HasForeignKey(x => x.ReviewerId)
            .OnDelete(DeleteBehavior.Restrict);

        var taskTemplate = modelBuilder.Entity<DiplomaTaskTemplate>();
        taskTemplate.ToTable("DiplomaTaskTemplates");
        taskTemplate.HasKey(x => x.Id);
        taskTemplate.Property(x => x.Title).HasMaxLength(200).IsRequired();
        taskTemplate.Property(x => x.Description).HasMaxLength(1000);
        taskTemplate.Property(x => x.Order).IsRequired();
        taskTemplate.Property(x => x.IsActive).IsRequired();
        taskTemplate.Property(x => x.CreatedAt).IsRequired();
        taskTemplate.Property(x => x.UpdatedAt).IsRequired();
        taskTemplate.HasIndex(x => x.Title);
        taskTemplate.HasIndex(x => x.FacultyId);
        taskTemplate.HasIndex(x => new { x.FacultyId, x.Order }).IsUnique();
        taskTemplate.HasOne(x => x.Faculty)
            .WithMany(x => x.TaskTemplates)
            .HasForeignKey(x => x.FacultyId)
            .OnDelete(DeleteBehavior.Restrict);

        var groupTask = modelBuilder.Entity<GroupTask>();
        groupTask.ToTable("GroupTasks");
        groupTask.HasKey(x => x.Id);
        groupTask.Property(x => x.StartDate);
        groupTask.Property(x => x.Deadline).IsRequired();
        groupTask.Property(x => x.CreatedAt).IsRequired();
        groupTask.Property(x => x.UpdatedAt);
        groupTask.HasIndex(x => new { x.GroupId, x.DiplomaTaskTemplateId }).IsUnique();
        groupTask.HasOne(x => x.Group)
            .WithMany(x => x.GroupTasks)
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);
        groupTask.HasOne(x => x.DiplomaTaskTemplate)
            .WithMany(x => x.GroupTasks)
            .HasForeignKey(x => x.DiplomaTaskTemplateId)
            .OnDelete(DeleteBehavior.Restrict);

        var studentTask = modelBuilder.Entity<StudentTask>();
        studentTask.ToTable("StudentTasks");
        studentTask.HasKey(x => x.Id);
        studentTask.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        studentTask.Property(x => x.Mark);
        studentTask.Property(x => x.RowVersion).IsRowVersion();
        studentTask.Property(x => x.CreatedAt).IsRequired();
        studentTask.Property(x => x.UpdatedAt);
        studentTask.HasIndex(x => new { x.StudentProfileId, x.GroupTaskId }).IsUnique();
        studentTask.HasOne(x => x.StudentProfile)
            .WithMany(x => x.StudentTasks)
            .HasForeignKey(x => x.StudentProfileId)
            .OnDelete(DeleteBehavior.Cascade);
        studentTask.HasOne(x => x.GroupTask)
            .WithMany(x => x.StudentTasks)
            .HasForeignKey(x => x.GroupTaskId)
            .OnDelete(DeleteBehavior.Cascade);

        var platformSettings = modelBuilder.Entity<PlatformSettings>();
        platformSettings.ToTable("PlatformSettings");
        platformSettings.HasKey(x => x.Id);
        platformSettings.Property(x => x.Id).ValueGeneratedNever();
        platformSettings.Property(x => x.RegistrationOpen).IsRequired();
        platformSettings.Property(x => x.TopicSelectionDeadline);
        platformSettings.HasData(new PlatformSettings
        {
            Id = Entities.PlatformSettings.SingletonId,
            RegistrationOpen = false
        });

        var topic = modelBuilder.Entity<Topic>();
        topic.ToTable("Topics");
        topic.HasKey(x => x.Id);
        topic.Property(x => x.Title).HasMaxLength(300).IsRequired();
        topic.Property(x => x.Description).HasMaxLength(4000);
        topic.Property(x => x.Origin).HasConversion<string>().HasMaxLength(50).IsRequired();
        topic.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        topic.Property(x => x.CreatedAt).IsRequired();
        topic.Property(x => x.UpdatedAt).IsRequired();
        topic.Property(x => x.RowVersion).IsRowVersion();
        topic.HasIndex(x => new { x.DepartmentId, x.Status });
        topic.HasOne(x => x.Supervisor)
            .WithMany(x => x.SupervisedTopics)
            .HasForeignKey(x => x.SupervisorId)
            .OnDelete(DeleteBehavior.Restrict);
        topic.HasOne(x => x.Department)
            .WithMany(x => x.Topics)
            .HasForeignKey(x => x.DepartmentId)
            .OnDelete(DeleteBehavior.Restrict);

        var reservation = modelBuilder.Entity<TopicReservation>();
        reservation.ToTable("TopicReservations");
        reservation.HasKey(x => x.Id);
        reservation.Property(x => x.TopicTitle).HasMaxLength(300).IsRequired();
        reservation.Property(x => x.Status).HasConversion<string>().HasMaxLength(50).IsRequired();
        reservation.Property(x => x.DecisionComment).HasMaxLength(1000);
        reservation.Property(x => x.CreatedAt).IsRequired();
        reservation.HasIndex(x => x.TopicId)
            .IsUnique()
            .HasFilter("[TopicId] IS NOT NULL AND [Status] IN ('Pending', 'Approved')")
            .HasDatabaseName("IX_TopicReservations_ActivePerTopic");
        // Two separate filters, not one on ('Pending', 'Approved'): a student holding an
        // approved topic may have a pending change request at the same time.
        //
        // Both must use the HasIndex(expression, name) overload. EF Core identifies an index by
        // its property set, so two plain HasIndex(x => x.StudentProfileId) calls are the SAME
        // index — the second silently overwrites the first and only one filter reaches the
        // migration, whatever HasDatabaseName says. Naming them at creation makes them distinct.
        reservation.HasIndex(x => x.StudentProfileId, "IX_TopicReservations_PendingPerStudent")
            .IsUnique()
            .HasFilter("[Status] = 'Pending'");
        reservation.HasIndex(x => x.StudentProfileId, "IX_TopicReservations_ApprovedPerStudent")
            .IsUnique()
            .HasFilter("[Status] = 'Approved'");
        reservation.HasIndex(x => new { x.StudentProfileId, x.CreatedAt });
        reservation.HasOne(x => x.Topic)
            .WithMany(x => x.Reservations)
            .HasForeignKey(x => x.TopicId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.SetNull);
        reservation.HasOne(x => x.StudentProfile)
            .WithMany(x => x.TopicReservations)
            .HasForeignKey(x => x.StudentProfileId)
            .OnDelete(DeleteBehavior.Cascade);

        var submission = modelBuilder.Entity<Submission>();
        submission.ToTable("Submissions");
        submission.HasKey(x => x.Id);
        submission.Property(x => x.Message).HasMaxLength(2000);
        submission.Property(x => x.Decision).HasConversion<string>().HasMaxLength(50);
        submission.Property(x => x.ReviewerComment).HasMaxLength(2000);
        submission.Property(x => x.SubmittedAt).IsRequired();
        submission.HasIndex(x => new { x.StudentTaskId, x.Version }).IsUnique();
        submission.HasIndex(x => new { x.Decision, x.SubmittedAt });
        submission.HasOne(x => x.StudentTask)
            .WithMany(x => x.Submissions)
            .HasForeignKey(x => x.StudentTaskId)
            .OnDelete(DeleteBehavior.Cascade);
        submission.HasOne(x => x.Reviewer)
            .WithMany(x => x.ReviewedSubmissions)
            .HasForeignKey(x => x.ReviewerId)
            .IsRequired(false)
            .OnDelete(DeleteBehavior.Restrict);

        var submissionFile = modelBuilder.Entity<SubmissionFile>();
        submissionFile.ToTable("SubmissionFiles");
        submissionFile.HasKey(x => x.Id);
        submissionFile.Property(x => x.Kind).HasConversion<string>().HasMaxLength(50).IsRequired();
        submissionFile.Property(x => x.OriginalName).HasMaxLength(255).IsRequired();
        submissionFile.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        submissionFile.Property(x => x.ContentType).HasMaxLength(200).IsRequired();
        submissionFile.HasOne(x => x.Submission)
            .WithMany(x => x.Files)
            .HasForeignKey(x => x.SubmissionId)
            .OnDelete(DeleteBehavior.Cascade);

        var template = modelBuilder.Entity<DocumentTemplate>();
        template.ToTable("DocumentTemplates");
        template.HasKey(x => x.Id);
        template.Property(x => x.Name).HasMaxLength(200).IsRequired();
        template.Property(x => x.Description).HasMaxLength(1000);
        template.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        template.Property(x => x.OriginalFileName).HasMaxLength(255).IsRequired();
        template.Property(x => x.CreatedAt).IsRequired();
        template.Property(x => x.UpdatedAt).IsRequired();
        template.Property(x => x.RowVersion).IsRowVersion();
        template.HasOne(x => x.Owner)
            .WithMany()
            .HasForeignKey(x => x.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        var templateGroup = modelBuilder.Entity<DocumentTemplateGroup>();
        templateGroup.ToTable("DocumentTemplateGroups");
        templateGroup.HasKey(x => new { x.TemplateId, x.GroupId });
        templateGroup.HasOne(x => x.Template)
            .WithMany(x => x.Groups)
            .HasForeignKey(x => x.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);
        templateGroup.HasOne(x => x.Group)
            .WithMany()
            .HasForeignKey(x => x.GroupId)
            .OnDelete(DeleteBehavior.Cascade);

        var templateTeacher = modelBuilder.Entity<DocumentTemplateTeacher>();
        templateTeacher.ToTable("DocumentTemplateTeachers");
        templateTeacher.HasKey(x => new { x.TemplateId, x.TeacherId });
        templateTeacher.HasOne(x => x.Template)
            .WithMany(x => x.Teachers)
            .HasForeignKey(x => x.TemplateId)
            .OnDelete(DeleteBehavior.Cascade);
        templateTeacher.HasOne(x => x.Teacher)
            .WithMany()
            .HasForeignKey(x => x.TeacherId)
            .OnDelete(DeleteBehavior.Restrict);

        var archivedGroup = modelBuilder.Entity<ArchivedGroup>();
        archivedGroup.ToTable("ArchivedGroups");
        archivedGroup.HasKey(x => x.Id);
        archivedGroup.Property(x => x.GroupCode).HasMaxLength(32).IsRequired();
        archivedGroup.Property(x => x.AcademicYear).HasMaxLength(20).IsRequired();
        archivedGroup.Property(x => x.DepartmentName).HasMaxLength(200).IsRequired();
        archivedGroup.Property(x => x.FacultyName).HasMaxLength(200).IsRequired();
        archivedGroup.Property(x => x.CreatedAt).IsRequired();
        archivedGroup.Property(x => x.UpdatedAt).IsRequired();
        archivedGroup.HasIndex(x => x.SourceGroupId).IsUnique();
        archivedGroup.HasIndex(x => new { x.AcademicYear, x.GroupCode });

        var archivedReviewer = modelBuilder.Entity<ArchivedGroupReviewer>();
        archivedReviewer.ToTable("ArchivedGroupReviewers");
        archivedReviewer.HasKey(x => x.Id);
        archivedReviewer.Property(x => x.ReviewerName).HasMaxLength(300).IsRequired();
        archivedReviewer.HasIndex(x => new { x.ArchivedGroupId, x.ReviewerId }).IsUnique();
        archivedReviewer.HasIndex(x => x.ReviewerId);
        archivedReviewer.HasOne(x => x.ArchivedGroup)
            .WithMany(x => x.Reviewers)
            .HasForeignKey(x => x.ArchivedGroupId)
            .OnDelete(DeleteBehavior.Cascade);

        var archivedFile = modelBuilder.Entity<ArchivedFile>();
        archivedFile.ToTable("ArchivedFiles");
        archivedFile.HasKey(x => x.Id);
        archivedFile.Property(x => x.StudentName).HasMaxLength(300).IsRequired();
        archivedFile.Property(x => x.StudentNumber).HasMaxLength(32).IsRequired();
        archivedFile.Property(x => x.StepTitle).HasMaxLength(300).IsRequired();
        archivedFile.Property(x => x.Decision).HasMaxLength(50);
        archivedFile.Property(x => x.ReviewerName).HasMaxLength(300);
        archivedFile.Property(x => x.ReviewerComment).HasMaxLength(2000);
        archivedFile.Property(x => x.Kind).HasMaxLength(50).IsRequired();
        archivedFile.Property(x => x.OriginalName).HasMaxLength(255).IsRequired();
        archivedFile.Property(x => x.ContentType).HasMaxLength(200).IsRequired();
        archivedFile.Property(x => x.StorageKey).HasMaxLength(200).IsRequired();
        archivedFile.Property(x => x.ArchivedAt).IsRequired();
        // Archiving a student and later deleting their group would otherwise write the same file
        // twice. The service skips keys that are already present; this index is what makes that
        // guarantee hold under a race.
        archivedFile.HasIndex(x => new { x.ArchivedGroupId, x.StorageKey }).IsUnique();
        archivedFile.HasIndex(x => new { x.ArchivedGroupId, x.StudentName, x.StepOrder, x.Version });
        archivedFile.HasOne(x => x.ArchivedGroup)
            .WithMany(x => x.Files)
            .HasForeignKey(x => x.ArchivedGroupId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
