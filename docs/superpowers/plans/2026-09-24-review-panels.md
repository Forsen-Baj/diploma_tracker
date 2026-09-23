# Review Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every student step is reviewed by a panel — the student's supervisor plus any extra reviewers added to that one step — where each reviewer approves with their own mark or returns the work, approvals stick across versions, and the step is approved with the rounded average once the whole panel has approved.

**Architecture:** Two new entities hold the panel's facts: `StudentTaskReviewer` (an extra seat on one step) and `SubmissionReview` (one reviewer's decision on one version). The panel itself is never stored. A pure `ReviewPanel` evaluator derives it on every read from the current supervisor, the extra rows and the recorded approvals. `StudentWorkflowService` loads those facts in bulk (`LoadPanelFactsAsync`) and uses the evaluator for decisions, step pages, *My work* and the queue. Every decision and panel change touches `StudentTask.UpdatedAt`, so the step's existing `RowVersion` serialises concurrent writes. `IAccessScope` gains one step-level rule for extra reviewers.

**Tech Stack:** .NET 8, EF Core 8.0.8 (SQL Server), React 18.3, TypeScript 5.8, Tailwind 4, Headless UI 2, react-i18next.

**Spec:** `docs/superpowers/specs/2026-09-24-review-panels-and-document-routing-design.md` (§3 and §5; §4 is phase 10 and not part of this plan)

**Prerequisites:** phases 1–8 implemented and committed (branch `feature-dms` at `40bfe8c` or later).

## Global Constraints

- A step's panel is the student's **current** supervisor plus one seat per `StudentTaskReviewer` row; it is derived on read, never stored as a list.
- Extra reviewers: active users whose role is `Teacher` or `Admin`; added per student step; never the current supervisor; at most once per step.
- Who changes a panel: the student's supervisor, a reviewer of the student's group, or an administrator — while the step is not `Approved` and the student is not archived.
- Group reviewers watch (progress, step pages, files) and change panels; they do **not** decide.
- Seat a decision fills: the caller's own seat (supervisor, else extra); an administrator with no seat of their own fills the supervisor seat.
- Approval: a mark 0–100 (whole number) and an optional comment of at most 2000 characters. Return: a comment is required.
- One return sends the step back at once. Approvals already given **stay**; after resubmission only open seats decide.
- Step mark = the average of the marks behind every satisfied seat, rounded to a whole number, **half away from zero**.
- A removal that leaves every remaining seat satisfied while the step is `Submitted` approves the step at that moment.
- An approved step is final; its panel can no longer change (`step.alreadyApproved`).
- An extra reviewer sees only the steps they sit on: step page, files, queue. Not the group, not the student's other steps.
- Error bodies follow the `{ code, message }` contract; every new code goes into `WorkflowErrors.All` **and** into both `src/i18n/uk.json` and `src/i18n/en.json`.
- Every `DateTime` is UTC; never `DateTime.Now`.
- **No unit tests.** The existing test project must still compile and pass (56 tests).
- **Commits: exactly one**, in the final task: `Implement review panels`. One bare title line, no body, no trailer.
- Never stage `PROJECT_PAPER.md`, `frontend/diploma-tracker-web/README.md`, anything under `App_Data/`, or `.superpowers/sdd/`.
- The local database is recreated (regenerated `InitialCreate`), with the owner's permission.

## Rulings recorded while planning

- **`panel.changed` (409)** is added beyond the spec's code list. A panel edit that loses a `RowVersion` race against a decision needs its own answer: the step changed, so the caller should reload. `submission.alreadyDecided` would misdescribe it.
- **An extra seat counts only approvals given after it was added** (`DecidedAt >= AddedAt`). So removing and re-adding a reviewer needs a fresh approval. This matches §3.3: removal means their approval stops counting.
- **An extra reviewer who becomes the supervisor** (after a topic change) is absorbed into the supervisor seat. Their extra row is ignored by the evaluator, so no seat can be left open that nobody can fill.
- **`ArchivedFile.Mark` becomes the step mark**, set on the version whose outcome is `Approved`. Each reviewer's own mark lives in `ArchivedReview`.
- **The teacher queue lists only open seats.** A group reviewer with no seat has an empty queue, and their dashboard's *waiting* count is their open seats. The administrator's queue lists every undecided submission.
- **`GET /api/student-tasks/{id}/reviewers`** returns exactly the `panel` of the step detail, under the same access rule.
- **The step page shows the panel to everyone who can open the step**, the student included. Only people who may change it see *Add reviewer* and the remove actions.
- **Page markup is specified with complete code for the new components**, and as focused edits for existing pages.

## File Map

| Path | Responsibility |
|---|---|
| `backend/DiplomaTracker.Api/Entities/ReviewSeat.cs`, `StudentTaskReviewer.cs`, `SubmissionReview.cs`, `ArchivedReview.cs` | New domain |
| `backend/DiplomaTracker.Api/Entities/Submission.cs`, `StudentTask.cs`, `AppUser.cs`, `ArchivedFile.cs`, `ArchivedGroup.cs` | Adjusted domain |
| `backend/DiplomaTracker.Api/Data/AppDbContext.cs`, `Migrations/*` | Mapping and schema |
| `backend/DiplomaTracker.Api/Services/ReviewPanel.cs` | Pure panel evaluator |
| `backend/DiplomaTracker.Api/Services/WorkflowErrors.cs`, `SecurityLog.cs` | Codes and log events |
| `backend/DiplomaTracker.Api/Interfaces/IAccessScope.cs`, `Services/AccessScope.cs` | Step-level visibility |
| `backend/DiplomaTracker.Api/DTOs/Workflow/*` | Contracts |
| `backend/DiplomaTracker.Api/Interfaces/IStudentWorkflowService.cs`, `Services/StudentWorkflowService.cs` | Decisions, panel reads and changes, queue |
| `backend/DiplomaTracker.Api/Services/DashboardService.cs` | Latest decision from reviews |
| `backend/DiplomaTracker.Api/Services/ArchiveService.cs`, `DTOs/Archive/ArchiveResponses.cs` | Archived reviews |
| `backend/DiplomaTracker.Api/Controllers/StudentTasksController.cs`, `StaffController.cs` | HTTP |
| `backend/DiplomaTracker.Api/Interfaces/ITeacherService.cs`, `Services/TeacherService.cs`, `DTOs/Teachers/StaffOptionResponse.cs` | Staff directory |
| `.superpowers/checks/review-panels-check.mjs` (new), `workflow-check.mjs`, `hardening-check.mjs` | Endpoint verification |
| `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md` | Demo data |
| `frontend/diploma-tracker-web/src/api/types.ts`, `workflowApi.ts` | Client |
| `frontend/diploma-tracker-web/src/components/workflow/ReviewPanelCard.tsx`, `AddReviewerDialog.tsx` (new), `StepDetails.tsx`, `StepTimeline.tsx`, `DecisionPanel.tsx` | Step page |
| `frontend/diploma-tracker-web/src/pages/ReviewQueuePage.tsx`, `StudentMyTasksPage.tsx`, `ArchivedGroupPage.tsx` | Pages |
| `frontend/diploma-tracker-web/src/i18n/uk.json`, `en.json` | Translations |
| `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md` | Project records |

---

### Task 1: Review panel model, rules and decisions

This task replaces the single-reviewer decision everywhere it is read or written. The build is green at its end.

**Files:**
- Create: `backend/DiplomaTracker.Api/Entities/ReviewSeat.cs`, `StudentTaskReviewer.cs`, `SubmissionReview.cs`, `ArchivedReview.cs`
- Create: `backend/DiplomaTracker.Api/Services/ReviewPanel.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Workflow/PanelSeatResponse.cs`
- Modify: `backend/DiplomaTracker.Api/Entities/Submission.cs`, `StudentTask.cs`, `AppUser.cs`, `ArchivedFile.cs`, `ArchivedGroup.cs`
- Modify: `backend/DiplomaTracker.Api/Data/AppDbContext.cs`
- Modify: `backend/DiplomaTracker.Api/Services/WorkflowErrors.cs`, `SecurityLog.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IAccessScope.cs`, `Services/AccessScope.cs`
- Modify: `backend/DiplomaTracker.Api/DTOs/Workflow/StudentStepResponse.cs`, `StepDetailsResponse.cs`, `SubmissionResponse.cs`, `ReviewQueueItem.cs`
- Modify: `backend/DiplomaTracker.Api/Services/StudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/DashboardService.cs`
- Modify: `backend/DiplomaTracker.Api/Services/ArchiveService.cs`, `DTOs/Archive/ArchiveResponses.cs`

**Interfaces:**
- Produces: `ReviewSeat { Supervisor, Extra }`; `AppDbContext.StudentTaskReviewers`, `.SubmissionReviews`, `.ArchivedReviews`; `ReviewPanel.Evaluate/SeatFor/IsSeatSatisfied`; `IAccessScope.CanSeeStudentTaskAsync(UserContext, Guid studentTaskId)`; the error constants `WorkflowErrors.NotOnPanel`, `SeatSatisfied`, `PanelReviewerInvalid`, `PanelReviewerIsSupervisor`, `PanelReviewerExists`, `PanelReviewerNotFound`, `PanelNotAllowed`, `PanelChanged`; `SecurityLog.ReviewPanelChanged`. `StudentWorkflowService` private helpers used by Task 2: `LoadPanelFactsAsync(IReadOnlyCollection<Guid>) → Dictionary<Guid, PanelFacts>`, `CompleteStep(Submission, StudentTask, ReviewPanel.PanelState, DateTime)`.
- Response shapes (camelCase on the wire): `StudentStepResponse` gains `panelSize`, `panelApproved`; `StepDetailsResponse` has `canDecide`, `pendingSubmissionId`, `canManagePanel`, `panel: PanelSeatResponse[]`, `timeline`; `SubmissionResponse` has `decision`, `decidedAt`, `reviews: SubmissionReviewResponse[]` and no reviewer/mark/comment; `ReviewQueueItem` gains `panelSize`, `panelApproved`; `ArchivedGroupDetailsResponse` gains `reviews: ArchivedReviewResponse[]`, and `ArchivedFileResponse` loses `reviewerName` and `reviewerComment`.

- [ ] **Step 1: Create the entities**

`Entities/ReviewSeat.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// The panel seat a decision fills (design 2026-09-24 §3.1): the student's supervisor, or one of
/// the extra reviewers added to that step.
public enum ReviewSeat
{
    Supervisor,
    Extra
}
```

`Entities/StudentTaskReviewer.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// An extra reviewer on one student's step (design 2026-09-24 §3.1). The supervisor is never a row
/// here: their seat is the student's current supervisor, worked out when the panel is read.
public class StudentTaskReviewer
{
    public Guid Id { get; set; }
    public Guid StudentTaskId { get; set; }
    public Guid ReviewerId { get; set; }
    public Guid AddedById { get; set; }
    public DateTime AddedAt { get; set; }
    public StudentTask StudentTask { get; set; } = null!;
    public AppUser Reviewer { get; set; } = null!;
    public AppUser AddedBy { get; set; } = null!;
}
```

`Entities/SubmissionReview.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// One reviewer's decision on one submitted version (design 2026-09-24 §3.1). A reviewer decides
/// once per version; an approval keeps counting for later versions of the same step.
public class SubmissionReview
{
    public Guid Id { get; set; }
    public Guid SubmissionId { get; set; }
    public Guid ReviewerId { get; set; }
    public ReviewSeat Seat { get; set; }
    public SubmissionDecision Decision { get; set; }
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public Submission Submission { get; set; } = null!;
    public AppUser Reviewer { get; set; } = null!;
}
```

`Entities/ArchivedReview.cs`:

```csharp
namespace DiplomaTracker.Api.Entities;

/// A reviewer's decision copied into the archive as text (design 2026-09-24 §3.6). Like the rest of
/// the archive it refers to nothing live: every name is copied in at the moment of archiving.
public class ArchivedReview
{
    public Guid Id { get; set; }
    public Guid ArchivedGroupId { get; set; }
    public ArchivedGroup ArchivedGroup { get; set; } = null!;

    /// The live review this row was copied from, kept only so a second archiving event for the same
    /// group does not copy it twice. Deliberately NOT a foreign key: the review is usually gone.
    public Guid SourceReviewId { get; set; }

    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }
    public string ReviewerName { get; set; } = string.Empty;

    /// "Supervisor" or "Extra".
    public string Seat { get; set; } = string.Empty;

    /// "Approved" or "Returned".
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
    public DateTime ArchivedAt { get; set; }
}
```

- [ ] **Step 2: Adjust the existing entities**

`Entities/Submission.cs` — replace the whole file:

```csharp
namespace DiplomaTracker.Api.Entities;

public class Submission
{
    public Guid Id { get; set; }
    public Guid StudentTaskId { get; set; }
    public StudentTask StudentTask { get; set; } = null!;
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }

    /// The outcome of this version (design 2026-09-24 §3.1): empty while the panel is deciding,
    /// Returned when a reviewer returned it, Approved when it completed the panel.
    public SubmissionDecision? Decision { get; set; }
    public DateTime? DecidedAt { get; set; }
    public ICollection<SubmissionReview> Reviews { get; set; } = new List<SubmissionReview>();
    public ICollection<SubmissionFile> Files { get; set; } = new List<SubmissionFile>();
}
```

`Entities/StudentTask.cs` — add after the `Submissions` collection:

```csharp
    public ICollection<StudentTaskReviewer> Reviewers { get; set; } = new List<StudentTaskReviewer>();
```

`Entities/AppUser.cs` — delete the line:

```csharp
    public ICollection<Submission> ReviewedSubmissions { get; set; } = new List<Submission>();
```

