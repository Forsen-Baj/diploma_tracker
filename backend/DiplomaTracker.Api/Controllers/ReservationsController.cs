using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/reservations")]
[Authorize]
public class ReservationsController : ApiControllerBase
{
    private readonly IReservationService _reservationService;

    public ReservationsController(IReservationService reservationService)
    {
        _reservationService = reservationService;
    }

    [Authorize(Roles = "Student")]
    [HttpPost("/api/topics/{topicId:guid}/reserve")]
    public Task<IActionResult> Reserve(Guid topicId) =>
        Run(user => _reservationService.ReserveAsync(user, topicId));

    [Authorize(Roles = "Student")]
    [HttpPost("/api/topics/proposals")]
    public Task<IActionResult> Propose([FromBody] ProposeTopicRequest request) =>
        Run(user => _reservationService.ProposeAsync(user, request));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/approve")]
    public Task<IActionResult> Approve(Guid id) =>
        Run(user => _reservationService.ApproveAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id, [FromBody] DecisionRequest? request) =>
        Run(user => _reservationService.RejectAsync(user, id, request ?? new DecisionRequest()));

    [Authorize(Roles = "Student")]
    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid id) =>
        Run(user => _reservationService.CancelAsync(user, id));

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost("{id:guid}/release")]
    public Task<IActionResult> Release(Guid id, [FromBody] DecisionRequest? request) =>
        Run(user => _reservationService.ReleaseAsync(user, id, request ?? new DecisionRequest()));

    [Authorize(Roles = "Student")]
    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reservations, error) = await _reservationService.GetMineAsync(user);
        return reservations is null ? ErrorResult(error) : Ok(reservations);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpGet("pending")]
    public async Task<IActionResult> ForDecision([FromQuery] ReservationStatus status = ReservationStatus.Pending)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        return Ok(await _reservationService.GetForDecisionAsync(user, status));
    }

    private async Task<IActionResult> Run(Func<Services.UserContext, Task<(ReservationResponse? reservation, string? error)>> action)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reservation, error) = await action(user);
        return reservation is null ? ErrorResult(error) : Ok(reservation);
    }
}
