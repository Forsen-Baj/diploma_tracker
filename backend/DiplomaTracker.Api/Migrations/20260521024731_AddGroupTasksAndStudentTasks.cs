using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DiplomaTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupTasksAndStudentTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GroupTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DiplomaTaskTemplateId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Deadline = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GroupTasks_DiplomaTaskTemplates_DiplomaTaskTemplateId",
                        column: x => x.DiplomaTaskTemplateId,
                        principalTable: "DiplomaTaskTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GroupTasks_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StudentTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StudentProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupTaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CurrentMark = table.Column<decimal>(type: "decimal(5,2)", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StudentTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StudentTasks_GroupTasks_GroupTaskId",
                        column: x => x.GroupTaskId,
                        principalTable: "GroupTasks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StudentTasks_StudentProfiles_StudentProfileId",
                        column: x => x.StudentProfileId,
                        principalTable: "StudentProfiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GroupTasks_DiplomaTaskTemplateId",
                table: "GroupTasks",
                column: "DiplomaTaskTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupTasks_GroupId_DiplomaTaskTemplateId",
                table: "GroupTasks",
                columns: new[] { "GroupId", "DiplomaTaskTemplateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StudentTasks_GroupTaskId",
                table: "StudentTasks",
                column: "GroupTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_StudentTasks_StudentProfileId_GroupTaskId",
                table: "StudentTasks",
                columns: new[] { "StudentProfileId", "GroupTaskId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StudentTasks");

            migrationBuilder.DropTable(
                name: "GroupTasks");
        }
    }
}