`Entities/ArchivedFile.cs` — delete the `ReviewerName` and `ReviewerComment` properties, and replace the comment above `Decision` and the `Mark` line with:

```csharp
    /// The version's outcome: "Approved", "Returned" or null for a version that was never decided.
    public string? Decision { get; set; }

    /// The step mark, on the version whose outcome is Approved. Each reviewer's own mark is in
    /// ArchivedReview.
    public int? Mark { get; set; }
```

(`DecidedAt` stays.)

`Entities/ArchivedGroup.cs` — add after `Files`:

```csharp
    public ICollection<ArchivedReview> Reviews { get; set; } = new List<ArchivedReview>();
```

- [ ] **Step 3: Map the model**

In `Data/AppDbContext.cs`:

Add the sets after `SubmissionFiles` and after `ArchivedFiles` respectively:

```csharp
    public DbSet<StudentTaskReviewer> StudentTaskReviewers => Set<StudentTaskReviewer>();
    public DbSet<SubmissionReview> SubmissionReviews => Set<SubmissionReview>();
```

```csharp
    public DbSet<ArchivedReview> ArchivedReviews => Set<ArchivedReview>();
```

Replace the `Submission` block (from `var submission = modelBuilder.Entity<Submission>();` to the end of its `Reviewer` relationship) with:

```csharp
        var submission = modelBuilder.Entity<Submission>();
        submission.ToTable("Submissions");
        submission.HasKey(x => x.Id);
        submission.Property(x => x.Message).HasMaxLength(2000);
        submission.Property(x => x.Decision).HasConversion<string>().HasMaxLength(50);
        submission.Property(x => x.SubmittedAt).IsRequired();
        submission.HasIndex(x => new { x.StudentTaskId, x.Version }).IsUnique();
        submission.HasIndex(x => new { x.Decision, x.SubmittedAt });
        submission.HasOne(x => x.StudentTask)
            .WithMany(x => x.Submissions)
            .HasForeignKey(x => x.StudentTaskId)
            .OnDelete(DeleteBehavior.Cascade);

        var studentTaskReviewer = modelBuilder.Entity<StudentTaskReviewer>();
        studentTaskReviewer.ToTable("StudentTaskReviewers");
        studentTaskReviewer.HasKey(x => x.Id);
        studentTaskReviewer.Property(x => x.AddedAt).IsRequired();
        studentTaskReviewer.HasIndex(x => new { x.StudentTaskId, x.ReviewerId }).IsUnique();
        studentTaskReviewer.HasIndex(x => x.ReviewerId);
        studentTaskReviewer.HasOne(x => x.StudentTask)
            .WithMany(x => x.Reviewers)
            .HasForeignKey(x => x.StudentTaskId)
            .OnDelete(DeleteBehavior.Cascade);
        studentTaskReviewer.HasOne(x => x.Reviewer)
            .WithMany()
            .HasForeignKey(x => x.ReviewerId)
            .OnDelete(DeleteBehavior.Restrict);
        studentTaskReviewer.HasOne(x => x.AddedBy)
            .WithMany()
            .HasForeignKey(x => x.AddedById)
            .OnDelete(DeleteBehavior.Restrict);

        var submissionReview = modelBuilder.Entity<SubmissionReview>();
        submissionReview.ToTable("SubmissionReviews");
        submissionReview.HasKey(x => x.Id);
        submissionReview.Property(x => x.Seat).HasConversion<string>().HasMaxLength(50).IsRequired();
        submissionReview.Property(x => x.Decision).HasConversion<string>().HasMaxLength(50).IsRequired();
        submissionReview.Property(x => x.Comment).HasMaxLength(2000);
        submissionReview.Property(x => x.DecidedAt).IsRequired();
        // A reviewer decides once per version; this index is what holds under a race.
        submissionReview.HasIndex(x => new { x.SubmissionId, x.ReviewerId }).IsUnique();
        submissionReview.HasIndex(x => x.ReviewerId);
        submissionReview.HasOne(x => x.Submission)
            .WithMany(x => x.Reviews)
            .HasForeignKey(x => x.SubmissionId)
            .OnDelete(DeleteBehavior.Cascade);
        submissionReview.HasOne(x => x.Reviewer)
            .WithMany()
            .HasForeignKey(x => x.ReviewerId)
            .OnDelete(DeleteBehavior.Restrict);
```

In the `archivedFile` block delete the two lines:

```csharp
        archivedFile.Property(x => x.ReviewerName).HasMaxLength(300);
        archivedFile.Property(x => x.ReviewerComment).HasMaxLength(2000);
```

After the `archivedFile` block (before the closing brace of `OnModelCreating`) add:

```csharp
        var archivedReview = modelBuilder.Entity<ArchivedReview>();
        archivedReview.ToTable("ArchivedReviews");
        archivedReview.HasKey(x => x.Id);
        // Last + first + patronymic, each up to 100 characters, plus two separating spaces: 302.
        archivedReview.Property(x => x.StudentName).HasMaxLength(302).IsRequired();
        archivedReview.Property(x => x.StudentNumber).HasMaxLength(32).IsRequired();
        archivedReview.Property(x => x.StepTitle).HasMaxLength(300).IsRequired();
        archivedReview.Property(x => x.ReviewerName).HasMaxLength(302).IsRequired();
        archivedReview.Property(x => x.Seat).HasMaxLength(50).IsRequired();
        archivedReview.Property(x => x.Decision).HasMaxLength(50).IsRequired();
        archivedReview.Property(x => x.Comment).HasMaxLength(2000);
        archivedReview.Property(x => x.ArchivedAt).IsRequired();
        // A second archiving event for the same group skips reviews it already copied; this index is
        // what makes that hold under a race.
        archivedReview.HasIndex(x => new { x.ArchivedGroupId, x.SourceReviewId }).IsUnique();
        archivedReview.HasOne(x => x.ArchivedGroup)
            .WithMany(x => x.Reviews)
            .HasForeignKey(x => x.ArchivedGroupId)
            .OnDelete(DeleteBehavior.Cascade);
```

- [ ] **Step 4: Add the panel evaluator**

`Services/ReviewPanel.cs`:

```csharp
using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-24 §3.2. A step's panel is never stored as one list. It is the student's CURRENT
/// supervisor plus one seat per extra reviewer on that step, and a seat is satisfied by an approval
/// that fills it on ANY version of the step - approvals are sticky. Pure: callers load the facts,
/// this decides, so every reader agrees on what the panel is.
public static class ReviewPanel
{
    public sealed record ExtraSeatFact(Guid ReviewerId, DateTime AddedAt);

    public sealed record ReviewFact(
        Guid ReviewerId,
        bool ReviewerIsAdmin,
        ReviewSeat Seat,
        SubmissionDecision Decision,
        int? Mark,
        DateTime DecidedAt);

    /// ReviewerId is null only for a supervisor seat whose student has no supervisor (a topic
    /// released while a version waits) - an administrator can still fill it.
    public sealed record SeatState(ReviewSeat Seat, Guid? ReviewerId, bool IsSatisfied, int? Mark);

    public sealed record PanelState(IReadOnlyList<SeatState> Seats)
    {
        public int Size => Seats.Count;

        public int Satisfied => Seats.Count(s => s.IsSatisfied);

        public bool IsComplete => Seats.All(s => s.IsSatisfied);

        /// The step mark (§2): the average of the marks behind every satisfied seat, rounded to a
        /// whole number, half away from zero.
        public int? AverageMark()
        {
            var marks = Seats.Where(s => s.IsSatisfied && s.Mark is not null).Select(s => s.Mark!.Value).ToList();
            return marks.Count == 0 ? null : (int)Math.Round(marks.Average(), MidpointRounding.AwayFromZero);
        }
    }

    /// The supervisor seat is always first. An extra row naming the current supervisor (they were
    /// added as an extra and later became the supervisor through a topic change) is absorbed into
    /// the supervisor seat - otherwise it would be a seat nobody could ever fill. An extra seat
    /// counts only approvals given after it was added, so removing and re-adding someone needs a
    /// fresh approval (§3.3: a removal means their approval stops counting).
    public static PanelState Evaluate(Guid? supervisorId, IReadOnlyList<ExtraSeatFact> extras, IReadOnlyList<ReviewFact> reviews)
    {
        var approvals = reviews
            .Where(r => r.Decision == SubmissionDecision.Approved)
            .OrderByDescending(r => r.DecidedAt)
            .ToList();

        var supervisorApproval = approvals.FirstOrDefault(r =>
            r.Seat == ReviewSeat.Supervisor && (r.ReviewerId == supervisorId || r.ReviewerIsAdmin));

        var seats = new List<SeatState>(extras.Count + 1)
        {
            new(ReviewSeat.Supervisor, supervisorId, supervisorApproval is not null, supervisorApproval?.Mark)
        };

        foreach (var extra in extras.Where(e => e.ReviewerId != supervisorId).OrderBy(e => e.AddedAt))
        {
            var approval = approvals.FirstOrDefault(r =>
                r.Seat == ReviewSeat.Extra && r.ReviewerId == extra.ReviewerId && r.DecidedAt >= extra.AddedAt);
            seats.Add(new SeatState(ReviewSeat.Extra, extra.ReviewerId, approval is not null, approval?.Mark));
        }

        return new PanelState(seats);
    }

    /// The seat the caller's decision fills (§3.3), or null when they have none. Their own seat
    /// wins; an administrator with no seat of their own stands in for the supervisor.
    public static ReviewSeat? SeatFor(UserContext user, Guid? supervisorId, IReadOnlyList<ExtraSeatFact> extras)
    {
        if (supervisorId == user.UserId)
        {
            return ReviewSeat.Supervisor;
        }

        if (extras.Any(e => e.ReviewerId == user.UserId))
        {
            return ReviewSeat.Extra;
        }

        return user.IsAdmin ? ReviewSeat.Supervisor : null;
    }

    public static bool IsSeatSatisfied(PanelState panel, ReviewSeat seat, Guid userId) =>
        seat == ReviewSeat.Supervisor
            ? panel.Seats[0].IsSatisfied
            : panel.Seats.Any(s => s.Seat == ReviewSeat.Extra && s.ReviewerId == userId && s.IsSatisfied);
}
```

- [ ] **Step 5: Error codes and the log event**

In `Services/WorkflowErrors.cs` replace the `NotReviewer` constant with:

```csharp
    public const string NotOnPanel = "review.notOnPanel";
    public const string SeatSatisfied = "review.seatSatisfied";
    public const string PanelReviewerInvalid = "panel.reviewerInvalid";
    public const string PanelReviewerIsSupervisor = "panel.reviewerIsSupervisor";
    public const string PanelReviewerExists = "panel.reviewerExists";
    public const string PanelReviewerNotFound = "panel.reviewerNotFound";
    public const string PanelNotAllowed = "panel.notAllowed";
    public const string PanelChanged = "panel.changed";
```

and in `All` replace the `NotReviewer` definition with:

```csharp
        new(NotOnPanel, StatusCodes.Status403Forbidden, "You are not on this step's review panel."),
        new(SeatSatisfied, StatusCodes.Status409Conflict, "Your approval of this step is already recorded."),
        new(PanelReviewerInvalid, StatusCodes.Status400BadRequest, "Choose an active teacher or administrator."),
        new(PanelReviewerIsSupervisor, StatusCodes.Status409Conflict, "The student's supervisor already reviews this step."),
        new(PanelReviewerExists, StatusCodes.Status409Conflict, "This person already reviews this step."),
        new(PanelReviewerNotFound, StatusCodes.Status404NotFound, "This person is not an extra reviewer of this step."),
        new(PanelNotAllowed, StatusCodes.Status403Forbidden, "You cannot change the reviewers of this step."),
        new(PanelChanged, StatusCodes.Status409Conflict, "The step changed while you were editing its reviewers. Reload and try again."),
```

In `Services/SecurityLog.cs` add after `SubmissionDecided`:

```csharp
    /// Action is Added or Removed.
    public static void ReviewPanelChanged(ILogger logger, Guid actorUserId, string action, Guid studentTaskId, Guid reviewerId) =>
        logger.LogInformation(
            "Review panel changed: ActorUserId={ActorUserId}, Action={Action}, StudentTaskId={StudentTaskId}, ReviewerId={ReviewerId}",
            actorUserId, action, studentTaskId, reviewerId);
```

- [ ] **Step 6: The step-level visibility rule**

`Interfaces/IAccessScope.cs` — add to the interface:

```csharp
    /// Design 2026-09-24 §3.4: who may open one student step. Today's rule (the student's
    /// supervisor, a reviewer of their group, an administrator), or an extra seat on that very step.
    /// An extra seat grants nothing else - not the group, not the student's other steps.
    Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId);
```

`Services/AccessScope.cs` — add:

```csharp
    public Task<bool> CanSeeStudentTaskAsync(UserContext user, Guid studentTaskId)
    {
        var task = _dbContext.StudentTasks.Where(t => t.Id == studentTaskId);

        if (user.IsAdmin)
        {
            return task.AnyAsync();
        }

        if (!user.IsTeacher)
        {
            return Task.FromResult(false);
        }

        var reviewable = ReviewableStudents(user).Select(s => s.Id);
        return task.AnyAsync(t =>
            reviewable.Contains(t.StudentProfileId)
            || (t.StudentProfile.ArchivedAt == null && t.Reviewers.Any(r => r.ReviewerId == user.UserId)));
    }
```

- [ ] **Step 7: Contracts**

`DTOs/Workflow/PanelSeatResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class PanelSeatResponse
{
    /// "Supervisor" or "Extra".
    public string Seat { get; set; } = string.Empty;
    public Guid? ReviewerId { get; set; }
    public string? ReviewerName { get; set; }
    public bool IsActive { get; set; }

    /// "Approved" (the seat is satisfied), "Returned" (it returned the version now with the
    /// student) or "Waiting".
    public string State { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public bool CanRemove { get; set; }
}

public class SubmissionReviewResponse
{
    public Guid Id { get; set; }
    public string ReviewerName { get; set; } = string.Empty;
    public string Seat { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
}
```

