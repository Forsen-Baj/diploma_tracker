using DiplomaTracker.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StudentProfile> StudentProfiles => Set<StudentProfile>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupReviewer> GroupReviewers => Set<GroupReviewer>();
    public DbSet<DiplomaTaskTemplate> DiplomaTaskTemplates => Set<DiplomaTaskTemplate>();
    public DbSet<GroupTask> GroupTasks => Set<GroupTask>();
    public DbSet<StudentTask> StudentTasks => Set<StudentTask>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var user = modelBuilder.Entity<AppUser>();
        user.ToTable("Users");
        user.HasKey(x => x.Id);
        user.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
        user.Property(x => x.LastName).HasMaxLength(100).IsRequired();
        user.Property(x => x.Email).HasMaxLength(256).IsRequired();
        user.HasIndex(x => x.Email).IsUnique();
        user.Property(x => x.PasswordHash).IsRequired();
        user.Property(x => x.Role).HasMaxLength(50).IsRequired();
        user.Property(x => x.IsActive).IsRequired();
        user.Property(x => x.CreatedAt).IsRequired();
        user.Property(x => x.UpdatedAt).IsRequired();

        var studentProfile = modelBuilder.Entity<StudentProfile>();
        studentProfile.ToTable("StudentProfiles");
        studentProfile.HasKey(x => x.Id);
        studentProfile.Property(x => x.DiplomaTopic).HasMaxLength(500).IsRequired();
        studentProfile.Property(x => x.GroupId).IsRequired();
        studentProfile.Property(x => x.SupervisorId).IsRequired();
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
            .OnDelete(DeleteBehavior.Restrict);

        var group = modelBuilder.Entity<Group>();
        group.ToTable("Groups");
        group.HasKey(x => x.Id);
        group.Property(x => x.Name).HasMaxLength(200).IsRequired();
        group.Property(x => x.Description).HasMaxLength(1000);
        group.Property(x => x.AcademicYear).HasMaxLength(50).IsRequired();
        group.Property(x => x.CreatedAt).IsRequired();
        group.Property(x => x.UpdatedAt).IsRequired();
        group.HasIndex(x => new { x.Name, x.AcademicYear }).IsUnique();

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

        var groupTask = modelBuilder.Entity<GroupTask>();
        groupTask.ToTable("GroupTasks");
        groupTask.HasKey(x => x.Id);
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
        studentTask.Property(x => x.Status).HasMaxLength(50).IsRequired();
        studentTask.Property(x => x.CurrentMark).HasColumnType("decimal(5,2)");
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
    }
}
