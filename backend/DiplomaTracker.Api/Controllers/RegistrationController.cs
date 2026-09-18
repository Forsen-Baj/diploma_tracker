using DiplomaTracker.Api.DTOs.Registration;
using DiplomaTracker.Api.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DiplomaTracker.Api.Controllers;

[ApiController]
[Route("api/registration")]
public class RegistrationController : ApiControllerBase
{
    private readonly IRegistrationService _registrationService;

    public RegistrationController(IRegistrationService registrationService)
    {
        _registrationService = registrationService;
    }

    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(new RegistrationStatusResponse { Open = await _registrationService.IsOpenAsync() });
    }

    [Authorize(Roles = "Admin")]
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateRegistrationStatusRequest request)
    {
        await _registrationService.SetOpenAsync(request.Open!.Value);
        return NoContent();
    }
}