`DTOs/Workflow/StudentStepResponse.cs` — add at the end of the class:

```csharp
    /// Seats on the step's review panel: the supervisor plus every extra reviewer (design 2026-09-24 §3.2).
    public int PanelSize { get; set; }

    /// Seats whose approval is recorded on some version of the step.
    public int PanelApproved { get; set; }
```

`DTOs/Workflow/StepDetailsResponse.cs` — replace the whole file:

```csharp
namespace DiplomaTracker.Api.DTOs.Workflow;

public class StepDetailsResponse : StudentStepResponse
{
    public Guid StudentProfileId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;

    /// The caller holds an open seat on this step's panel and the latest version awaits
    /// decisions (design 2026-09-24 §3.3).
    public bool CanDecide { get; set; }
    public Guid? PendingSubmissionId { get; set; }

    /// The caller may add or remove extra reviewers: the supervisor, a group reviewer or an
    /// administrator, while the step is not approved and the student is not archived.
    public bool CanManagePanel { get; set; }
    public IReadOnlyList<PanelSeatResponse> Panel { get; set; } = [];
    public IReadOnlyList<SubmissionResponse> Timeline { get; set; } = [];
}
```

`DTOs/Workflow/SubmissionResponse.cs` — replace the `SubmissionResponse` class (keep `SubmissionFileResponse`):

```csharp
public class SubmissionResponse
{
    public Guid Id { get; set; }
    public int Version { get; set; }
    public string? Message { get; set; }
    public DateTime SubmittedAt { get; set; }
    public bool IsLate { get; set; }

    /// The version's outcome: null while the panel decides, "Returned" or "Approved".
    public string? Decision { get; set; }
    public DateTime? DecidedAt { get; set; }
    public IReadOnlyList<SubmissionReviewResponse> Reviews { get; set; } = [];
    public IReadOnlyList<SubmissionFileResponse> Files { get; set; } = [];
}
```

`DTOs/Workflow/ReviewQueueItem.cs` — add at the end of the class:

```csharp
    public int PanelSize { get; set; }
    public int PanelApproved { get; set; }
```

`DTOs/Archive/ArchiveResponses.cs` — in `ArchivedFileResponse` delete `ReviewerName` and `ReviewerComment`; add the class:

```csharp
public class ArchivedReviewResponse
{
    public Guid Id { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string StudentNumber { get; set; } = string.Empty;
    public string StepTitle { get; set; } = string.Empty;
    public int StepOrder { get; set; }
    public int Version { get; set; }
    public string ReviewerName { get; set; } = string.Empty;
    public string Seat { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public int? Mark { get; set; }
    public string? Comment { get; set; }
    public DateTime DecidedAt { get; set; }
}
```

and in `ArchivedGroupDetailsResponse` add:

```csharp
    public IReadOnlyList<ArchivedReviewResponse> Reviews { get; set; } = [];
```

- [ ] **Step 8: Panel facts in the workflow service**

In `Services/StudentWorkflowService.cs` add these members next to the other private helpers:

```csharp
    /// What the panel of one step is made of, as loaded; ReviewPanel decides what it means.
    private sealed record PanelFacts(
        Guid? SupervisorId,
        IReadOnlyList<ReviewPanel.ExtraSeatFact> Extras,
        IReadOnlyList<ReviewPanel.ReviewFact> Reviews)
    {
        public ReviewPanel.PanelState Evaluate() => ReviewPanel.Evaluate(SupervisorId, Extras, Reviews);
    }

    /// Loads the panel facts of many steps in three queries, whatever their number - the queue and
    /// "My work" show a panel count on every row.
    private async Task<Dictionary<Guid, PanelFacts>> LoadPanelFactsAsync(IReadOnlyCollection<Guid> studentTaskIds)
    {
        var ids = studentTaskIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<Guid, PanelFacts>();
        }

        var supervisors = await _dbContext.StudentTasks.AsNoTracking()
            .Where(t => ids.Contains(t.Id))
            .Select(t => new { t.Id, t.StudentProfile.SupervisorId })
            .ToListAsync();

        var extras = await _dbContext.StudentTaskReviewers.AsNoTracking()
            .Where(r => ids.Contains(r.StudentTaskId))
            .Select(r => new { r.StudentTaskId, r.ReviewerId, r.AddedAt })
            .ToListAsync();

        var reviews = await _dbContext.SubmissionReviews.AsNoTracking()
            .Where(r => ids.Contains(r.Submission.StudentTaskId))
            .Select(r => new
            {
                r.Submission.StudentTaskId,
                r.ReviewerId,
                ReviewerIsAdmin = r.Reviewer.Role == "Admin",
                r.Seat,
                r.Decision,
                r.Mark,
                r.DecidedAt
            })
            .ToListAsync();

        var extrasByTask = extras.ToLookup(e => e.StudentTaskId);
        var reviewsByTask = reviews.ToLookup(r => r.StudentTaskId);

        return supervisors.ToDictionary(
            t => t.Id,
            t => new PanelFacts(
                t.SupervisorId,
                extrasByTask[t.Id].Select(e => new ReviewPanel.ExtraSeatFact(e.ReviewerId, e.AddedAt)).ToList(),
                reviewsByTask[t.Id]
                    .Select(r => new ReviewPanel.ReviewFact(r.ReviewerId, r.ReviewerIsAdmin, r.Seat, r.Decision, r.Mark, r.DecidedAt))
                    .ToList()));
    }

    private async Task FillPanelCountsAsync(IReadOnlyList<StudentStepResponse> steps)
    {
        var facts = await LoadPanelFactsAsync(steps.Select(s => s.Id).ToList());
        foreach (var step in steps)
        {
            if (facts.TryGetValue(step.Id, out var fact))
            {
                var panel = fact.Evaluate();
                step.PanelSize = panel.Size;
                step.PanelApproved = panel.Satisfied;
            }
        }
    }

    /// The approval (or removal) that leaves every seat satisfied closes the step (§3.3).
    private static void CompleteStep(Submission submission, StudentTask task, ReviewPanel.PanelState panel, DateTime now)
    {
        submission.Decision = SubmissionDecision.Approved;
        submission.DecidedAt = now;
        task.Status = StudentTaskStatus.Approved;
        task.Mark = panel.AverageMark();
        task.CompletedAt = now;
        task.UpdatedAt = now;
    }
```

- [ ] **Step 9: Decisions**

Replace `ApproveAsync`, `ReturnAsync` and `DecideAsync` with:

```csharp
    public async Task<(StepDetailsResponse? step, string? error)> ApproveAsync(UserContext user, Guid submissionId, ApproveSubmissionRequest request)
    {
        if (request.Mark is null)
        {
            return (null, WorkflowErrors.MarkRequired);
        }

        // Mark is bound as decimal, not int, so a fractional value (e.g. 88.5) reaches here
        // instead of failing model binding with validation.failed - spec §7 wants
        // review.markOutOfRange for "a whole number from 0 to 100", fractional included.
        if (request.Mark is < 0 or > 100 || request.Mark % 1 != 0)
        {
            return (null, WorkflowErrors.MarkOutOfRange);
        }

        return await DecideAsync(user, submissionId, SubmissionDecision.Approved, (int)request.Mark.Value, IdentityNormalizer.Optional(request.Comment));
    }

    public async Task<(StepDetailsResponse? step, string? error)> ReturnAsync(UserContext user, Guid submissionId, ReturnSubmissionRequest request)
    {
        var comment = IdentityNormalizer.Optional(request.Comment);
        if (comment is null)
        {
            return (null, WorkflowErrors.CommentRequired);
        }

        return await DecideAsync(user, submissionId, SubmissionDecision.Returned, null, comment);
    }
```

```csharp
    /// Design 2026-09-24 §3.3. The caller's decision fills their seat on the panel. A return sends
    /// the step back at once; an approval closes the step only when it leaves every seat satisfied.
    private async Task<(StepDetailsResponse? step, string? error)> DecideAsync(
        UserContext user,
        Guid submissionId,
        SubmissionDecision decision,
        int? mark,
        string? comment)
    {
        var submission = await _dbContext.Submissions
            .Include(s => s.StudentTask)
            .FirstOrDefaultAsync(s => s.Id == submissionId);

        if (submission is null)
        {
            return (null, WorkflowErrors.SubmissionNotFound);
        }

        var task = submission.StudentTask;
        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var seat = ReviewPanel.SeatFor(user, facts.SupervisorId, facts.Extras);

        // A seat is only held while the step is still visible to its holder: an archived student's
        // panel is closed to teachers, as the rest of their work is.
        if (seat is null || !await _accessScope.CanSeeStudentTaskAsync(user, task.Id))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "Submission", submission.Id);
            return (null, WorkflowErrors.NotOnPanel);
        }

        var latestVersion = await _dbContext.Submissions
            .Where(s => s.StudentTaskId == task.Id)
            .MaxAsync(s => s.Version);

        if (submission.Decision is not null
            || submission.Version != latestVersion
            || task.Status != StudentTaskStatus.Submitted)
        {
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        if (ReviewPanel.IsSeatSatisfied(facts.Evaluate(), seat.Value, user.UserId))
        {
            return (null, WorkflowErrors.SeatSatisfied);
        }

        var now = DateTime.UtcNow;
        _dbContext.SubmissionReviews.Add(new SubmissionReview
        {
            Id = Guid.NewGuid(),
            SubmissionId = submission.Id,
            ReviewerId = user.UserId,
            Seat = seat.Value,
            Decision = decision,
            Mark = mark,
            Comment = comment,
            DecidedAt = now
        });

        // Every decision touches the step, so its RowVersion serialises decisions: two reviewers
        // deciding at the same moment cannot both complete the panel or both return (§3.3).
        task.UpdatedAt = now;

        if (decision == SubmissionDecision.Returned)
        {
            submission.Decision = SubmissionDecision.Returned;
            submission.DecidedAt = now;
            task.Status = StudentTaskStatus.Returned;
        }
        else
        {
            var after = ReviewPanel.Evaluate(
                facts.SupervisorId,
                facts.Extras,
                [.. facts.Reviews, new ReviewPanel.ReviewFact(user.UserId, user.IsAdmin, seat.Value, decision, mark, now)]);

            if (after.IsComplete)
            {
                CompleteStep(submission, task, after, now);
            }
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.SubmissionAlreadyDecided);
        }

        SecurityLog.SubmissionDecided(_logger, user.UserId, submission.Id, decision.ToString(), mark);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }
```

- [ ] **Step 10: Step access, file access, "My work"**

In `ResolveStepAccessAsync` replace the final `return` with:

```csharp
        return await _accessScope.CanSeeStudentTaskAsync(user, task.Id)
            ? (task, null)
            : (null, TaskErrors.StudentTaskNotFound);
```

In `OpenFileAsync` add `StudentTaskId = f.Submission.StudentTaskId,` to the projection, and replace the `allowed` line with:

```csharp
        var allowed = file.StudentUserId == user.UserId || await _accessScope.CanSeeStudentTaskAsync(user, file.StudentTaskId);
```

In `GetMyStepsAsync` replace the final `return` with:

```csharp
        var steps = BuildSteps(tasks, profile.TopicId is not null).Select(step => step.Response).ToList();
        await FillPanelCountsAsync(steps);
        return (steps, null);
```

- [ ] **Step 11: The step page**

Replace `BuildDetailsAsync` with:

