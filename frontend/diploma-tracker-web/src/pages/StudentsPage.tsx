import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { getGroups } from '../api/groupsApi'
import { getRegistrationStatus, setRegistrationStatus } from '../api/registrationApi'
import { createStudent, deactivateStudent, getStudents, importStudents, resetStudentAccess, updateStudent } from '../api/studentsApi'
import { getTeachers } from '../api/teachersApi'
import type { Group, ImportRowError, Student, StudentImportResult, Teacher } from '../api/types'
import { PASSWORD_POLICY_MESSAGE, isPasswordLengthValid } from '../auth/passwordPolicy'
import { ErrorModal } from '../components/ErrorModal'
import { optional } from '../utils/optional'

type SupervisorOption = {
  id: string
  label: string
}

type StudentFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  studentNumber: string
  password: string
  diplomaTopic: string
  groupId: string
  supervisorId: string
}

const emptyForm: StudentFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  studentNumber: '',
  password: '',
  diplomaTopic: '',
  groupId: '',
  supervisorId: ''
}

const CSV_TEMPLATE = '\uFEFFlastName;firstName;patronymic;email;studentNumber\r\n'
const IMPORT_FILE_MAX_BYTES = 1_048_576
const IMPORT_FILE_TOO_LARGE_MESSAGE = 'The file is larger than 1 MB.'

