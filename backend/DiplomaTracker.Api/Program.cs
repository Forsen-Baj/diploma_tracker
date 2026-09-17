using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.RateLimiting;
using DiplomaTracker.Api.Configuration;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.Interfaces;
using DiplomaTracker.Api.Models;
using DiplomaTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

const string CorsPolicyName = "FrontendPolicy";

static string GetRateLimitPartitionKey(HttpContext httpContext)
{
    var address = httpContext.Connection.RemoteIpAddress;
    if (address is null)
    {
        return "no-ip";
    }

    if (address.IsIPv4MappedToIPv6)
    {
        address = address.MapToIPv4();
    }

    if (address.AddressFamily == AddressFamily.InterNetworkV6)
    {
        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        address = new IPAddress(bytes);
    }

    return address.ToString();
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<CorsSettings>(builder.Configuration.GetSection("Cors"));
builder.Services.Configure<BootstrapSettings>(builder.Configuration.GetSection("Bootstrap"));

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IPasswordHasher, PasswordHasher>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITeacherService, TeacherService>();
builder.Services.AddScoped<IStudentService, StudentService>();
builder.Services.AddScoped<IGroupService, GroupService>();
builder.Services.AddScoped<ITaskTemplateService, TaskTemplateService>();
builder.Services.AddScoped<IGroupTaskService, GroupTaskService>();
builder.Services.AddScoped<IFacultyService, FacultyService>();
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
builder.Services.AddScoped<IRegistrationService, RegistrationService>();
builder.Services.AddScoped<IStudentImportService, StudentImportService>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(RateLimitPolicies.Authentication, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            GetRateLimitPartitionKey(httpContext),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = RateLimitPolicies.AuthenticationPermitLimit,
                Window = RateLimitPolicies.AuthenticationWindow,
                QueueLimit = 0
            }));

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(
            new { message = OnboardingErrors.TooManyAttempts },
            cancellationToken);
    };
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "DiplomaTracker.Api", Version = "v1" });
    var securityScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Description = "Enter JWT Bearer token",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference
        {
            Type = ReferenceType.SecurityScheme,
            Id = JwtBearerDefaults.AuthenticationScheme
        }
    };
    options.AddSecurityDefinition(securityScheme.Reference.Id, securityScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { securityScheme, Array.Empty<string>() }
    });
});

builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>()
    .Configure<IOptions<CorsSettings>>((options, corsSettings) =>
        options.AddPolicy(CorsPolicyName, policy => policy
            .WithOrigins(corsSettings.Value.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtSettings>>((options, jwtSettings) =>
    {
        var jwt = jwtSettings.Value;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

StartupValidation.ValidateJwtSettings(app.Services.GetRequiredService<IOptions<JwtSettings>>().Value);
StartupValidation.ValidateCorsSettings(app.Services.GetRequiredService<IOptions<CorsSettings>>().Value);

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

    await dbContext.Database.MigrateAsync();

    if (app.Environment.IsDevelopment())
    {
        await DbSeeder.SeedAsync(dbContext, passwordHasher);
    }
    else
    {
        var bootstrapSettings = scope.ServiceProvider.GetRequiredService<IOptions<BootstrapSettings>>().Value;
        await AdminBootstrapper.EnsureAdminAsync(dbContext, passwordHasher, bootstrapSettings, DateTime.UtcNow);
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors(CorsPolicyName);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