```csharp
    private async Task<StepDetailsResponse> BuildDetailsAsync(UserContext user, StudentTask task)
    {
        var steps = BuildSteps(await LoadStudentTasksAsync(task.StudentProfileId, task.StudentProfile.GroupId), task.StudentProfile.TopicId is not null);
        var step = steps.First(s => s.Task.Id == task.Id).Response;

        var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
        var panel = facts.Evaluate();

        var timeline = await _dbContext.Submissions.AsNoTracking()
            .Where(s => s.StudentTaskId == task.Id)
            .OrderBy(s => s.Version)
            .Select(s => new
            {
                s.Id,
                s.Version,
                s.Message,
                s.SubmittedAt,
                s.IsLate,
                s.Decision,
                s.DecidedAt,
                Reviews = s.Reviews.OrderBy(r => r.DecidedAt)
                    .Select(r => new
                    {
                        r.Id,
                        r.ReviewerId,
                        r.Reviewer.LastName,
                        r.Reviewer.FirstName,
                        r.Reviewer.Patronymic,
                        r.Seat,
                        r.Decision,
                        r.Mark,
                        r.Comment,
                        r.DecidedAt
                    })
                    .ToList(),
                Files = s.Files.OrderBy(f => f.Kind).ThenBy(f => f.OriginalName)
                    .Select(f => new { f.Id, f.Kind, f.OriginalName, f.SizeBytes })
                    .ToList()
            })
            .ToListAsync();

        var latest = timeline.LastOrDefault();
        Guid? pendingId = latest is not null && latest.Decision is null ? latest.Id : null;

        var seat = user.IsStudent ? null : ReviewPanel.SeatFor(user, facts.SupervisorId, facts.Extras);
        var canDecide = seat is not null
            && task.Status == StudentTaskStatus.Submitted
            && pendingId is not null
            && !ReviewPanel.IsSeatSatisfied(panel, seat.Value, user.UserId);

        var canManagePanel = !user.IsStudent
            && task.Status != StudentTaskStatus.Approved
            && task.StudentProfile.ArchivedAt is null
            && await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId);

        // The seats that returned the version now with the student - shown as Returned until they approve.
        List<(ReviewSeat Seat, Guid ReviewerId)> returnedOnLatest = task.Status == StudentTaskStatus.Returned && latest is not null
            ? latest.Reviews.Where(r => r.Decision == SubmissionDecision.Returned).Select(r => (r.Seat, r.ReviewerId)).ToList()
            : [];

        var seatUserIds = panel.Seats.Where(s => s.ReviewerId is not null).Select(s => s.ReviewerId!.Value).ToList();
        var seatUsers = await _dbContext.Users.AsNoTracking()
            .Where(u => seatUserIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id);

        string? NameOf(Guid? id) => id is { } value && seatUsers.TryGetValue(value, out var person) ? PersonName.Full(person) : null;

        bool IsActive(Guid? id) => id is { } value && seatUsers.TryGetValue(value, out var person) && person.IsActive;

        string StateOf(ReviewPanel.SeatState s) =>
            s.IsSatisfied ? "Approved"
            : returnedOnLatest.Any(r => r.Seat == s.Seat && (s.Seat == ReviewSeat.Supervisor || r.ReviewerId == s.ReviewerId)) ? "Returned"
            : "Waiting";

        return new StepDetailsResponse
        {
            Id = step.Id,
            GroupTaskId = step.GroupTaskId,
            Title = step.Title,
            Description = step.Description,
            Order = step.Order,
            Deadline = step.Deadline,
            Status = step.Status,
            Mark = step.Mark,
            CompletedAt = step.CompletedAt,
            IsLate = step.IsLate,
            LatestSubmittedAt = step.LatestSubmittedAt,
            CanSubmit = user.IsStudent && step.CanSubmit,
            BlockReason = step.BlockReason,
            PanelSize = panel.Size,
            PanelApproved = panel.Satisfied,
            StudentProfileId = task.StudentProfileId,
            StudentName = PersonName.Full(task.StudentProfile.User),
            GroupCode = task.StudentProfile.Group.Code,
            CanDecide = canDecide,
            PendingSubmissionId = canDecide ? pendingId : null,
            CanManagePanel = canManagePanel,
            Panel = panel.Seats.Select(s => new PanelSeatResponse
            {
                Seat = s.Seat.ToString(),
                ReviewerId = s.ReviewerId,
                ReviewerName = NameOf(s.ReviewerId),
                IsActive = IsActive(s.ReviewerId),
                State = StateOf(s),
                Mark = s.Mark,
                CanRemove = canManagePanel && s.Seat == ReviewSeat.Extra
            }).ToList(),
            Timeline = timeline.Select(s => new SubmissionResponse
            {
                Id = s.Id,
                Version = s.Version,
                Message = s.Message,
                SubmittedAt = s.SubmittedAt,
                IsLate = s.IsLate,
                Decision = s.Decision?.ToString(),
                DecidedAt = s.DecidedAt,
                Reviews = s.Reviews.Select(r => new SubmissionReviewResponse
                {
                    Id = r.Id,
                    ReviewerName = JoinName(r.LastName, r.FirstName, r.Patronymic),
                    Seat = r.Seat.ToString(),
                    Decision = r.Decision.ToString(),
                    Mark = r.Mark,
                    Comment = r.Comment,
                    DecidedAt = r.DecidedAt
                }).ToList(),
                Files = s.Files.Select(f => new SubmissionFileResponse
                {
                    Id = f.Id,
                    Kind = f.Kind.ToString(),
                    OriginalName = f.OriginalName,
                    SizeBytes = f.SizeBytes
                }).ToList()
            }).ToList()
        };
    }
```

- [ ] **Step 12: The review queue**

In `GetReviewQueueAsync` replace everything from `var reviewable = …` up to and including the `var query = …;` statement with:

```csharp
        // Design 2026-09-24 §3.5. A teacher's queue is the steps where they hold an OPEN seat; a
        // group reviewer who sits on no panel watches the group and has nothing to decide. An
        // administrator sees every submission still awaiting its panel.
        var query = _dbContext.Submissions.AsNoTracking()
            .Where(s => s.Decision == null && s.StudentTask.Status == StudentTaskStatus.Submitted);

        if (user.IsTeacher)
        {
            var me = user.UserId;
            query = query.Where(s => s.StudentTask.StudentProfile.ArchivedAt == null && (
                (s.StudentTask.StudentProfile.SupervisorId == me
                    && !s.StudentTask.Submissions.SelectMany(x => x.Reviews).Any(r =>
                        r.Seat == ReviewSeat.Supervisor
                        && r.Decision == SubmissionDecision.Approved
                        && (r.ReviewerId == me || r.Reviewer.Role == "Admin")))
                // An extra who has become the supervisor sits in the supervisor seat instead.
                || (s.StudentTask.StudentProfile.SupervisorId != me
                    && s.StudentTask.Reviewers.Any(x => x.ReviewerId == me
                        && !s.StudentTask.Submissions.SelectMany(y => y.Reviews).Any(r =>
                            r.Seat == ReviewSeat.Extra
                            && r.Decision == SubmissionDecision.Approved
                            && r.ReviewerId == me
                            && r.DecidedAt >= x.AddedAt)))));
        }
        else if (!user.IsAdmin)
        {
            query = query.Where(_ => false);
        }
```

Then, after `.ToListAsync();` for `rows` and before the `return`, add:

```csharp
        var facts = await LoadPanelFactsAsync(rows.Select(r => r.StudentTaskId).ToList());
        foreach (var row in rows)
        {
            if (facts.TryGetValue(row.StudentTaskId, out var fact))
            {
                var panel = fact.Evaluate();
                row.PanelSize = panel.Size;
                row.PanelApproved = panel.Satisfied;
            }
        }
```

`groupId` and `late` filters and the paging code are unchanged.

- [ ] **Step 13: The student dashboard's latest decision**

In `Services/DashboardService.cs`, in `GetStudentAsync`, replace the `latest` query with:

```csharp
        // Design 2026-09-24 §3.6: the latest decision is the latest reviewer's decision - on a panel,
        // one approval of several is news to the student too.
        var latest = await _dbContext.SubmissionReviews.AsNoTracking()
            .Where(r => r.Submission.StudentTask.StudentProfile.UserId == user.UserId)
            .OrderByDescending(r => r.DecidedAt)
            .ThenByDescending(r => r.Id)
            .Select(r => new LatestDecisionResponse
            {
                StudentTaskId = r.Submission.StudentTaskId,
                SubmissionId = r.SubmissionId,
                StepTitle = r.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = r.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                Version = r.Submission.Version,
                Decision = r.Decision.ToString(),
                Mark = r.Mark,
                ReviewerName = r.Reviewer.LastName + " " + r.Reviewer.FirstName,
                ReviewerComment = r.Comment,
                DecidedAt = r.DecidedAt
            })
            .FirstOrDefaultAsync();
```

Nothing else in the dashboards changes: the administrator's backlog still counts undecided submissions, and the teacher's *waiting* figure is the teacher's queue total (now their open seats).

- [ ] **Step 14: The archive**

In `Services/ArchiveService.cs`, in `ArchiveAsync`:

1. In the `rows` projection replace the four reviewer/mark lines (`f.Submission.Mark,`, `ReviewerLastName = …`, `ReviewerFirstName = …`, `f.Submission.ReviewerComment,`) with:

```csharp
                // The step mark, on the version that completed the panel (design 2026-09-24 §3.6).
                Mark = f.Submission.Decision == SubmissionDecision.Approved ? f.Submission.StudentTask.Mark : null,
```

2. Directly after the `rows` query add the reviews query:

```csharp
        var reviewsQuery = markGroupDeleted
            ? _dbContext.SubmissionReviews.AsNoTracking()
                .Where(r => r.Submission.StudentTask.GroupTask.GroupId == groupId
                    || r.Submission.StudentTask.StudentProfile.GroupId == groupId)
            : _dbContext.SubmissionReviews.AsNoTracking()
                .Where(r => r.Submission.StudentTask.StudentProfile.GroupId == groupId
                    && r.Submission.StudentTask.GroupTask.GroupId == groupId);

        if (studentProfileIds is not null)
        {
            reviewsQuery = reviewsQuery.Where(r => studentProfileIds.Contains(r.Submission.StudentTask.StudentProfileId));
        }

        var reviewRows = await reviewsQuery
            .Select(r => new
            {
                r.Id,
                StudentLastName = r.Submission.StudentTask.StudentProfile.User.LastName,
                StudentFirstName = r.Submission.StudentTask.StudentProfile.User.FirstName,
                StudentPatronymic = r.Submission.StudentTask.StudentProfile.User.Patronymic,
                r.Submission.StudentTask.StudentProfile.StudentNumber,
                StepTitle = r.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Title,
                StepOrder = r.Submission.StudentTask.GroupTask.DiplomaTaskTemplate.Order,
                r.Submission.Version,
                ReviewerLastName = r.Reviewer.LastName,
                ReviewerFirstName = r.Reviewer.FirstName,
                ReviewerPatronymic = r.Reviewer.Patronymic,
                r.Seat,
                r.Decision,
                r.Mark,
                r.Comment,
                r.DecidedAt
            })
            .ToListAsync(cancellationToken);
```

3. In the `new ArchivedFile { … }` initializer delete the `ReviewerName = …` and `ReviewerComment = …` assignments; `Decision`, `Mark` (now `row.Mark`) and `DecidedAt` stay.

4. After the files `foreach` loop and before `await _dbContext.SaveChangesAsync(cancellationToken);` add:

```csharp
        var copiedReviewIds = (await _dbContext.ArchivedReviews.AsNoTracking()
                .Where(r => r.ArchivedGroupId == archive.Id)
                .Select(r => r.SourceReviewId)
                .ToListAsync(cancellationToken))
            .ToHashSet();

        foreach (var review in reviewRows)
        {
            if (!copiedReviewIds.Add(review.Id))
            {
                continue;
            }

            // Added through the set: a child with a preset Guid reached only through a tracked
            // archive's collection would be taken for an existing row and updated.
            _dbContext.ArchivedReviews.Add(new ArchivedReview
            {
                Id = Guid.NewGuid(),
                ArchivedGroupId = archive.Id,
                SourceReviewId = review.Id,
                StudentName = JoinName(review.StudentLastName, review.StudentFirstName, review.StudentPatronymic),
                StudentNumber = review.StudentNumber,
                StepTitle = review.StepTitle,
                StepOrder = review.StepOrder,
                Version = review.Version,
                ReviewerName = JoinName(review.ReviewerLastName, review.ReviewerFirstName, review.ReviewerPatronymic),
                Seat = review.Seat.ToString(),
                Decision = review.Decision.ToString(),
                Mark = review.Mark,
                Comment = review.Comment,
                DecidedAt = review.DecidedAt,
                ArchivedAt = now
            });
        }
```

5. Add the helper at the bottom of the class:

```csharp
    private static string JoinName(params string?[] parts) =>
        string.Join(' ', parts.Where(part => !string.IsNullOrWhiteSpace(part)));
```

6. In `GetGroupAsync` delete the `ReviewerName = f.ReviewerName,` and `ReviewerComment = f.ReviewerComment,` assignments, and add after `Files = …ToList()`:

```csharp
                Reviews = a.Reviews
                    .OrderBy(r => r.StudentName)
                    .ThenBy(r => r.StepOrder)
                    .ThenBy(r => r.Version)
                    .ThenBy(r => r.DecidedAt)
                    .Select(r => new ArchivedReviewResponse
                    {
                        Id = r.Id,
                        StudentName = r.StudentName,
                        StudentNumber = r.StudentNumber,
                        StepTitle = r.StepTitle,
                        StepOrder = r.StepOrder,
                        Version = r.Version,
                        ReviewerName = r.ReviewerName,
                        Seat = r.Seat,
                        Decision = r.Decision,
                        Mark = r.Mark,
                        Comment = r.Comment,
                        DecidedAt = r.DecidedAt
                    })
                    .ToList()
```

`PurgeGroupAsync` needs no change: `ArchivedReviews` cascade from their `ArchivedGroup` in the database.

- [ ] **Step 15: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`. A remaining reference to `Submission.ReviewerId`, `.Reviewer`, `.ReviewerComment`, `.Mark`, `AppUser.ReviewedSubmissions`, `WorkflowErrors.NotReviewer`, `ArchivedFile.ReviewerName` or `StepDetailsResponse.CanReview` is a missed step above. Find each one with `grep -rn` and apply the matching step.

```bash
dotnet build backend/DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: the test project compiles.

---

### Task 2: Panel management and the staff directory

**Files:**
- Create: `backend/DiplomaTracker.Api/DTOs/Workflow/AddPanelReviewerRequest.cs`
- Create: `backend/DiplomaTracker.Api/DTOs/Teachers/StaffOptionResponse.cs`
- Create: `backend/DiplomaTracker.Api/Controllers/StaffController.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/IStudentWorkflowService.cs`, `Services/StudentWorkflowService.cs`
- Modify: `backend/DiplomaTracker.Api/Controllers/StudentTasksController.cs`
- Modify: `backend/DiplomaTracker.Api/Interfaces/ITeacherService.cs`, `Services/TeacherService.cs`

**Interfaces:**
- Consumes: from Task 1 — `LoadPanelFactsAsync`, `CompleteStep`, `ReviewPanel`, `IAccessScope.CanSeeStudentTaskAsync`, `WorkflowErrors.Panel*`, `SecurityLog.ReviewPanelChanged`.
- Produces: `GET /api/student-tasks/{id}/reviewers` → `PanelSeatResponse[]`; `POST /api/student-tasks/{id}/reviewers` body `{ reviewerId }` → `StepDetailsResponse`; `DELETE /api/student-tasks/{id}/reviewers/{reviewerId}` → `StepDetailsResponse`; `GET /api/staff/options?search=` → `StaffOptionResponse[]` (`{ id, name, role, email }`, at most 20).

