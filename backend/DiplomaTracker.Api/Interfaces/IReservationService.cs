using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Services;

namespace DiplomaTracker.Api.Interfaces;

public interface IReservationService
{
    Task<(ReservationResponse? reservation, string? error)> ReserveAsync(UserContext user, Guid topicId);
    Task<(ReservationResponse? reservation, string? error)> ProposeAsync(UserContext user, ProposeTopicRequest request);
    Task<(ReservationResponse? reservation, string? error)> ApproveAsync(UserContext user, Guid reservationId);
    Task<(ReservationResponse? reservation, string? error)> RejectAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> CancelAsync(UserContext user, Guid reservationId);
    Task<(ReservationResponse? reservation, string? error)> ReleaseAsync(UserContext user, Guid reservationId, DecisionRequest request);
    Task<(ReservationResponse? reservation, string? error)> SetStudentTopicAsync(Guid studentId, Guid? topicId, Guid administratorId);
    Task<(IReadOnlyList<ReservationResponse>? reservations, string? error)> GetMineAsync(UserContext user);
    Task<IReadOnlyList<ReservationResponse>> GetForDecisionAsync(UserContext user, ReservationStatus status);
    Task SettleReservationsForArchiveAsync(Guid studentProfileId, DateTime now);
}
