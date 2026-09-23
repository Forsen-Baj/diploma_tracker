using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Faculties;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class FacultyService : IFacultyService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<FacultyService> _logger;

    public FacultyService(AppDbContext dbContext, ILogger<FacultyService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<IReadOnlyList<FacultyResponse>> GetFacultiesAsync()
    {
        var faculties = await _dbContext.Faculties
            .AsNoTracking()
            .OrderBy(f => f.Name)
            .ToListAsync();

        return faculties.Select(MapFaculty).ToList();
    }

    public async Task<FacultyResponse?> GetFacultyByIdAsync(Guid id)
    {
        var faculty = await _dbContext.Faculties.AsNoTracking().FirstOrDefaultAsync(f => f.Id == id);
        return faculty is null ? null : MapFaculty(faculty);
    }

    public async Task<(FacultyResponse? faculty, string? error)> CreateFacultyAsync(CreateFacultyRequest request, Guid administratorId)
    {
        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(null, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        var now = DateTime.UtcNow;
        var faculty = new Faculty
        {
            Id = Guid.NewGuid(),
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Faculties.Add(faculty);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, await FindConflictAsync(null, name, shortName) ?? AcademicStructureErrors.FacultyNameTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Faculty", faculty.Id);
        return (MapFaculty(faculty), null);
    }

    public async Task<(FacultyResponse? faculty, string? error)> UpdateFacultyAsync(Guid id, UpdateFacultyRequest request, Guid administratorId)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == id);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        faculty.Name = name;
        faculty.ShortName = shortName;
        faculty.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, await FindConflictAsync(id, name, shortName) ?? AcademicStructureErrors.FacultyNameTaken);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Faculty", faculty.Id);
        return (MapFaculty(faculty), null);
    }

    public async Task<(bool success, string? error)> DeleteFacultyAsync(Guid id, Guid administratorId)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == id);
        if (faculty is null)
        {
            return (false, AcademicStructureErrors.FacultyNotFound);
        }

        if (await _dbContext.Departments.AnyAsync(d => d.FacultyId == id))
        {
            return (false, AcademicStructureErrors.FacultyHasDepartments);
        }

        if (await _dbContext.DiplomaTaskTemplates.AnyAsync(t => t.FacultyId == id))
        {
            return (false, AcademicStructureErrors.FacultyHasTaskTemplates);
        }

        _dbContext.Faculties.Remove(faculty);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            var hasDepartments = await _dbContext.Departments.AnyAsync(d => d.FacultyId == id);
            return (false, hasDepartments ? AcademicStructureErrors.FacultyHasDepartments : AcademicStructureErrors.FacultyHasTaskTemplates);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Deleted", "Faculty", id);
        return (true, null);
    }

    private async Task<string?> FindConflictAsync(Guid? excludedId, string name, string shortName)
    {
        if (await _dbContext.Faculties.AsNoTracking().AnyAsync(f => f.Id != excludedId && f.Name == name))
        {
            return AcademicStructureErrors.FacultyNameTaken;
        }

        if (await _dbContext.Faculties.AsNoTracking().AnyAsync(f => f.Id != excludedId && f.ShortName == shortName))
        {
            return AcademicStructureErrors.FacultyShortNameTaken;
        }

        return null;
    }

    private static FacultyResponse MapFaculty(Faculty faculty) => new()
    {
        Id = faculty.Id,
        Name = faculty.Name,
        ShortName = faculty.ShortName,
        CreatedAt = faculty.CreatedAt,
        UpdatedAt = faculty.UpdatedAt
    };
}
