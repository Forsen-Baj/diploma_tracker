using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-24 §3.2 and 2026-09-27 §6. A step's panel is never stored as one list. It is the
/// student's CURRENT supervisor, the CURRENT manager of their topic's direction, one seat per extra
/// reviewer on that step, and the standards controller of the group's step. A seat is satisfied by
/// an approval that fills it on ANY version of the step - approvals are sticky. Pure: callers load
/// the facts, this decides, so every reader agrees on what the panel is.
public static class ReviewPanel
{
    public sealed record ExtraSeatFact(Guid ReviewerId, DateTime AddedAt);

    public sealed record StandardsControlFact(Guid ControllerId, DateTime AssignedAt);

    public sealed record ReviewFact(
        Guid ReviewerId,
        bool ReviewerIsAdmin,
        ReviewSeat Seat,
        SubmissionDecision Decision,
        int? Mark,
        DateTime DecidedAt);

    /// What the panel of one step is made of, as loaded.
    public sealed record Facts(
        Guid? SupervisorId,
        Guid? DirectionManagerId,
        StandardsControlFact? StandardsControl,
        IReadOnlyList<ExtraSeatFact> Extras,
        IReadOnlyList<ReviewFact> Reviews)
    {
        public PanelState Evaluate() => ReviewPanel.Evaluate(this);
    }

    /// ReviewerId is null only for a supervisor seat whose student has no supervisor (a topic
    /// released while a version waits) - an administrator can still fill it.
    public sealed record SeatState(ReviewSeat Seat, Guid? ReviewerId, bool IsSatisfied, int? Mark);

    public sealed record PanelState(IReadOnlyList<SeatState> Seats)
    {
        public int Size => Seats.Count;

        public int Satisfied => Seats.Count(s => s.IsSatisfied);

        public bool IsComplete => Seats.All(s => s.IsSatisfied);

        /// Design 2026-09-27 §6.1: an approved step is final. Every seat was satisfied when it was
        /// approved and approvals never lapse, so a seat that is open on it now arrived afterwards -
        /// a standards controller assigned later, a supervisor or direction manager changed later.
        /// That seat never sat on this step, so the approved step's panel leaves it out.
        public PanelState AsApproved() => new(Seats.Where(s => s.IsSatisfied).ToList());

        /// The step mark: the average of the marks behind every satisfied marked seat, rounded to
        /// a whole number, half away from zero. The standards control seat carries no mark.
        public int? AverageMark()
        {
            var marks = Seats.Where(s => s.IsSatisfied && s.Mark is not null).Select(s => s.Mark!.Value).ToList();
            return marks.Count == 0 ? null : (int)Math.Round(marks.Average(), MidpointRounding.AwayFromZero);
        }
    }

    /// Whether approving in this seat takes a mark (§6): every seat but standards control.
    public static bool IsMarked(ReviewSeat seat) => seat != ReviewSeat.StandardsControl;

    /// Seats in order: Supervisor (always first), DirectionManager, Extra..., StandardsControl. One
    /// person holds one seat - whoever already sits earlier in that order is not seated again later,
    /// which is how phase 9 already absorbed an extra naming the supervisor. An extra seat counts
    /// only approvals given after it was added, the standards control seat only those given after
    /// the controller was assigned.
    public static PanelState Evaluate(Facts facts)
    {
        var approvals = facts.Reviews
            .Where(r => r.Decision == SubmissionDecision.Approved)
            .OrderByDescending(r => r.DecidedAt)
            .ToList();

        var seated = new HashSet<Guid>();
        var seats = new List<SeatState>();

        var supervisorApproval = approvals.FirstOrDefault(r =>
            r.Seat == ReviewSeat.Supervisor && (r.ReviewerId == facts.SupervisorId || r.ReviewerIsAdmin));
        seats.Add(new SeatState(ReviewSeat.Supervisor, facts.SupervisorId, supervisorApproval is not null, supervisorApproval?.Mark));
        if (facts.SupervisorId is { } supervisorId)
        {
            seated.Add(supervisorId);
        }

        if (facts.DirectionManagerId is { } managerId && seated.Add(managerId))
        {
            var approval = approvals.FirstOrDefault(r => r.Seat == ReviewSeat.DirectionManager && r.ReviewerId == managerId);
            seats.Add(new SeatState(ReviewSeat.DirectionManager, managerId, approval is not null, approval?.Mark));
        }

        foreach (var extra in facts.Extras.OrderBy(e => e.AddedAt))
        {
            if (!seated.Add(extra.ReviewerId))
            {
                continue;
            }

            var approval = approvals.FirstOrDefault(r =>
                r.Seat == ReviewSeat.Extra && r.ReviewerId == extra.ReviewerId && r.DecidedAt >= extra.AddedAt);
            seats.Add(new SeatState(ReviewSeat.Extra, extra.ReviewerId, approval is not null, approval?.Mark));
        }

        if (facts.StandardsControl is { } control && seated.Add(control.ControllerId))
        {
            var approval = approvals.FirstOrDefault(r =>
                r.Seat == ReviewSeat.StandardsControl && r.ReviewerId == control.ControllerId && r.DecidedAt >= control.AssignedAt);
            seats.Add(new SeatState(ReviewSeat.StandardsControl, control.ControllerId, approval is not null, null));
        }

        return new PanelState(seats);
    }

    /// The seat the caller's decision fills, or null when they have none. Their own seat wins, but
    /// only while they act in the role that seat belongs to (design 2026-09-27, phase 12, §5): one
    /// person still holds one seat on a step, and that seat decides the role they decide in. An
    /// administrator with no seat of their own stands in for the supervisor by default
    /// (`allowAdminStandIn: true`) - that power drives `canDecide` and the decision form. "Your
    /// decision" (`isMyDecision`) passes `allowAdminStandIn: false`, so it counts only a seat the
    /// caller actually holds.
    public static ReviewSeat? SeatFor(UserContext user, PanelState panel, bool allowAdminStandIn = true)
    {
        var own = panel.Seats.FirstOrDefault(s => s.ReviewerId == user.UserId);
        if (own is not null)
        {
            return ActsFor(user, own.Seat) ? own.Seat : null;
        }

        return allowAdminStandIn && user.IsAdmin ? ReviewSeat.Supervisor : null;
    }

    /// Whether the caller's acting role is the one a seat is decided in: the supervisor and extra
    /// seats are a teacher's (an administrator may sit as an extra reviewer too), the direction
    /// manager's and the standards control seats their own roles'.
    public static bool ActsFor(UserContext user, ReviewSeat seat) => seat switch
    {
        ReviewSeat.Supervisor or ReviewSeat.Extra => user.IsTeacher || user.IsAdmin,
        ReviewSeat.DirectionManager => user.IsDirectionManager,
        ReviewSeat.StandardsControl => user.IsStandardsController,
        _ => false
    };

    public static bool IsSeatSatisfied(PanelState panel, ReviewSeat seat, Guid userId) =>
        seat == ReviewSeat.Supervisor
            ? panel.Seats[0].IsSatisfied
            : panel.Seats.Any(s => s.Seat == seat && s.ReviewerId == userId && s.IsSatisfied);
}
