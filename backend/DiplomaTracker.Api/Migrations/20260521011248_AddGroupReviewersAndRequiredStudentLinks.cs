using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DiplomaTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupReviewersAndRequiredStudentLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "SupervisorId",
                table: "StudentProfiles",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "StudentProfiles",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "GroupReviewers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReviewerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupReviewers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupReviewers_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GroupReviewers_Users_ReviewerId",
                        column: x => x.ReviewerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StudentProfiles_GroupId",
                table: "StudentProfiles",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_StudentProfiles_SupervisorId",
                table: "StudentProfiles",
                column: "SupervisorId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupReviewers_GroupId_ReviewerId",
                table: "GroupReviewers",
                columns: new[] { "GroupId", "ReviewerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GroupReviewers_ReviewerId",
                table: "GroupReviewers",
                column: "ReviewerId");

            migrationBuilder.Sql(@"
DECLARE @teacherId uniqueidentifier = (
    SELECT TOP(1) [Id]
    FROM [Users]
    WHERE [Role] = 'Teacher' AND [IsActive] = 1
    ORDER BY [CreatedAt]
);
IF @teacherId IS NULL
BEGIN
    SET @teacherId = NEWID();
    INSERT INTO [Users] ([Id], [FirstName], [LastName], [Email], [PasswordHash], [Role], [IsActive], [CreatedAt], [UpdatedAt])
    VALUES (@teacherId, 'Seeded', 'Teacher', 'seeded.teacher@diploma.local', '', 'Teacher', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END;

DECLARE @groupId uniqueidentifier = (
    SELECT TOP(1) [Id]
    FROM [Groups]
    ORDER BY [CreatedAt]
);
IF @groupId IS NULL
BEGIN
    SET @groupId = NEWID();
    INSERT INTO [Groups] ([Id], [Name], [Description], [AcademicYear], [CreatedAt], [UpdatedAt])
    VALUES (@groupId, 'Seed Group A', 'Default seeded group', '2026/2027', SYSUTCDATETIME(), SYSUTCDATETIME());
END;

UPDATE [StudentProfiles]
SET [GroupId] = @groupId
WHERE [GroupId] = '00000000-0000-0000-0000-000000000000';

UPDATE [StudentProfiles]
SET [SupervisorId] = @teacherId
WHERE [SupervisorId] = '00000000-0000-0000-0000-000000000000';
");

            migrationBuilder.AddForeignKey(
                name: "FK_StudentProfiles_Groups_GroupId",
                table: "StudentProfiles",
                column: "GroupId",
                principalTable: "Groups",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StudentProfiles_Users_SupervisorId",
                table: "StudentProfiles",
                column: "SupervisorId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StudentProfiles_Groups_GroupId",
                table: "StudentProfiles");

            migrationBuilder.DropForeignKey(
                name: "FK_StudentProfiles_Users_SupervisorId",
                table: "StudentProfiles");

            migrationBuilder.DropTable(
                name: "GroupReviewers");

            migrationBuilder.DropIndex(
                name: "IX_StudentProfiles_GroupId",
                table: "StudentProfiles");

            migrationBuilder.DropIndex(
                name: "IX_StudentProfiles_SupervisorId",
                table: "StudentProfiles");

            migrationBuilder.AlterColumn<Guid>(
                name: "SupervisorId",
                table: "StudentProfiles",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AlterColumn<Guid>(
                name: "GroupId",
                table: "StudentProfiles",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");
        }
    }
}