- [ ] **Step 1: Contracts**

`DTOs/Workflow/AddPanelReviewerRequest.cs`:

```csharp
using System.ComponentModel.DataAnnotations;

namespace DiplomaTracker.Api.DTOs.Workflow;

public class AddPanelReviewerRequest
{
    [Required]
    public Guid? ReviewerId { get; set; }
}
```

`DTOs/Teachers/StaffOptionResponse.cs`:

```csharp
namespace DiplomaTracker.Api.DTOs.Teachers;

/// A teacher or administrator offered as an extra reviewer (design 2026-09-24 §3.5).
public sealed record StaffOptionResponse(Guid Id, string Name, string Role, string Email);
```

- [ ] **Step 2: The service methods**

`Interfaces/IStudentWorkflowService.cs` — add:

```csharp
    Task<(IReadOnlyList<PanelSeatResponse>? panel, string? error)> GetPanelAsync(UserContext user, Guid studentTaskId);
    Task<(StepDetailsResponse? step, string? error)> AddReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId);
    Task<(StepDetailsResponse? step, string? error)> RemoveReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId);
```

`Services/StudentWorkflowService.cs` — add:

```csharp
    public async Task<(IReadOnlyList<PanelSeatResponse>? panel, string? error)> GetPanelAsync(UserContext user, Guid studentTaskId)
    {
        var (step, error) = await GetStepAsync(user, studentTaskId);
        return step is null ? (null, error) : (step.Panel, null);
    }

    public async Task<(StepDetailsResponse? step, string? error)> AddReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId)
    {
        var (task, error) = await LoadTaskForPanelChangeAsync(user, studentTaskId);
        if (task is null)
        {
            return (null, error);
        }

        var reviewer = await _dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == reviewerId);
        if (reviewer is null || !reviewer.IsActive || (reviewer.Role != "Teacher" && reviewer.Role != "Admin"))
        {
            return (null, WorkflowErrors.PanelReviewerInvalid);
        }

        if (reviewer.Id == task.StudentProfile.SupervisorId)
        {
            return (null, WorkflowErrors.PanelReviewerIsSupervisor);
        }

        if (await _dbContext.StudentTaskReviewers.AnyAsync(r => r.StudentTaskId == task.Id && r.ReviewerId == reviewerId))
        {
            return (null, WorkflowErrors.PanelReviewerExists);
        }

        var now = DateTime.UtcNow;
        _dbContext.StudentTaskReviewers.Add(new StudentTaskReviewer
        {
            Id = Guid.NewGuid(),
            StudentTaskId = task.Id,
            ReviewerId = reviewerId,
            AddedById = user.UserId,
            AddedAt = now
        });

        // The step's RowVersion orders panel changes against decisions (§3.3).
        task.UpdatedAt = now;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelChanged);
        }
        catch (DbUpdateException exception) when (exception.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelReviewerExists);
        }

        SecurityLog.ReviewPanelChanged(_logger, user.UserId, "Added", task.Id, reviewerId);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    public async Task<(StepDetailsResponse? step, string? error)> RemoveReviewerAsync(UserContext user, Guid studentTaskId, Guid reviewerId)
    {
        var (task, error) = await LoadTaskForPanelChangeAsync(user, studentTaskId);
        if (task is null)
        {
            return (null, error);
        }

        var row = await _dbContext.StudentTaskReviewers
            .FirstOrDefaultAsync(r => r.StudentTaskId == task.Id && r.ReviewerId == reviewerId);
        if (row is null)
        {
            return (null, WorkflowErrors.PanelReviewerNotFound);
        }

        var now = DateTime.UtcNow;
        _dbContext.StudentTaskReviewers.Remove(row);
        task.UpdatedAt = now;

        // §3.3: a removal that leaves every remaining seat satisfied approves the step at once -
        // otherwise a version already approved by everyone else would wait for nobody.
        if (task.Status == StudentTaskStatus.Submitted)
        {
            var facts = (await LoadPanelFactsAsync([task.Id]))[task.Id];
            var after = ReviewPanel.Evaluate(
                facts.SupervisorId,
                facts.Extras.Where(e => e.ReviewerId != reviewerId).ToList(),
                facts.Reviews);

            if (after.IsComplete)
            {
                var latest = await _dbContext.Submissions
                    .Where(s => s.StudentTaskId == task.Id)
                    .OrderByDescending(s => s.Version)
                    .FirstAsync();

                if (latest.Decision is null)
                {
                    CompleteStep(latest, task, after, now);
                }
            }
        }

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            _dbContext.ChangeTracker.Clear();
            return (null, WorkflowErrors.PanelChanged);
        }

        SecurityLog.ReviewPanelChanged(_logger, user.UserId, "Removed", task.Id, reviewerId);

        _dbContext.ChangeTracker.Clear();
        return await GetStepAsync(user, task.Id);
    }

    /// Design 2026-09-24 §3.1: the supervisor, a reviewer of the student's group or an administrator
    /// may change a panel, while the step is not approved and the student is not archived.
    private async Task<(StudentTask? task, string? error)> LoadTaskForPanelChangeAsync(UserContext user, Guid studentTaskId)
    {
        var task = await _dbContext.StudentTasks
            .Include(t => t.StudentProfile)
            .Include(t => t.GroupTask)
            .FirstOrDefaultAsync(t => t.Id == studentTaskId);

        if (task is null
            || task.GroupTask.GroupId != task.StudentProfile.GroupId
            || task.StudentProfile.ArchivedAt is not null)
        {
            return (null, TaskErrors.StudentTaskNotFound);
        }

        if (!await _accessScope.CanReviewStudentAsync(user, task.StudentProfileId))
        {
            SecurityLog.AccessRefused(_logger, user.UserId, user.Role, "StudentTaskReviewers", task.Id);

            // An extra reviewer sees this step but does not manage its panel; anyone else must not
            // learn that it exists.
            return await _accessScope.CanSeeStudentTaskAsync(user, task.Id)
                ? (null, WorkflowErrors.PanelNotAllowed)
                : (null, TaskErrors.StudentTaskNotFound);
        }

        return task.Status == StudentTaskStatus.Approved
            ? (null, WorkflowErrors.AlreadyApproved)
            : (task, null);
    }
```

- [ ] **Step 3: The step endpoints**

In `Controllers/StudentTasksController.cs` add (`using DiplomaTracker.Api.DTOs.Workflow;` at the top):

```csharp
    [HttpGet("{id:guid}/reviewers")]
    public async Task<IActionResult> Reviewers(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (panel, error) = await _workflow.GetPanelAsync(user, id);
        return panel is null ? ErrorResult(error) : Ok(panel);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/reviewers")]
    public async Task<IActionResult> AddReviewer(Guid id, [FromBody] AddPanelReviewerRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.AddReviewerAsync(user, id, request.ReviewerId!.Value);
        return step is null ? ErrorResult(error) : Ok(step);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}/reviewers/{reviewerId:guid}")]
    public async Task<IActionResult> RemoveReviewer(Guid id, Guid reviewerId)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (step, error) = await _workflow.RemoveReviewerAsync(user, id, reviewerId);
        return step is null ? ErrorResult(error) : Ok(step);
    }
```

- [ ] **Step 4: The staff directory**

`Interfaces/ITeacherService.cs` — add:

```csharp
    Task<IReadOnlyList<StaffOptionResponse>> SearchStaffAsync(string? search);
```

`Services/TeacherService.cs` — add:

```csharp
    private const int StaffOptionLimit = 20;
    private const int StaffSearchMaxLength = 100;

    /// Design 2026-09-24 §3.5: active teachers and administrators, for the extra-reviewer picker.
    public async Task<IReadOnlyList<StaffOptionResponse>> SearchStaffAsync(string? search)
    {
        var query = _dbContext.Users.AsNoTracking()
            .Where(u => u.IsActive && (u.Role == "Teacher" || u.Role == "Admin"));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var trimmed = search.Trim();
            if (trimmed.Length > StaffSearchMaxLength)
            {
                trimmed = trimmed[..StaffSearchMaxLength];
            }

            // The same escaping the topic search uses: unescaped, "50%" would match as a pattern.
            var term = trimmed.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
            query = query.Where(u => EF.Functions.Like(u.LastName, $"%{term}%")
                || EF.Functions.Like(u.FirstName, $"%{term}%")
                || EF.Functions.Like(u.Email, $"%{term}%"));
        }

        var users = await query
            .OrderBy(u => u.LastName)
            .ThenBy(u => u.FirstName)
            .Take(StaffOptionLimit)
            .ToListAsync();

        return users.Select(u => new StaffOptionResponse(u.Id, PersonName.Full(u), u.Role, u.Email)).ToList();
    }
```

`Controllers/StaffController.cs`:

```csharp
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/staff")]
[Authorize(Roles = "Admin,Teacher")]
public class StaffController : ApiControllerBase
{
    private readonly ITeacherService _teachers;

    public StaffController(ITeacherService teachers)
    {
        _teachers = teachers;
    }

    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] string? search)
    {
        return Ok(await _teachers.SearchStaffAsync(search));
    }
}
```

- [ ] **Step 5: Build**

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

---

### Task 3: Check scripts and demo data

The scripts are written here and run in Task 5 against the regenerated database.

**Files:**
- Create: `.superpowers/checks/review-panels-check.mjs`
- Modify: `.superpowers/checks/workflow-check.mjs`, `.superpowers/checks/hardening-check.mjs`
- Modify: `.superpowers/demo/seed-demo.mjs`, `.superpowers/demo/README.md`

**Interfaces:**
- Consumes: the endpoints of Tasks 1–2; `createCleanup`, `giveTopic`, `removeGroup` from `checkCleanup.mjs`.

- [ ] **Step 1: The new check script**

`.superpowers/checks/review-panels-check.mjs`:

```js
// Design 2026-09-24 §3 and §5: review panels. Runs against the live local API on :5000 and leaves
// nothing behind (checkCleanup.mjs).
import { createCleanup, giveTopic, removeGroup } from './checkCleanup.mjs'

const API = 'http://localhost:5000'
const stamp = Date.now().toString().slice(-6)
const results = []
const authCalls = []
const cleanup = createCleanup()

function check(name, actual, expected) {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

async function paceAuth() {
  const now = Date.now()
  while (authCalls.length && now - authCalls[0] > 61_000) authCalls.shift()
  if (authCalls.length >= 9) {
    const wait = 61_000 - (now - authCalls[0])
    console.log(`... waiting ${Math.ceil(wait / 1000)}s for the rate-limit window`)
    await new Promise((resolve) => setTimeout(resolve, wait))
    authCalls.length = 0
  }
  authCalls.push(Date.now())
}

async function call(method, path, { token, json, form } = {}) {
  if (path === '/api/auth/login') await paceAuth()
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(API + path, { method, headers, body: form ?? (json === undefined ? undefined : JSON.stringify(json)) })
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) }
  }
  return { status: response.status, headers: response.headers, body: await response.json() }
}

const login = async (email, password) => (await call('POST', '/api/auth/login', { json: { email, password } })).body.token

// ---------- minimal genuine .docx (same shape as workflow-check.mjs) ----------
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const data = Buffer.from(file.content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const docx = new Uint8Array(zip([
  { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
  { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
  { name: 'word/document.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body><w:p><w:r><w:t>Work</w:t></w:r></w:p></w:body></w:document>` }
]))

function form() {
  const data = new FormData()
  data.append('mainFile', new Blob([docx]), 'work.docx')
  return data
}

