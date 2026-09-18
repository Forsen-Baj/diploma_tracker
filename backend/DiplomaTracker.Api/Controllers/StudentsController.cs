using System.Security.Claims;
using DiplomaTracker.Api.DTOs.Students;
using DiplomaTracker.Api.DTOs.Topics;
using DiplomaTracker.Api.Errors;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class StudentsController : ApiControllerBase
{
    private readonly IStudentService _studentService;
    private readonly IReservationService _reservationService;

    public StudentsController(IStudentService studentService, IReservationService reservationService)
    {
        _studentService = studentService;
        _reservationService = reservationService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool archived = false)
    {
        return Ok(await _studentService.GetStudentsAsync(archived));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var student = await _studentService.GetStudentByIdAsync(id);
        return student is null ? ErrorResult(OnboardingErrors.StudentNotFound) : Ok(student);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStudentRequest request)
    {
        var (student, error) = await _studentService.CreateStudentAsync(request);
        return student is null
            ? ErrorResult(error)
            : CreatedAtAction(nameof(GetById), new { id = student.Id }, student);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateStudentRequest request)
    {
        var (student, error) = await _studentService.UpdateStudentAsync(id, request);
        return student is null ? ErrorResult(error) : Ok(student);
    }

    [HttpPost("archive")]
    public async Task<IActionResult> Archive([FromBody] ArchiveStudentsRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (archived, error) = await _studentService.ArchiveStudentsAsync(request.StudentIds, administratorId);
        return error is null ? Ok(new ArchiveResultResponse { Archived = archived }) : ErrorResult(error);
    }

    [HttpPost("restore")]
    public async Task<IActionResult> Restore([FromBody] RestoreStudentsRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (restored, error) = await _studentService.RestoreStudentsAsync(request.StudentIds, administratorId);
        return error is null ? Ok(new RestoreResultResponse { Restored = restored }) : ErrorResult(error);
    }

    [HttpPost("{id:guid}/reset-access")]
    public async Task<IActionResult> ResetAccess(Guid id)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (success, error) = await _studentService.ResetAccessAsync(id, administratorId);
        return success ? NoContent() : ErrorResult(error);
    }

    [HttpPut("{id:guid}/group")]
    public async Task<IActionResult> AssignGroup(Guid id, [FromBody] AssignStudentGroupRequest request)
    {
        var (student, error) = await _studentService.AssignGroupAsync(id, request.GroupId);
        return student is null ? ErrorResult(error) : Ok(student);
    }

    [HttpPut("{id:guid}/supervisor")]
    public async Task<IActionResult> AssignSupervisor(Guid id, [FromBody] AssignStudentSupervisorRequest request)
    {
        var (student, error) = await _studentService.AssignSupervisorAsync(id, request.SupervisorId);
        return student is null ? ErrorResult(error) : Ok(student);
    }

    [HttpPut("{id:guid}/topic")]
    public async Task<IActionResult> SetTopic(Guid id, [FromBody] SetStudentTopicRequest request)
    {
        if (!TryGetUserId(out var administratorId))
        {
            return ErrorResult(CommonErrors.Forbidden);
        }

        var (reservation, error) = await _reservationService.SetStudentTopicAsync(id, request.TopicId, administratorId);
        if (error is not null)
        {
            return ErrorResult(error);
        }

        // Clearing a student's topic settles the old reservation and creates no new one.
        return reservation is null ? NoContent() : Ok(reservation);
    }

    private bool TryGetUserId(out Guid userId)
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(userIdValue, out userId);
    }
}
