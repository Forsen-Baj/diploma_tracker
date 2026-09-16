import { useCallback, useEffect, useState } from 'react'
import { isApiConflict } from '../api/apiClient'
import { createDepartment, deleteDepartment, getDepartments, updateDepartment } from '../api/departmentsApi'
import { createFaculty, deleteFaculty, getFaculties, updateFaculty } from '../api/facultiesApi'
import type { Department, Faculty } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type NameForm = {
  name: string
  shortName: string
}

const emptyForm: NameForm = { name: '', shortName: '' }

export function FacultiesPage() {
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedFacultyId, setSelectedFacultyId] = useState('')
  const [facultyForm, setFacultyForm] = useState<NameForm>(emptyForm)
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null)
  const [departmentForm, setDepartmentForm] = useState<NameForm>(emptyForm)
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  const selectedFaculty = faculties.find((faculty) => faculty.id === selectedFacultyId) ?? null

  const reportError = (err: unknown) => {
    if (isApiConflict(err)) {
      setModalMessage(err.message)
    } else {
      setError((err as Error).message)
    }
  }

  const loadFaculties = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await getFaculties()
      setFaculties(data)
      setSelectedFacultyId((current) => (data.some((faculty) => faculty.id === current) ? current : (data[0]?.id ?? '')))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadDepartments = useCallback(async (facultyId: string) => {
    if (!facultyId) {
      setDepartments([])
      return
    }

    try {
      setDepartments(await getDepartments(facultyId))
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void loadFaculties()
  }, [loadFaculties])

  useEffect(() => {
    setEditingDepartmentId(null)
    setDepartmentForm(emptyForm)
    void loadDepartments(selectedFacultyId)
  }, [loadDepartments, selectedFacultyId])

  const submitFaculty = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    try {
      if (editingFacultyId) {
        await updateFaculty(editingFacultyId, facultyForm)
      } else {
        await createFaculty(facultyForm)
      }
      setEditingFacultyId(null)
      setFacultyForm(emptyForm)
      await loadFaculties()
    } catch (err) {
      reportError(err)
    } finally {
      setIsSaving(false)
    }
  }

  const startFacultyEdit = (faculty: Faculty) => {
    setEditingFacultyId(faculty.id)
    setFacultyForm({ name: faculty.name, shortName: faculty.shortName })
  }

  const cancelFacultyEdit = () => {
    setEditingFacultyId(null)
    setFacultyForm(emptyForm)
  }

  const removeFaculty = async (faculty: Faculty) => {
    if (!window.confirm(`Delete ${faculty.name}?`)) {
      return
    }

    setError('')
    try {
      await deleteFaculty(faculty.id)
      await loadFaculties()
    } catch (err) {
      reportError(err)
    }
  }

  const submitDepartment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFacultyId) {
      return
    }

    setIsSaving(true)
    setError('')
    const request = { facultyId: selectedFacultyId, ...departmentForm }
    try {
      if (editingDepartmentId) {
        await updateDepartment(editingDepartmentId, request)
      } else {
        await createDepartment(request)
      }
      setEditingDepartmentId(null)
      setDepartmentForm(emptyForm)
      await loadDepartments(selectedFacultyId)
    } catch (err) {
      reportError(err)
    } finally {
      setIsSaving(false)
    }
  }

  const startDepartmentEdit = (department: Department) => {
    setEditingDepartmentId(department.id)
    setDepartmentForm({ name: department.name, shortName: department.shortName })
  }

  const cancelDepartmentEdit = () => {
    setEditingDepartmentId(null)
    setDepartmentForm(emptyForm)
  }

  const removeDepartment = async (department: Department) => {
    if (!window.confirm(`Delete ${department.name}?`)) {
      return
    }

    setError('')
    try {
      await deleteDepartment(department.id)
      await loadDepartments(selectedFacultyId)
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div className="faculties-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}
      {error && <p className="error-text">{error}</p>}

      <div className="faculties-layout">
        <section className="page-card">
          <h1>Faculties</h1>
          <form className="group-form" onSubmit={submitFaculty}>
            <div className="group-form-grid">
              <input className="field-input" placeholder="Faculty name" value={facultyForm.name} onChange={(e) => setFacultyForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <input className="field-input" placeholder="Short name" value={facultyForm.shortName} onChange={(e) => setFacultyForm((prev) => ({ ...prev, shortName: e.target.value }))} required />
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSaving}>{editingFacultyId ? 'Save Faculty' : 'Add Faculty'}</button>
              {editingFacultyId && <button className="secondary-button" type="button" onClick={cancelFacultyEdit} disabled={isSaving}>Cancel</button>}
            </div>
          </form>

          {isLoading && <p>Loading faculties...</p>}
          {!isLoading && faculties.length === 0 && <p>No faculties yet.</p>}
          <div className="card-stack">
            {faculties.map((faculty) => (
              <article
                key={faculty.id}
                className={faculty.id === selectedFacultyId ? 'entity-card card-selectable entity-card-selected' : 'entity-card card-selectable'}
                onClick={() => setSelectedFacultyId(faculty.id)}
              >
                <h3>{faculty.shortName}</h3>
                <p>{faculty.name}</p>
                <div className="actions-row">
                  <button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); startFacultyEdit(faculty) }}>Edit</button>
                  <button className="secondary-button" type="button" onClick={(e) => { e.stopPropagation(); void removeFaculty(faculty) }}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="page-card">
          <h2>{selectedFaculty ? `Departments of ${selectedFaculty.shortName}` : 'Departments'}</h2>
          {!selectedFaculty && <p>Select or create a faculty to manage its departments.</p>}
          {selectedFaculty && (
            <>
              <form className="group-form" onSubmit={submitDepartment}>
                <div className="group-form-grid">
                  <input className="field-input" placeholder="Department name" value={departmentForm.name} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, name: e.target.value }))} required />
                  <input className="field-input" placeholder="Short name" value={departmentForm.shortName} onChange={(e) => setDepartmentForm((prev) => ({ ...prev, shortName: e.target.value }))} required />
                </div>
                <div className="actions-row">
                  <button className="primary-button" type="submit" disabled={isSaving}>{editingDepartmentId ? 'Save Department' : 'Add Department'}</button>
                  {editingDepartmentId && <button className="secondary-button" type="button" onClick={cancelDepartmentEdit} disabled={isSaving}>Cancel</button>}
                </div>
              </form>

              {departments.length === 0 && <p>No departments in this faculty yet.</p>}
              <div className="card-stack">
                {departments.map((department) => (
                  <article key={department.id} className="entity-card">
                    <h3>{department.shortName}</h3>
                    <p>{department.name}</p>
                    <div className="actions-row">
                      <button className="secondary-button" type="button" onClick={() => startDepartmentEdit(department)}>Edit</button>
                      <button className="secondary-button" type="button" onClick={() => void removeDepartment(department)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