async function runChecks() {
  const admin = await login('admin@diploma.local', 'Admin123!')
  const teacher = await login('teacher@diploma.local', 'Teacher123!')
  const teacherId = (await call('GET', '/api/teachers', { token: admin })).body.find((t) => t.email === 'teacher@diploma.local').id

  // Arrange: a group with two steps, one student whose topic (and so supervisor) is the seed
  // teacher's, a teacher who reviews the group, two extra reviewers and an outsider.
  const department = (await call('GET', '/api/departments', { token: admin })).body[0]
  const group = (await call('POST', '/api/groups', { token: admin, json: { departmentId: department.id, code: `RP${stamp}`, academicYear: '2026/2027', description: '' } })).body
  cleanup.add(`group ${group.code}`, () => removeGroup(call, admin, group))

  async function makeTeacher(key) {
    const email = `panel.${key.toLowerCase()}.${stamp}@diploma.local`
    const id = (await call('POST', '/api/teachers', { token: admin, json: { firstName: key, lastName: `Panel${key}${stamp}`, email, password: 'Teacher456!' } })).body.id
    cleanup.add(`teacher ${email} -> deactivate`, () => call('PATCH', `/api/teachers/${id}/deactivate`, { token: admin }))
    return { id, token: await login(email, 'Teacher456!') }
  }
  const watcher = await makeTeacher('Watcher')
  const extraA = await makeTeacher('Alpha')
  const extraB = await makeTeacher('Beta')
  const outsider = await makeTeacher('Outsider')
  await call('POST', `/api/groups/${group.id}/reviewers`, { token: admin, json: { reviewerId: watcher.id } })

  const templates = (await call('GET', '/api/task-templates', { token: admin })).body
    .filter((t) => t.isActive && t.facultyId === department.facultyId)
    .sort((a, b) => a.order - b.order)
  const future = '2099-01-01T00:00:00Z'
  await call('POST', `/api/groups/${group.id}/assign-all-task-templates`, { token: admin, json: { items: [{ taskTemplateId: templates[0].id, deadline: future }, { taskTemplateId: templates[1].id, deadline: future }] } })

  const studentEmail = `panel.${stamp}@student.local`
  const student = (await call('POST', '/api/students', { token: admin, json: { firstName: 'Panel', lastName: 'Student', email: studentEmail, studentNumber: `P${stamp}`, password: 'Password1!', groupId: group.id } })).body
  const studentToken = await login(studentEmail, 'Password1!')
  await giveTopic(call, cleanup, { admin, teacher, departmentId: department.id, studentId: student.id, title: `Panel Topic ${stamp}` })
  const steps = (await call('GET', '/api/student-tasks/mine', { token: studentToken })).body.sort((a, b) => a.order - b.order)
  const step1 = steps[0].id
  const step2 = steps[1].id

  // ---------- the panel and who may change it ----------
  const fresh = (await call('GET', `/api/student-tasks/${step1}`, { token: teacher })).body
  check('01 a fresh step has the supervisor seat only', fresh.panel.length, 1)
  check('01a that seat is the supervisor', `${fresh.panel[0].seat}:${fresh.panel[0].reviewerId}`, `Supervisor:${teacherId}`)
  check('01b my work counts one seat', steps[0].panelSize, 1)

  const options = (await call('GET', `/api/staff/options?search=PanelAlpha${stamp}`, { token: watcher.token })).body
  check('02 the staff search finds a teacher', options.some((o) => o.id === extraA.id), true)
  check('03 a student cannot search staff', (await call('GET', '/api/staff/options', { token: studentToken })).status, 403)

  check('04 an unrelated teacher cannot change the panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: outsider.token, json: { reviewerId: extraA.id } })).body.code, 'studentTask.notFound')
  const addedA = await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: watcher.token, json: { reviewerId: extraA.id } })
  check('05 a group reviewer adds an extra reviewer', addedA.body.panel?.length, 2)
  const addedB = await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: teacher, json: { reviewerId: extraB.id } })
  check('06 the supervisor adds another', addedB.body.panel?.length, 3)
  check('07 the supervisor cannot be an extra reviewer', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: teacherId } })).body.code, 'panel.reviewerIsSupervisor')
  check('08 nobody sits twice', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: extraA.id } })).body.code, 'panel.reviewerExists')
  check('09 an unknown person is refused', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: crypto.randomUUID() } })).body.code, 'panel.reviewerInvalid')

  check('10 an extra reviewer opens the step', (await call('GET', `/api/student-tasks/${step1}`, { token: extraA.token })).status, 200)
  check('10a but not the group', (await call('GET', `/api/groups/${group.id}`, { token: extraA.token })).body.code, 'group.notFound')
  check('10b nor the student\'s other step', (await call('GET', `/api/student-tasks/${step2}`, { token: extraA.token })).body.code, 'studentTask.notFound')
  check('11 an extra reviewer cannot change the panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: extraA.token, json: { reviewerId: outsider.id } })).body.code, 'panel.notAllowed')

  // ---------- version 1: one approval, then a return ----------
  const v1 = (await call('POST', `/api/student-tasks/${step1}/submissions`, { token: studentToken, form: form() })).body
  const v1Id = v1.timeline[0].id
  const inQueue = async (token, stepId = step1) =>
    (await call('GET', `/api/review/queue?groupId=${group.id}&pageSize=100`, { token })).body.items.some((i) => i.studentTaskId === stepId)

  check('12 an extra reviewer\'s queue has it', await inQueue(extraA.token), true)
  check('12a a group reviewer only watches', await inQueue(watcher.token), false)
  check('13 a group reviewer cannot decide', (await call('POST', `/api/submissions/${v1Id}/approve`, { token: watcher.token, json: { mark: 90 } })).body.code, 'review.notOnPanel')
  const afterA = (await call('POST', `/api/submissions/${v1Id}/approve`, { token: extraA.token, json: { mark: 90 } })).body
  check('14 one approval keeps the step under review', `${afterA.status} ${afterA.panelApproved}/${afterA.panelSize}`, 'Submitted 1/3')
  check('15 a satisfied seat cannot decide again', (await call('POST', `/api/submissions/${v1Id}/approve`, { token: extraA.token, json: { mark: 95 } })).body.code, 'review.seatSatisfied')
  check('16 it leaves that reviewer\'s queue', await inQueue(extraA.token), false)
  const afterReturn = (await call('POST', `/api/submissions/${v1Id}/return`, { token: extraB.token, json: { comment: 'Fix the formatting' } })).body
  check('17 one return sends the step back', afterReturn.status, 'Returned')
  check('17a the returning seat shows it', afterReturn.panel.find((s) => s.reviewerId === extraB.id)?.state, 'Returned')

  // ---------- version 2: the approval of version 1 still counts ----------
  const v2 = (await call('POST', `/api/student-tasks/${step1}/submissions`, { token: studentToken, form: form() })).body
  const v2Id = v2.timeline.at(-1).id
  check('18 approvals stick across versions', `${v2.panelApproved}/${v2.panelSize}`, '1/3')
  check('18a the earlier approver is not asked again', await inQueue(extraA.token), false)
  check('18b the reviewer who returned it is', await inQueue(extraB.token), true)
  const afterSupervisor = (await call('POST', `/api/submissions/${v2Id}/approve`, { token: teacher, json: { mark: 81 } })).body
  check('19 the supervisor approves, one seat still open', `${afterSupervisor.status} ${afterSupervisor.panelApproved}/${afterSupervisor.panelSize}`, 'Submitted 2/3')
  const done = (await call('POST', `/api/submissions/${v2Id}/approve`, { token: extraB.token, json: { mark: 86, comment: 'Good now' } })).body
  check('20 the last open seat approves the step', done.status, 'Approved')
  check('21 the mark is the rounded panel average', done.mark, 86) // (90 + 81 + 86) / 3 = 85.67
  check('22 an approved step keeps its panel', (await call('POST', `/api/student-tasks/${step1}/reviewers`, { token: admin, json: { reviewerId: outsider.id } })).body.code, 'step.alreadyApproved')
  const studentView = (await call('GET', `/api/student-tasks/${step1}`, { token: studentToken })).body
  check('23 the student sees every seat', studentView.panel.length, 3)
  check('23a and every reviewer\'s decision per version', studentView.timeline.map((s) => s.reviews.length).join(','), '2,2')

  // ---------- downloads follow the step ----------
  const fileId = v1.timeline[0].files[0].id
  check('24 an extra reviewer downloads the step\'s file', (await call('GET', `/api/submission-files/${fileId}`, { token: extraA.token })).status, 200)
  check('24a an outsider does not', (await call('GET', `/api/submission-files/${fileId}`, { token: outsider.token })).status, 404)

  // ---------- step 2: an administrator stands in, and a removal completes the panel ----------
  await call('POST', `/api/student-tasks/${step2}/reviewers`, { token: teacher, json: { reviewerId: extraA.id } })
  const s2 = (await call('POST', `/api/student-tasks/${step2}/submissions`, { token: studentToken, form: form() })).body
  const s2Id = s2.timeline[0].id
  const standIn = (await call('POST', `/api/submissions/${s2Id}/approve`, { token: admin, json: { mark: 70 } })).body
  check('25 an administrator fills the supervisor seat', `${standIn.status} ${standIn.panelApproved}/${standIn.panelSize}`, 'Submitted 1/2')
  check('25a the supervisor has nothing left to decide', (await call('POST', `/api/submissions/${s2Id}/approve`, { token: teacher, json: { mark: 99 } })).body.code, 'review.seatSatisfied')
  check('26 removing someone who is not on the panel', (await call('DELETE', `/api/student-tasks/${step2}/reviewers/${outsider.id}`, { token: teacher })).body.code, 'panel.reviewerNotFound')
  const removed = (await call('DELETE', `/api/student-tasks/${step2}/reviewers/${extraA.id}`, { token: watcher.token })).body
  check('27 a removal that leaves every seat approved approves the step', `${removed.status} ${removed.mark}`, 'Approved 70')
}

try {
  await runChecks()
} finally {
  await cleanup.run()
}

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} checks passed`)
process.exit(passed === results.length ? 0 : 1)
```

- [ ] **Step 2: The existing scripts follow the panel**

`.superpowers/checks/workflow-check.mjs` — in check `16` replace `'submission.notReviewer'` with `'review.notOnPanel'`. The seed teacher is both the group's reviewer and, through `giveTopic`, the student's supervisor, so the rest of the script decides in the supervisor seat and needs no change.

`.superpowers/checks/hardening-check.mjs` — the queue teacher reviews the group but supervises nobody, so from now on it only watches. The students' supervisor is the seed `teacher` (their topics come from `giveTopic`):

1. In the `return` call after `const q1SubmissionId = …` and in the `approve` call that assigns `q5Decision`, replace `token: queueTeacherToken` with `token: teacher`.
2. In the two queue calls that assign `queuePage1` and `queuePage2`, replace `token: queueTeacherToken` with `token: teacher`.
3. Replace the block from `const teacherDashboard = …` through check `30c` with:

```js
// Phase 9: a group reviewer watches and the supervisor decides, so the waiting count belongs to the
// supervisor - the seed teacher, whose topics these students hold.
const teacherDashboard = (await call('GET', '/api/dashboard/teacher', { token: teacher })).body
const teacherQueueTotal = (await call('GET', '/api/review/queue', { token: teacher })).body.total
check('30 teacher dashboard waitingReviews matches queue total', teacherDashboard.waitingReviews, teacherQueueTotal)
check('30a teacher dashboard latestForReview capped at five', teacherDashboard.latestForReview.length <= 5, true)
// §7.4: the group table lists the groups a teacher reviews. The seed teacher supervises the queue
// students (their topics are hers) but does not review their group, so it is not in her table.
check('30b reviewer sees the group in the dashboard table', (await call('GET', '/api/dashboard/teacher', { token: queueTeacherToken })).body.groups.some((g) => g.groupId === queueGroup.id), true)
check('30c a supervisor who does not review it does not', teacherDashboard.groups.some((g) => g.groupId === queueGroup.id), false)
```

The `groupProgress` read with `queueTeacherToken` stays: a group reviewer still sees progress.

- [ ] **Step 3: Demo data decides by panel**

In `.superpowers/demo/seed-demo.mjs`:

1. Give three students extra reviewers. The `extras` map runs from the step index to the teacher keys that join that step's panel. Add the property to these `STUDENTS` entries:

```js
  // Бондаренко: step 2 waits for Коваленко after Петренко's approval ("1 of 2").
  { group: 'ip21', lastName: 'Бондаренко', …, steps: ['approved:95', 'submitted'], extras: { 1: ['kovalenko'] } },
  // Мельник: Петренко approves version 1, the supervisor returns it, version 2 completes the panel.
  { group: 'ip21', lastName: 'Мельник', …, steps: ['returned', 'submitted'], extras: { 0: ['petrenko'] } },
  // Лисенко: step 2 approved by a panel of two (average mark), step 3 waits for two of three.
  { group: 'ip21', lastName: 'Лисенко', …, steps: ['approved:100', 'approved:92', 'submitted'], extras: { 1: ['shevchuk'], 2: ['petrenko', 'shevchuk'] } },
```

(Keep every other field of those entries as it is; only `extras` is new.)

2. Record each student's supervisor. In the topic loop, after `const supervisor = teachers[topic.supervisor]`, add `s.supervisorKey = topic.supervisor`. In the proposals loop, add `proposer.supervisorKey = 'petrenko'` next to `proposer.topicTitle = proposer.proposal`.

3. Replace the whole `console.log('Submissions and reviews...')` loop with:

```js
  console.log('Submissions and reviews...')
  for (const s of students) {
    if (s.steps.length === 0) continue
    // Design 2026-09-24 §3: the supervisor always reviews; extra reviewers join a step's panel.
    const supervisor = teachers[s.supervisorKey]
    const tasks = (await call('GET', '/api/student-tasks/mine', { token: s.token })).sort((a, b) => a.order - b.order)
    for (const [i, outcome] of s.steps.entries()) {
      const task = tasks[i]
      const paragraphs = STEP_TEXT[Math.min(i, STEP_TEXT.length - 1)](s)
      const fileName = `${s.lastName}_${STEPS[i].title.split(' ')[0].toLowerCase()}.docx`
      const submit = async (version, note) => {
        const form = new FormData()
        form.append('mainFile', new Blob([docx(`${STEPS[i].title} — ${s.lastName} ${s.firstName}`, version > 1 ? [...paragraphs, 'Зауваження керівника враховано.'] : paragraphs)]), fileName)
        if (note) form.append('message', note)
        await call('POST', `/api/student-tasks/${task.id}/submissions`, { token: s.token, form })
      }
      // The undecided version, as the reviewer's own step page offers it to them.
      const decide = async (reviewer, action, json) => {
        const step = await call('GET', `/api/student-tasks/${task.id}`, { token: reviewer.token })
        await call('POST', `/api/submissions/${step.pendingSubmissionId}/${action}`, { token: reviewer.token, json })
      }
      const extras = (s.extras?.[i] ?? []).map((key) => teachers[key])

      await submit(1, i === 0 ? 'Надсилаю тему та план роботи.' : undefined)
      // The supervisor asks colleagues to join the panel once there is work to read.
      for (const extra of extras) {
        await call('POST', `/api/student-tasks/${task.id}/reviewers`, { token: supervisor.token, json: { reviewerId: extra.id } })
      }

      if (outcome === 'submitted') {
        // With a panel, the supervisor has approved and the extra reviewers are still reading.
        if (extras.length > 0) await decide(supervisor, 'approve', { mark: 90, comment: APPROVE_COMMENTS[0] })
        continue
      }
      if (outcome === 'returned') {
        for (const extra of extras) await decide(extra, 'approve', { mark: 88, comment: 'Оформлення відповідає вимогам.' })
        await decide(supervisor, 'return', { comment: RETURN_COMMENTS[i % RETURN_COMMENTS.length] })
        // A returned step is sent again. The last step of a student's list stays awaiting review.
        await submit(2, 'Виправлену версію надіслано.')
        if (i === s.steps.length - 1) continue
        await decide(supervisor, 'approve', { mark: 85, comment: 'Зауваження враховано.' })
        continue
      }
      const mark = Number(outcome.split(':')[1])
      for (const extra of extras) await decide(extra, 'approve', { mark: Math.max(0, mark - 3), comment: 'Оформлення відповідає вимогам.' })
      await decide(supervisor, 'approve', { mark, comment: APPROVE_COMMENTS[(s.index + i) % APPROVE_COMMENTS.length] })
    }
  }
```

