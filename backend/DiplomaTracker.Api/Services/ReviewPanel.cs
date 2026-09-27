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
    /// wins; an administrator with no seat of their own stands in for the supervisor by default
    /// (`allowAdminStandIn: true`, the default) - that power drives `canDecide` and the Approve/
    /// Return form. Task 7 R1: "Your decision" / `isMyDecision` means explicitly assigned - the
    /// caller actually sits on the panel - so that computation passes `allowAdminStandIn: false`
    /// to get `null` for an administrator who is neither the supervisor nor an extra reviewer.
    public static ReviewSeat? SeatFor(UserContext user, Guid? supervisorId, IReadOnlyList<ExtraSeatFact> extras, bool allowAdminStandIn = true)
    {
        if (supervisorId == user.UserId)
        {
            return ReviewSeat.Supervisor;
        }

        if (extras.Any(e => e.ReviewerId == user.UserId))
        {
            return ReviewSeat.Extra;
        }

        return allowAdminStandIn && user.IsAdmin ? ReviewSeat.Supervisor : null;
    }

    public static bool IsSeatSatisfied(PanelState panel, ReviewSeat seat, Guid userId) =>
        seat == ReviewSeat.Supervisor
            ? panel.Seats[0].IsSatisfied
            : panel.Seats.Any(s => s.Seat == ReviewSeat.Extra && s.ReviewerId == userId && s.IsSatisfied);
}
