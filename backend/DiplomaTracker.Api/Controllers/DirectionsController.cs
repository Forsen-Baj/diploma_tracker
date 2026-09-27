using DiplomaTracker.Api.DTOs.Directions;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[Route("api/directions")]
[Authorize]
public class DirectionsController : ApiControllerBase
{
    private readonly IDirectionService _directions;

    public DirectionsController(IDirectionService directions)
    {
        _directions = directions;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DirectionQuery query)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (directions, error) = await _directions.GetDirectionsAsync(user, query);
        return directions is null ? ErrorResult(error) : Ok(directions);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.GetDirectionAsync(user, id);
        return direction is null ? ErrorResult(error) : Ok(direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDirectionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.CreateDirectionAsync(user, request);
        return direction is null ? ErrorResult(error) : CreatedAtAction(nameof(GetById), new { id = direction.Id }, direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateDirectionRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (direction, error) = await _directions.UpdateDirectionAsync(user, id, request);
        return direction is null ? ErrorResult(error) : Ok(direction);
    }

    [Authorize(Roles = "Admin,Teacher")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _directions.DeleteDirectionAsync(user, id);
        return success ? NoContent() : ErrorResult(error);
    }
}