The `reviewers` map stays: it still assigns each group its reviewer, who now watches.

4. In `.superpowers/demo/README.md` add a section after the existing walkthrough steps:

```markdown
### Review panels

- Бондаренко Максим, step 2: Петренко (supervisor) approved with 90; Коваленко, an extra reviewer, still has to decide. *My work* shows "1 of 2 approved"; Коваленко finds it in the review queue.
- Мельник Дмитро, step 1: Петренко (extra) approved version 1, the supervisor Коваленко returned it, and version 2 completed the panel. The mark is the average, 87. Петренко's approval of version 1 still counted.
- Лисенко Катерина, step 2: approved by Коваленко (92) and Шевчук (89), mark 91. Step 3 waits for Петренко and Шевчук after Коваленко's approval ("1 of 3").
- A group's reviewer (for ІП-21, Петренко) sees the group's progress and every step page, and can add extra reviewers, but decides only where they sit on the panel.
```

- [ ] **Step 4: Syntax check**

```bash
node --check .superpowers/checks/review-panels-check.mjs && node --check .superpowers/checks/hardening-check.mjs && node --check .superpowers/checks/workflow-check.mjs && node --check .superpowers/demo/seed-demo.mjs
```

Expected: no output.

---

### Task 4: Client, step page and pages

**Files:**
- Modify: `frontend/diploma-tracker-web/src/api/types.ts`, `src/api/workflowApi.ts`
- Create: `frontend/diploma-tracker-web/src/components/workflow/ReviewPanelCard.tsx`, `AddReviewerDialog.tsx`
- Modify: `frontend/diploma-tracker-web/src/components/workflow/StepDetails.tsx`, `StepTimeline.tsx`, `DecisionPanel.tsx`
- Modify: `frontend/diploma-tracker-web/src/pages/ReviewQueuePage.tsx`, `StudentMyTasksPage.tsx`, `ArchivedGroupPage.tsx`
- Modify: `frontend/diploma-tracker-web/src/i18n/uk.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: the response shapes of Tasks 1–2.
- Produces: `addPanelReviewer(stepId, reviewerId)`, `removePanelReviewer(stepId, reviewerId)`, `searchStaff(search)`, and the types `ReviewSeat`, `PanelSeat`, `SubmissionReview`, `StaffOption`, `ArchivedReview`.

- [ ] **Step 1: Types**

In `src/api/types.ts`:

Add after `StudentTaskStatus`:

```ts
export type ReviewSeat = 'Supervisor' | 'Extra'

export type PanelSeat = {
  seat: ReviewSeat
  /** Null only for a supervisor seat whose student has no supervisor. */
  reviewerId: string | null
  reviewerName: string | null
  isActive: boolean
  state: 'Approved' | 'Returned' | 'Waiting'
  mark: number | null
  canRemove: boolean
}

export type SubmissionReview = {
  id: string
  reviewerName: string
  seat: ReviewSeat
  decision: 'Approved' | 'Returned'
  mark: number | null
  comment: string | null
  decidedAt: string
}

export type StaffOption = {
  id: string
  name: string
  role: 'Admin' | 'Teacher'
  email: string
}
```

In `StudentStep` add:

```ts
  panelSize: number
  panelApproved: number
```

Replace `Submission` with:

```ts
export type Submission = {
  id: string
  version: number
  message: string | null
  submittedAt: string
  isLate: boolean
  /** The version's outcome: null while the panel decides. */
  decision: 'Approved' | 'Returned' | null
  decidedAt: string | null
  reviews: SubmissionReview[]
  files: SubmissionFileInfo[]
}
```

Replace `StepDetails` with:

```ts
export type StepDetails = StudentStep & {
  studentProfileId: string
  studentName: string
  groupCode: string
  canDecide: boolean
  pendingSubmissionId: string | null
  canManagePanel: boolean
  panel: PanelSeat[]
  timeline: Submission[]
}
```

In `ReviewQueueItem` add:

```ts
  panelSize: number
  panelApproved: number
```

In `ArchivedFile` delete `reviewerName` and `reviewerComment`. Add:

```ts
export type ArchivedReview = {
  id: string
  studentName: string
  studentNumber: string
  stepTitle: string
  stepOrder: number
  version: number
  reviewerName: string
  seat: ReviewSeat
  decision: 'Approved' | 'Returned'
  mark: number | null
  comment: string | null
  decidedAt: string
}
```

and in `ArchivedGroupDetails` add `reviews: ArchivedReview[]`.

- [ ] **Step 2: API functions**

In `src/api/workflowApi.ts` extend the type import with `StaffOption` and add:

```ts
export function addPanelReviewer(stepId: string, reviewerId: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${stepId}/reviewers`, { method: 'POST', body: JSON.stringify({ reviewerId }) })
}

export function removePanelReviewer(stepId: string, reviewerId: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${stepId}/reviewers/${reviewerId}`, { method: 'DELETE' })
}

export function searchStaff(search: string): Promise<StaffOption[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const query = params.toString()
  return apiRequest<StaffOption[]>(`/api/staff/options${query ? `?${query}` : ''}`)
}
```

- [ ] **Step 3: The add-reviewer dialog**

`src/components/workflow/AddReviewerDialog.tsx`. It is mounted only while open, so its state starts fresh every time:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addPanelReviewer, searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Spinner'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import type { StaffOption, StepDetails } from '../../api/types'

type AddReviewerDialogProps = {
  step: StepDetails
  onClose: () => void
  onAdded: (details: StepDetails) => void
}

export function AddReviewerDialog({ step, onClose, onAdded }: AddReviewerDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const result = await searchStaff(search.trim())
        if (requestRef.current !== requestId) return
        setOptions(result)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    const timer = window.setTimeout(() => {
      void load()
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const onPanel = new Set(step.panel.map((seat) => seat.reviewerId).filter((id): id is string => id !== null))
  const available = options.filter((option) => !onPanel.has(option.id))

  const handleAdd = async () => {
    if (!selectedId) return
    setIsSaving(true)
    try {
      const details = await addPanelReviewer(step.id, selectedId)
      toast.success(t('steps.reviewerAdded'))
      onAdded(details)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={isSaving ? () => undefined : onClose}
      title={t('steps.addReviewerTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleAdd()} disabled={!selectedId} loading={isSaving}>
            {t('steps.addReviewer')}
          </Button>
        </>
      }
    >
      <TextField label={t('steps.reviewerSearch')} value={search} onChange={(event) => setSearch(event.target.value)} />
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!isLoading && !loadError && available.length === 0 && <p className="text-sm text-text-muted">{t('steps.reviewerSearchEmpty')}</p>}
      {!isLoading && available.length > 0 && (
        <ul role="listbox" aria-label={t('steps.reviewerSearch')} className="flex max-h-64 flex-col gap-1 overflow-auto">
          {available.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={selectedId === option.id}
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  'w-full rounded-control px-3 py-2 text-left text-sm hover:bg-surface',
                  selectedId === option.id && 'bg-surface font-semibold'
                )}
              >
                <span className="block text-text-strong">{option.name}</span>
                <span className="block text-xs text-text-muted">
                  {t(`roles.${option.role}`)} · {option.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
```

- [ ] **Step 4: The panel card**

`src/components/workflow/ReviewPanelCard.tsx`:

```tsx
import { Plus, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { removePanelReviewer } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/useToast'
import { AddReviewerDialog } from './AddReviewerDialog'
import type { PanelSeat, StepDetails } from '../../api/types'

type ReviewPanelCardProps = {
  step: StepDetails
  onChanged: (details: StepDetails) => void
}

const stateTones: Record<PanelSeat['state'], BadgeTone> = {
  Approved: 'success',
  Returned: 'warning',
  Waiting: 'neutral'
}

export function ReviewPanelCard({ step, onChanged }: ReviewPanelCardProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<PanelSeat | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const confirmRemove = async () => {
    if (!removing?.reviewerId) return
    setIsRemoving(true)
    try {
      const details = await removePanelReviewer(step.id, removing.reviewerId)
      setRemoving(null)
      toast.success(t('steps.reviewerRemoved'))
      onChanged(details)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <Card
      title={t('steps.panelTitle')}
      className="mb-6"
      actions={
        step.canManagePanel ? (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setIsAddOpen(true)}>
            {t('steps.addReviewer')}
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col divide-y divide-border-subtle">
        {step.panel.map((seat, index) => (
          <li key={`${seat.seat}-${seat.reviewerId ?? index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-strong">{seat.reviewerName ?? t('steps.noSupervisor')}</p>
              <p className="text-xs text-text-muted">{t(`steps.seat.${seat.seat}`)}</p>
            </div>
            <div className="flex items-center gap-2">
              {seat.reviewerId && !seat.isActive && <Badge tone="danger">{t('steps.inactiveReviewer')}</Badge>}
              <Badge tone={stateTones[seat.state]}>
                {seat.state === 'Approved' ? t('steps.seatState.Approved', { mark: seat.mark ?? '—' }) : t(`steps.seatState.${seat.state}`)}
              </Badge>
              {seat.canRemove && (
                <Button variant="ghost" size="sm" icon={UserMinus} aria-label={t('steps.removeReviewer')} onClick={() => setRemoving(seat)} />
              )}
            </div>
          </li>
        ))}
      </ul>

      {isAddOpen && (
        <AddReviewerDialog
          step={step}
          onClose={() => setIsAddOpen(false)}
          onAdded={(details) => {
            setIsAddOpen(false)
            onChanged(details)
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('steps.removeReviewer')}
        message={t('steps.removeReviewerConfirm', { name: removing?.reviewerName ?? '' })}
        confirmLabel={t('steps.removeReviewer')}
        loading={isRemoving}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  )
}
```

- [ ] **Step 5: Step page, timeline and decision panel**

`StepDetails.tsx`:
- Import `ReviewPanelCard`.
- Render `<ReviewPanelCard step={step} onChanged={setStep} />` directly after the summary card (the one with deadline, status, mark and completed), in **both** modes.
- Change the decision condition from `step.canReview` to `step.canDecide`.

`StepTimeline.tsx` — replace the `{submission.decision && ( … )}` block with:

```tsx
          {submission.reviews.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {submission.reviews.map((review) => (
                <div
                  key={review.id}
                  className={cn('border-l-2 pl-4', review.decision === 'Approved' ? 'border-success' : 'border-warning')}
                >
                  <p className="text-sm font-semibold text-heading">
                    {t(`steps.decision.${review.decision}`)}
                    {review.mark !== null ? ` · ${review.mark}` : ''}
                  </p>
                  <p className="text-xs text-text-muted">
                    {review.reviewerName} · {t(`steps.seat.${review.seat}`)} · {dateTimeFormat.format(new Date(review.decidedAt))}
                  </p>
                  {review.comment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{review.comment}</p>}
                </div>
              ))}
            </div>
          )}

          {submission.decision && (
            <div className="mt-3">
              <Badge tone={submission.decision === 'Approved' ? 'success' : 'warning'}>{t(`steps.outcome.${submission.decision}`)}</Badge>
            </div>
          )}
```

`DecisionPanel.tsx` — after a successful approval the step may still be under review. Replace the success toast line with:

```tsx
      toast.success(t(confirmAction === 'return' ? 'steps.returned' : details.status === 'Approved' ? 'steps.approved' : 'steps.approvalRecorded'))
```

- [ ] **Step 6: Queue, My work and archive**

`ReviewQueuePage.tsx` — add a column after `step`:

```tsx
    { key: 'panel', header: t('review.panel'), render: (item) => t('review.approvedOf', { approved: item.panelApproved, total: item.panelSize }) },
```

`StudentMyTasksPage.tsx` — replace the `status` column's `render` with:

```tsx
      render: (step) => (
        <div className="flex flex-col items-start gap-1">
          <StepStatusBadge status={step.status} isLate={step.isLate} />
          {step.status === 'Submitted' && step.panelSize > 1 && (
            <span className="text-xs text-text-muted">{t('steps.panelProgress', { approved: step.panelApproved, total: step.panelSize })}</span>
          )}
        </div>
      )
```

`ArchivedGroupPage.tsx`:
- Delete the `reviewer` and `comment` columns of the files table.
- Add a second card below the files card, titled `t('archive.reviews')`. It holds a `DataTable<ArchivedReview>` over `details.reviews`, with `getRowKey={(review) => review.id}` and an `EmptyState` of `t('archive.noReviews')`. Use these columns, formatting `decidedAt` with the page's existing date-time formatter:

```tsx
  const reviewColumns: DataTableColumn<ArchivedReview>[] = [
    { key: 'student', header: t('steps.student'), render: (review) => `${review.studentName} (${review.studentNumber})` },
    { key: 'step', header: t('archive.step'), render: (review) => `${review.stepOrder}. ${review.stepTitle}` },
    { key: 'version', header: t('archive.version'), render: (review) => review.version },
    { key: 'reviewer', header: t('archive.reviewer'), render: (review) => `${review.reviewerName} · ${t(`steps.seat.${review.seat}`)}` },
    {
      key: 'decision',
      header: t('archive.decision'),
      render: (review) => <Badge tone={review.decision === 'Approved' ? 'success' : 'warning'}>{t(`steps.decision.${review.decision}`)}</Badge>
    },
    { key: 'mark', header: t('archive.mark'), render: (review) => review.mark ?? '' },
    { key: 'comment', header: t('archive.comment'), render: (review) => review.comment ?? '' },
    { key: 'decidedAt', header: t('archive.decidedAt'), render: (review) => dateTimeFormat.format(new Date(review.decidedAt)) }
  ]