function readRowErrors(error: unknown): ImportRowError[] {
  if (!(error instanceof ApiError)) {
    return []
  }

  const payload = error.payload as { errors?: unknown } | null
  return Array.isArray(payload?.errors) ? payload.errors as ImportRowError[] : []
}

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'students-template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const [importGroupId, setImportGroupId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<StudentImportResult | null>(null)
  const [importErrors, setImportErrors] = useState<ImportRowError[]>([])
  const [importMessage, setImportMessage] = useState('')

  const [createForm, setCreateForm] = useState<StudentFormState>(emptyForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<StudentFormState>(emptyForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [busyStudentId, setBusyStudentId] = useState<string | null>(null)

  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [students])
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])
  const activeSupervisorOptions = useMemo<SupervisorOption[]>(
    () => activeTeachers.map((teacher) => ({ id: teacher.id, label: `${teacher.lastName} ${teacher.firstName}` })),
    [activeTeachers]
  )
  const editingStudent = useMemo(() => students.find((student) => student.id === editingStudentId) ?? null, [students, editingStudentId])
  const editSupervisorOptions = useMemo<SupervisorOption[]>(() => {
    if (!editingStudent?.supervisorId || activeTeachers.some((teacher) => teacher.id === editingStudent.supervisorId)) {
      return activeSupervisorOptions
    }

    return [
      ...activeSupervisorOptions,
      {
        id: editingStudent.supervisorId,
        label: `${editingStudent.supervisorLastName ?? ''} ${editingStudent.supervisorFirstName ?? ''} (inactive)`.trim()
      }
    ]
  }, [activeSupervisorOptions, activeTeachers, editingStudent])

  const loadData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [studentsData, teachersData, groupsData, registration] = await Promise.all([getStudents(), getTeachers(), getGroups(), getRegistrationStatus()])
      setStudents(studentsData)
      setTeachers(teachersData)
      setGroups(groupsData)
      setRegistrationOpen(registration.open)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const toggleRegistration = async () => {
    setIsTogglingRegistration(true)
    try {
      await setRegistrationStatus(!registrationOpen)
      setRegistrationOpen(!registrationOpen)
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!importGroupId || !importFile) {
      return
    }

    setImportResult(null)
    setImportErrors([])
    setImportMessage('')

    if (importFile.size > IMPORT_FILE_MAX_BYTES) {
      setImportMessage(IMPORT_FILE_TOO_LARGE_MESSAGE)
      return
    }

    setIsImporting(true)
    try {
      const result = await importStudents(importGroupId, importFile)
      setImportResult(result)
      setImportFile(null)
      setImportInputKey((key) => key + 1)
      await loadData()
    } catch (err) {
      const message = err instanceof ApiError && err.status === 413 ? IMPORT_FILE_TOO_LARGE_MESSAGE : (err as Error).message
      setImportMessage(message)
      setImportErrors(readRowErrors(err))
    } finally {
      setIsImporting(false)
    }
  }

  const toRequest = (form: StudentFormState) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    patronymic: optional(form.patronymic),
    email: form.email.trim(),
    studentNumber: form.studentNumber.trim(),
    diplomaTopic: optional(form.diplomaTopic),
    groupId: form.groupId,
    supervisorId: optional(form.supervisorId)
  })

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (createForm.password.length > 0 && !isPasswordLengthValid(createForm.password)) {
      setModalMessage(PASSWORD_POLICY_MESSAGE)
      return
    }

    setIsCreating(true)
    try {
      await createStudent({ ...toRequest(createForm), password: createForm.password.length === 0 ? undefined : createForm.password })
      setCreateForm(emptyForm)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      patronymic: student.patronymic ?? '',
      email: student.email,
      studentNumber: student.studentNumber,
      password: '',
      diplomaTopic: student.diplomaTopic ?? '',
      groupId: student.groupId ?? '',
      supervisorId: student.supervisorId ?? ''
    })
  }

  const cancelEdit = () => {
    setEditingStudentId(null)
    setEditForm(emptyForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingStudentId) {
      return
    }

    setIsSavingEdit(true)
    try {
      await updateStudent(editingStudentId, toRequest(editForm))
      cancelEdit()
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivate = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this student?')) {
      return
    }

    setBusyStudentId(studentId)
    try {
      await deactivateStudent(studentId)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setBusyStudentId(null)
    }
  }

  const handleResetAccess = async (student: Student) => {
    if (!window.confirm(`Reset access for ${student.firstName} ${student.lastName}? Their password is removed and only this student will be able to claim the account again, even while registration is closed.`)) {
      return
    }

    setBusyStudentId(student.id)
    try {
      await resetStudentAccess(student.id)
      await loadData()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setBusyStudentId(null)
    }
  }

  const renderFormFields = (form: StudentFormState, setForm: React.Dispatch<React.SetStateAction<StudentFormState>>, includePassword: boolean, supervisorOptions: SupervisorOption[]) => (
    <div className="student-form-grid">
      <input className="field-input" placeholder="Last name" maxLength={100} value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
      <input className="field-input" placeholder="First name" maxLength={100} value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
      <input className="field-input" placeholder="Patronymic (optional)" maxLength={100} value={form.patronymic} onChange={(e) => setForm((prev) => ({ ...prev, patronymic: e.target.value }))} />
      <input className="field-input" placeholder="Email" type="email" maxLength={256} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
      <input className="field-input" placeholder="Student ID number" maxLength={32} value={form.studentNumber} onChange={(e) => setForm((prev) => ({ ...prev, studentNumber: e.target.value }))} required />
      {includePassword && (
        <input className="field-input" placeholder="Password (optional — leave empty to let the student claim)" type="password" maxLength={128} value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
      )}
      <input className="field-input" placeholder="Diploma topic (optional)" maxLength={500} value={form.diplomaTopic} onChange={(e) => setForm((prev) => ({ ...prev, diplomaTopic: e.target.value }))} />
      <select className="field-input" value={form.groupId} onChange={(e) => setForm((prev) => ({ ...prev, groupId: e.target.value }))} required>
        <option value="">Select group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
        ))}
      </select>
      <select className="field-input" value={form.supervisorId} onChange={(e) => setForm((prev) => ({ ...prev, supervisorId: e.target.value }))}>
        <option value="">No supervisor</option>
        {supervisorOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </div>
  )

  return (
    <div className="students-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Manage Students</h1>
        <div className="registration-row">
          <span>Registration is <strong>{registrationOpen ? 'Open' : 'Closed'}</strong></span>
          <button className="secondary-button" type="button" onClick={toggleRegistration} disabled={isTogglingRegistration || isLoading}>
            {registrationOpen ? 'Close registration' : 'Open registration'}
          </button>
        </div>
      </section>

      <section className="page-card">
        <h2>Import students</h2>
        <form onSubmit={handleImport}>
          <div className="import-grid">
            <select className="field-input" value={importGroupId} onChange={(e) => setImportGroupId(e.target.value)} required>
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
              ))}
            </select>
            <input key={importInputKey} className="field-input" type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} required />
            <button className="primary-button" type="submit" disabled={isImporting || !importGroupId || !importFile}>{isImporting ? 'Importing...' : 'Import'}</button>
            <button className="secondary-button" type="button" onClick={downloadTemplate}>Download template</button>
          </div>
        </form>
        <p className="field-hint">CSV UTF-8 with columns lastName, firstName, patronymic (optional), email, studentNumber.</p>
        {importResult && (
          <div className="import-result">
            <p className="success-text">Created {importResult.created} student(s).</p>
            {importResult.skipped.length > 0 && (
              <>
                <p>Already in the system (skipped):</p>
                <ul>
                  {importResult.skipped.map((row) => <li key={row.line}>Line {row.line}: {row.email}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
        {importMessage && (
          <div className="import-result">
            <p className="error-text">{importMessage}</p>
            {importErrors.length > 0 && (
              <ul>
                {importErrors.map((rowError, index) => <li key={`${rowError.line}-${index}`}>Line {rowError.line}: {rowError.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="page-card">
        <h2>Add student</h2>
        <form className="student-form" onSubmit={handleCreate}>
          {renderFormFields(createForm, setCreateForm, true, activeSupervisorOptions)}
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Student'}</button>
        </form>
      </section>

      {editingStudentId && (
        <section className="page-card">
          <h2>Edit Student</h2>
          <form className="student-form" onSubmit={handleSaveEdit}>
            {renderFormFields(editForm, setEditForm, false, editSupervisorOptions)}
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Students</h2>
        {isLoading && <p>Loading students...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedStudents.length === 0 && <p>No students found.</p>}
        {!isLoading && !error && sortedStudents.length > 0 && (
          <div className="list-grid">
            {sortedStudents.map((student) => (
              <article className="entity-card" key={student.id}>
                <h3>{student.lastName} {student.firstName} {student.patronymic ?? ''}</h3>
                <p>{student.email}</p>
                <p><strong>Student ID:</strong> {student.studentNumber}</p>
                <p>
                  <span className={student.isClaimed ? 'badge badge-claimed' : 'badge badge-unclaimed'}>{student.isClaimed ? 'Claimed' : 'Not claimed'}</span>
                  {!student.isClaimed && student.claimReopened && (
                    <span className="badge badge-reopened">Reopened</span>
                  )}
                </p>
                <p><strong>Group:</strong> {student.groupName ?? 'Not assigned'}</p>
                <p><strong>Diploma topic:</strong> {student.diplomaTopic ?? 'Not set'}</p>
                <p><strong>Supervisor:</strong> {student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorLastName} ${student.supervisorFirstName}` : 'Not assigned'}</p>
                <p><strong>Status:</strong> <span className={student.isActive ? 'status-active' : 'status-inactive'}>{student.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(student)} disabled={!student.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => handleResetAccess(student)} disabled={!student.isActive || !student.isClaimed || busyStudentId === student.id}>Reset access</button>
                  <button className="secondary-button" onClick={() => handleDeactivate(student.id)} disabled={!student.isActive || busyStudentId === student.id}>Deactivate</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
