using System.Linq.Expressions;
using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace DiplomaTracker.Api.Services;

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<DepartmentService> _logger;

    public DepartmentService(AppDbContext dbContext, ILogger<DepartmentService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    /// Phase 8 §8: the API returns exactly the columns it sends. This used to materialise a
    /// Department with its Faculty and map afterwards.
    private static readonly Expression<Func<Department, DepartmentResponse>> DepartmentProjection = d => new DepartmentResponse
    {
        Id = d.Id,
        FacultyId = d.FacultyId,
        FacultyName = d.Faculty.Name,
        Name = d.Name,
        ShortName = d.ShortName,
        CreatedAt = d.CreatedAt,
        UpdatedAt = d.UpdatedAt
    };

    public async Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId)
    {
        if (facultyId.HasValue && !await _dbContext.Faculties.AnyAsync(f => f.Id == facultyId.Value))
        {
            return null;
        }

        var query = _dbContext.Departments.AsNoTracking().AsQueryable();
        if (facultyId.HasValue)
        {
            query = query.Where(d => d.FacultyId == facultyId.Value);
        }

        return await query
            .OrderBy(d => d.Faculty.Name)
            .ThenBy(d => d.Name)
            .Select(DepartmentProjection)
            .ToListAsync();
    }

    public async Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id)
    {
        return await _dbContext.Departments
            .AsNoTracking()
            .Where(d => d.Id == id)
            .Select(DepartmentProjection)
            .FirstOrDefaultAsync();
    }

    public async Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request, Guid administratorId)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.DepartmentFacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(null, faculty.Id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        var now = DateTime.UtcNow;
        var department = new Department
        {
            Id = Guid.NewGuid(),
            FacultyId = faculty.Id,
            Faculty = faculty,
            Name = name,
            ShortName = shortName,
            CreatedAt = now,
            UpdatedAt = now
        };

        _dbContext.Departments.Add(department);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, await FindConflictAsync(null, faculty.Id, name, shortName) ?? AcademicStructureErrors.DepartmentNameTaken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, AcademicStructureErrors.DepartmentFacultyNotFound);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Created", "Department", department.Id);
        return (MapDepartment(department), null);
    }

    public async Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request, Guid administratorId)
    {
        var department = await _dbContext.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department is null)
        {
            return (null, AcademicStructureErrors.DepartmentNotFound);
        }

        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.DepartmentFacultyNotFound);
        }

        var name = request.Name.Trim();
        var shortName = request.ShortName.Trim();

        var conflict = await FindConflictAsync(id, faculty.Id, name, shortName);
        if (conflict is not null)
        {
            return (null, conflict);
        }

        department.FacultyId = faculty.Id;
        department.Faculty = faculty;
        department.Name = name;
        department.ShortName = shortName;
        department.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, await FindConflictAsync(id, faculty.Id, name, shortName) ?? AcademicStructureErrors.DepartmentNameTaken);
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (null, AcademicStructureErrors.DepartmentFacultyNotFound);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Updated", "Department", department.Id);
        return (MapDepartment(department), null);
    }

    public async Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id, Guid administratorId)
    {
        var department = await _dbContext.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department is null)
        {
            return (false, AcademicStructureErrors.DepartmentNotFound);
        }

        if (await _dbContext.Groups.AnyAsync(g => g.DepartmentId == id))
        {
            return (false, AcademicStructureErrors.DepartmentHasGroups);
        }

        _dbContext.Departments.Remove(department);

        try
        {
            await _dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsForeignKeyViolation())
        {
            _dbContext.ChangeTracker.Clear();
            return (false, AcademicStructureErrors.DepartmentHasGroups);
        }

        SecurityLog.AdministratorAction(_logger, administratorId, "Deleted", "Department", id);
        return (true, null);
    }

    private async Task<string?> FindConflictAsync(Guid? excludedId, Guid facultyId, string name, string shortName)
    {
        if (await _dbContext.Departments.AnyAsync(d => d.Id != excludedId && d.FacultyId == facultyId && d.Name == name))
        {
            return AcademicStructureErrors.DepartmentNameTaken;
        }

        if (await _dbContext.Departments.AnyAsync(d => d.Id != excludedId && d.FacultyId == facultyId && d.ShortName == shortName))
        {
            return AcademicStructureErrors.DepartmentShortNameTaken;
        }

        return null;
    }

    private static DepartmentResponse MapDepartment(Department department) => new()
    {
        Id = department.Id,
        FacultyId = department.FacultyId,
        FacultyName = department.Faculty.Name,
        Name = department.Name,
        ShortName = department.ShortName,
        CreatedAt = department.CreatedAt,
        UpdatedAt = department.UpdatedAt
    };
}