```

`dateTimeFormat` is the page's existing memoised formatter (already used by the `submittedAt` column). Import `ArchivedReview` from `../api/types`.

- [ ] **Step 7: Translations**

Add to both files. Nested objects merge into the existing blocks of the same name.

`en.json`:

```json
{
  "steps": {
    "panelTitle": "Reviewers",
    "seat": { "Supervisor": "Supervisor", "Extra": "Extra reviewer" },
    "seatState": { "Approved": "Approved — {{mark}}", "Returned": "Returned", "Waiting": "Waiting" },
    "noSupervisor": "No supervisor",
    "inactiveReviewer": "Deactivated",
    "addReviewer": "Add reviewer",
    "addReviewerTitle": "Add a reviewer to this step",
    "reviewerSearch": "Search by name or email",
    "reviewerSearchEmpty": "No matching teachers or administrators.",
    "reviewerAdded": "Reviewer added",
    "removeReviewer": "Remove reviewer",
    "removeReviewerConfirm": "Remove {{name}} from this step's reviewers? Their approval, if any, will no longer count.",
    "reviewerRemoved": "Reviewer removed",
    "panelProgress": "{{approved}} of {{total}} approved",
    "approvalRecorded": "Your approval is recorded",
    "outcome": { "Approved": "Step approved", "Returned": "Returned for revision" }
  },
  "review": { "panel": "Reviewers" },
  "archive": { "reviews": "Reviews", "noReviews": "No reviews were recorded.", "decidedAt": "Decided" },
  "errors": {
    "review": {
      "notOnPanel": "You are not on this step's review panel.",
      "seatSatisfied": "Your approval of this step is already recorded."
    },
    "panel": {
      "reviewerInvalid": "Choose an active teacher or administrator.",
      "reviewerIsSupervisor": "The student's supervisor already reviews this step.",
      "reviewerExists": "This person already reviews this step.",
      "reviewerNotFound": "This person is not an extra reviewer of this step.",
      "notAllowed": "You cannot change the reviewers of this step.",
      "changed": "The step changed while you were editing its reviewers. Reload and try again."
    }
  }
}
```

`uk.json`:

```json
{
  "steps": {
    "panelTitle": "Рецензенти",
    "seat": { "Supervisor": "Керівник", "Extra": "Додатковий рецензент" },
    "seatState": { "Approved": "Зараховано — {{mark}}", "Returned": "Повернуто", "Waiting": "Очікує" },
    "noSupervisor": "Керівника не призначено",
    "inactiveReviewer": "Деактивовано",
    "addReviewer": "Додати рецензента",
    "addReviewerTitle": "Додати рецензента до етапу",
    "reviewerSearch": "Пошук за ім'ям або email",
    "reviewerSearchEmpty": "Не знайдено викладачів чи адміністраторів.",
    "reviewerAdded": "Рецензента додано",
    "removeReviewer": "Прибрати рецензента",
    "removeReviewerConfirm": "Прибрати {{name}} з рецензентів етапу? Його рішення, якщо воно є, більше не враховуватиметься.",
    "reviewerRemoved": "Рецензента прибрано",
    "panelProgress": "{{approved}} з {{total}} зараховано",
    "approvalRecorded": "Ваше рішення враховано",
    "outcome": { "Approved": "Етап зараховано", "Returned": "Повернуто на доопрацювання" }
  },
  "review": { "panel": "Рецензенти" },
  "archive": { "reviews": "Рішення рецензентів", "noReviews": "Рішень не зафіксовано.", "decidedAt": "Дата рішення" },
  "errors": {
    "review": {
      "notOnPanel": "Ви не є рецензентом цього етапу.",
      "seatSatisfied": "Ваше рішення щодо цього етапу вже враховано."
    },
    "panel": {
      "reviewerInvalid": "Оберіть активного викладача або адміністратора.",
      "reviewerIsSupervisor": "Керівник студента вже рецензує цей етап.",
      "reviewerExists": "Ця особа вже рецензує цей етап.",
      "reviewerNotFound": "Ця особа не є додатковим рецензентом етапу.",
      "notAllowed": "Ви не можете змінювати рецензентів цього етапу.",
      "changed": "Етап змінився, поки ви редагували рецензентів. Оновіть сторінку й спробуйте ще раз."
    }
  }
}
```

In both files, change `steps.approveConfirm` to `"Approve with mark {{mark}}?"` / `"Зарахувати з оцінкою {{mark}}?"`, and delete `errors.submission.notReviewer`.

- [ ] **Step 8: Frontend gates**

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check
```

Expected: no type errors; lint 0 errors, 0 warnings; i18n keys match in both languages.

---

### Task 5: Schema, verification, records and the commit

**Files:**
- Delete and regenerate: `backend/DiplomaTracker.Api/Migrations/*`
- Modify: `docs/superpowers/PROJECT_MEMORY.md`, `docs/superpowers/test-backlog.md`

- [ ] **Step 1: Ask before the database is dropped**

**Stop here and ask the owner.** This task drops and recreates the local database, and they want to be asked first. The other machine will have to do the same when it next pulls. Do not run Step 2 until they say yes.

While asking, say what will be lost: every row in `DiplomaTrackerDb` not recreated by the seeder. The demo data can be reloaded afterwards with `node .superpowers/demo/seed-demo.mjs`.

- [ ] **Step 2: Drop the database**

The API must not be running. Ask the controller to stop it, then confirm:

```bash
netstat -ano | grep ":5000 .*LISTEN"
```

Expected: no output.

```bash
cd backend && dotnet ef database drop --force --project DiplomaTracker.Api -- --environment Development
```

- [ ] **Step 3: Regenerate the single migration**

```bash
rm -rf backend/DiplomaTracker.Api/Migrations
```

```bash
cd backend && dotnet ef migrations add InitialCreate --project DiplomaTracker.Api -- --environment Development
```

- [ ] **Step 4: Read the migration before trusting it**

```bash
grep -n "StudentTaskReviewers\|SubmissionReviews\|ArchivedReviews\|IX_SubmissionReviews_SubmissionId_ReviewerId\|IX_StudentTaskReviewers_StudentTaskId_ReviewerId\|IX_ArchivedReviews_ArchivedGroupId_SourceReviewId" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected:
- The three new tables are created.
- The three named indexes are created with `unique: true`.
- `Submissions` has no `ReviewerId`, `ReviewerComment` or `Mark` column, and `ArchivedFiles` has no `ReviewerName` or `ReviewerComment`.

```bash
grep -n "IX_TopicReservations_PendingPerStudent\|IX_TopicReservations_ApprovedPerStudent\|IX_StudentProfiles_TopicId" backend/DiplomaTracker.Api/Migrations/*_InitialCreate.cs
```

Expected: both reservation indexes, each with its own filter, and the topic index filtered on `[TopicId] IS NOT NULL`. This confirms the regeneration kept them.

- [ ] **Step 5: Start and settle the model**

Ask the controller to start the API. It applies the migration and re-seeds. Then:

```bash
cd backend && dotnet ef migrations has-pending-model-changes --project DiplomaTracker.Api -- --environment Development
```

Expected: `No changes have been made to the model since the last migration.`

- [ ] **Step 6: Full verification**

Record the actual output of each command, not just "passed".

```bash
dotnet build backend/DiplomaTracker.Api/DiplomaTracker.Api.csproj
```

Expected: `0 Error(s)`, `0 Warning(s)`.

```bash
cd backend && dotnet test DiplomaTracker.Api.Tests/DiplomaTracker.Api.Tests.csproj
```

Expected: all 56 tests pass.

```bash
cd frontend/diploma-tracker-web && npx tsc -b && npm run lint && npm run i18n:check && VITE_API_BASE_URL=http://localhost:5000 npm run build
```

Expected: no type errors; lint 0/0; i18n matching; a successful build.

```bash
node .superpowers/checks/review-panels-check.mjs
```

```bash
for script in workflow-check hardening-check topics-check refinements-check onboarding-check design-system-check templates-check fix-wave-backend-extra-check; do node ".superpowers/checks/$script.mjs"; done
```

Expected: every script fully passing and ending with `Cleanup: nothing left behind.`

```bash
node .superpowers/demo/seed-demo.mjs
```

Expected: the run completes. The demo is then ready for the owner's walkthrough, including the three panel students in its README.

- [ ] **Step 7: Project records**

`docs/superpowers/PROJECT_MEMORY.md`:
- **Status table:** add the row `| 9 Review panels | Done — commit <hash> | 2026-09-24-review-panels-and-document-routing-design.md §3 | 2026-09-24-review-panels.md |`. Also add a row `| 10 Document routing | Designed, not planned | same, §4 | — |`, and change phase 7's state to "Deferred; after phase 10".
- **Gotchas**, add:
  - "**A step's review panel is derived, never stored.** It is the student's current supervisor plus `StudentTaskReviewers`. `ReviewPanel.Evaluate` decides from the facts `StudentWorkflowService.LoadPanelFactsAsync` loads. Approvals stick across versions; an extra seat counts only approvals given after it was added. Group reviewers watch and change panels but never decide."
  - "**Every decision and panel change touches `StudentTask.UpdatedAt`**, so the step's `RowVersion` serialises them. A new write path on a step must do the same."
- **Log:** add one dated line summarising phase 9 and the check count.

`docs/superpowers/test-backlog.md` — add a section:

```markdown
## Phase 9 — Review panels

- `ReviewPanel.Evaluate`: supervisor seat satisfied by the current supervisor or an administrator, not by a former supervisor; an extra seat ignores approvals older than its `AddedAt`; an extra row naming the supervisor is absorbed; rounding half away from zero (85.5 → 86, 86.5 → 87).
- `ReviewPanel.SeatFor`: supervisor first, then extra, then an administrator's stand-in; null for a group reviewer.
- Decisions: the last open seat completes the step with the average; a return keeps earlier approvals; `review.seatSatisfied` for a satisfied seat; two concurrent decisions yield one success and one `submission.alreadyDecided`.
- Panel changes: refused on an approved step; `panel.notAllowed` for an extra reviewer, `studentTask.notFound` for an outsider; a removal completing a submitted step approves it; the unique index turns a racing duplicate into `panel.reviewerExists`.
- Visibility: `CanSeeStudentTaskAsync` grants an extra reviewer that step only, and nothing once the student is archived.
- Queue: a teacher's queue lists only open seats; an extra who became the supervisor appears once.
- Archive: `ArchivedReview` rows copied once across two archiving events; `ArchivedFile.Mark` is the step mark on the approving version only.
```

- [ ] **Step 8: Commit**

```bash
git add -A
```

```bash
git status --short
```

Check the list: `.superpowers/sdd/` must not appear; `.superpowers/checks/review-panels-check.mjs` must. Neither `App_Data/`, `bin/` nor `obj/` may appear.

```bash
git commit -m "Implement review panels"
```

```bash
git log --oneline -3
```

Expected: `Implement review panels` on top, followed by the planning commits (`Add document routing implementation plan and handoff`, `Add review panels implementation plan`, `Add review panels and document routing design`, or later document commits).

- [ ] **Step 9: Report and stop**

Report to the owner:
- the verification numbers from Step 6 and the commit hash;
- that **the other machine must drop its own database** when it next pulls;
- a plain-language list for manual testing, per role:
  - **Supervisor:** add and remove extra reviewers on a student's step; approve or return in their own seat.
  - **Group reviewer:** watches the group and adds reviewers, but has no Approve or Return.
  - **Extra reviewer:** finds the step in their review queue, opens only that step, decides.
  - **Student:** sees every reviewer and each one's decision, and "2 of 3 approved" in *My work*.
  - **Administrator:** stands in for the supervisor; sees reviewers' decisions in the archive.

Then stop. Phase 10 (document routing) gets its own plan once the owner has tested this phase.

---

## Plan self-review

- **Spec coverage (§3):**
  - §3.1 model — Task 1, Steps 1–3.
  - §3.2 panel and sticky approvals — Task 1, Step 4.
  - §3.3 workflow:
    - decisions and seat choice — Task 1, Step 9;
    - panel changes and a removal that completes the step — Task 2, Step 2;
    - concurrency — Task 1, Step 9 and Task 2, Step 2.
  - §3.4 visibility — Task 1, Steps 6 and 10.
  - §3.5 API — Tasks 1–2; all codes are in Task 1, Step 5.
  - §3.6 dashboards, archive and group deletion — Task 1, Steps 13–14. Group deletion relies on the cascades mapped in Step 3.
  - §3.7 interface — Task 4.
  - §5: check script and demo in Task 3; schema and gates in Task 5.
- **Placeholders:** none. Existing-page edits name the exact variables they use (for example, `dateTimeFormat` in `ArchivedGroupPage`).
- **Type consistency:**
  - `PanelSize` / `PanelApproved` (C#) ↔ `panelSize` / `panelApproved` (TS).
  - `CanDecide` ↔ `canDecide`; `CanManagePanel` ↔ `canManagePanel`.
  - `PanelSeatResponse` ↔ `PanelSeat`; `SubmissionReviewResponse` ↔ `SubmissionReview`; `ArchivedReviewResponse` ↔ `ArchivedReview`; `StaffOptionResponse` ↔ `StaffOption`.
  - `LoadPanelFactsAsync` and `CompleteStep` are defined in Task 1, Step 8 and used in Task 1, Steps 9–12 and Task 2, Step 2.
