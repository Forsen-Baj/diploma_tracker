using DiplomaTracker.Api.Entities;

namespace DiplomaTracker.Api.Services;

/// Design 2026-09-27 §5.2. A topic request has three seats, worked out when it is read and never
/// stored: any administrator, the current manager of the topic's direction, and the topic's current
/// supervisor. A seat is satisfied by an Approved or Edited decision from the right person given
/// no earlier than the request's last wording change. One person's approval fills every seat they
/// hold. Pure: callers load the facts, this decides, so every reader agrees.
public static class TopicApprovalPanel
{
    public enum Seat
    {
        Administration,
        Direction,
        Supervision
    }

    public sealed record DecisionFact(Guid DeciderId, bool DeciderWasAdministrator, ReservationDecisionKind Kind, DateTime DecidedAt);

    /// HolderId is null for the administration seat, which any administrator fills.
    public sealed record SeatState(Seat Seat, Guid? HolderId, bool IsSatisfied, Guid? ApprovedById, DateTime? ApprovedAt);

    public sealed record State(IReadOnlyList<SeatState> Seats)
    {
        public bool IsComplete => Seats.All(s => s.IsSatisfied);

        public int Satisfied => Seats.Count(s => s.IsSatisfied);
    }

    public static State Evaluate(Guid supervisorId, Guid directionManagerId, DateTime contentChangedAt, IReadOnlyList<DecisionFact> decisions)
    {
        var approvals = decisions
            .Where(d => (d.Kind == ReservationDecisionKind.Approved || d.Kind == ReservationDecisionKind.Edited)
                && d.DecidedAt >= contentChangedAt)
            .OrderByDescending(d => d.DecidedAt)
            .ToList();

        var administration = approvals.FirstOrDefault(d => d.DeciderWasAdministrator);
        var direction = approvals.FirstOrDefault(d => d.DeciderId == directionManagerId);
        var supervision = approvals.FirstOrDefault(d => d.DeciderId == supervisorId);

        return new State(
        [
            new SeatState(Seat.Administration, null, administration is not null, administration?.DeciderId, administration?.DecidedAt),
            new SeatState(Seat.Direction, directionManagerId, direction is not null, direction?.DeciderId, direction?.DecidedAt),
            new SeatState(Seat.Supervision, supervisorId, supervision is not null, supervision?.DeciderId, supervision?.DecidedAt)
        ]);
    }

    /// The seats a caller holds on a request (§5.3). Administrators hold the administration seat
    /// only; supervisors and direction managers are always teachers.
    public static IReadOnlyList<Seat> SeatsOf(UserContext user, Guid supervisorId, Guid directionManagerId)
    {
        var seats = new List<Seat>(3);
        if (user.IsAdmin)
        {
            seats.Add(Seat.Administration);
        }

        if (user.IsTeacher && directionManagerId == user.UserId)
        {
            seats.Add(Seat.Direction);
        }

        if (user.IsTeacher && supervisorId == user.UserId)
        {
            seats.Add(Seat.Supervision);
        }

        return seats;
    }

    public static bool HasOpenSeat(State state, IReadOnlyList<Seat> seats) =>
        seats.Any(seat => !state.Seats.Single(s => s.Seat == seat).IsSatisfied);
}
