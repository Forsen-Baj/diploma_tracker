using DiplomaTracker.Api.Data;
using DiplomaTracker.Api.DTOs.Departments;
using DiplomaTracker.Api.Entities;
using DiplomaTracker.Api.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace DiplomaTracker.Api.Services;

public class DepartmentService : IDepartmentService
{
    private readonly AppDbContext _dbContext;

    public DepartmentService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<DepartmentResponse>?> GetDepartmentsAsync(Guid? facultyId)
    {
        if (facultyId.HasValue && !await _dbContext.Faculties.AnyAsync(f => f.Id == facultyId.Value))
        {
            return null;
        }

        var query = _dbContext.Departments.AsNoTracking().Include(d => d.Faculty).AsQueryable();
        if (facultyId.HasValue)
        {
            query = query.Where(d => d.FacultyId == facultyId.Value);
        }

        var departments = await query
            .OrderBy(d => d.Faculty.Name)
            .ThenBy(d => d.Name)
            .ToListAsync();

        return departments.Select(MapDepartment).ToList();
    }

    public async Task<DepartmentResponse?> GetDepartmentByIdAsync(Guid id)
    {
        var department = await _dbContext.Departments
            .AsNoTracking()
            .Include(d => d.Faculty)
            .FirstOrDefaultAsync(d => d.Id == id);

        return department is null ? null : MapDepartment(department);
    }

    public async Task<(DepartmentResponse? department, string? error)> CreateDepartmentAsync(CreateDepartmentRequest request)
    {
        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
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
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        return (MapDepartment(department), null);
    }

    public async Task<(DepartmentResponse? department, string? error)> UpdateDepartmentAsync(Guid id, UpdateDepartmentRequest request)
    {
        var department = await _dbContext.Departments.FirstOrDefaultAsync(d => d.Id == id);
        if (department is null)
        {
            return (null, AcademicStructureErrors.DepartmentNotFound);
        }

        var faculty = await _dbContext.Faculties.FirstOrDefaultAsync(f => f.Id == request.FacultyId);
        if (faculty is null)
        {
            return (null, AcademicStructureErrors.FacultyNotFound);
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
            return (null, AcademicStructureErrors.FacultyNotFound);
        }

        return (MapDepartment(department), null);
    }

    public async Task<(bool success, string? error)> DeleteDepartmentAsync(Guid id)
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
