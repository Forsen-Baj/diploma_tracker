import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { getGroups } from '../api/groupsApi'
import { createStudent, deactivateStudent, getStudents, updateStudent } from '../api/studentsApi'
import { getTeachers } from '../api/teachersApi'
import type { Group, Student, Teacher } from '../api/types'
import { ErrorModal, isApiConflict } from '../components/ErrorModal'

type CreateFormState = {
  firstName: string
  lastName: string
  email: string
  password: string
  diplomaTopic: string
  groupId: string
  supervisorId: string
}

type EditFormState = {
  firstName: string
  lastName: string
  email: string
  diplomaTopic: string
  groupId: string
  supervisorId: string
}

const emptyCreateForm: CreateFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  diplomaTopic: '',
  groupId: '',
  supervisorId: ''
}

const emptyEditForm: EditFormState = {
  firstName: '',
  lastName: '',
  email: '',
  diplomaTopic: '',
  groupId: '',
  supervisorId: ''
}

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deactivatingStudentId, setDeactivatingStudentId] = useState<string | null>(null)

  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [students])
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])

  const loadData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [studentsData, teachersData, groupsData] = await Promise.all([getStudents(), getTeachers(), getGroups()])
      setStudents(studentsData)
      setTeachers(teachersData)
      setGroups(groupsData)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError('')
    try {
      await createStudent({
        ...createForm,
        groupId: createForm.groupId || undefined,
        supervisorId: createForm.supervisorId || undefined
      })
      setCreateForm(emptyCreateForm)
      await loadData()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (student: Student) => {
    setEditingStudentId(student.id)
    setEditForm({
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      diplomaTopic: student.diplomaTopic,
      groupId: student.groupId ?? '',
      supervisorId: student.supervisorId ?? ''
    })
  }

  const cancelEdit = () => {
    setEditingStudentId(null)
    setEditForm(emptyEditForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingStudentId) {
      return
    }

    setIsSavingEdit(true)
    setError('')
    try {
      await updateStudent(editingStudentId, {
        ...editForm,
        groupId: editForm.groupId || undefined,
        supervisorId: editForm.supervisorId || undefined
      })
      cancelEdit()
      await loadData()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivate = async (studentId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this student?')) {
      return
    }

    setDeactivatingStudentId(studentId)
    setError('')
    try {
      await deactivateStudent(studentId)
      await loadData()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeactivatingStudentId(null)
    }
  }

  return (
    <div className="students-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Manage Students</h1>
        <form className="student-form" onSubmit={handleCreate}>
          <div className="student-form-grid">
            <input className="field-input" placeholder="First name" value={createForm.firstName} onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
            <input className="field-input" placeholder="Last name" value={createForm.lastName} onChange={(e) => setCreateForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
            <input className="field-input" placeholder="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="field-input" placeholder="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} required />
            <input className="field-input" placeholder="Diploma topic" value={createForm.diplomaTopic} onChange={(e) => setCreateForm((prev) => ({ ...prev, diplomaTopic: e.target.value }))} required />
            <select className="field-input" value={createForm.groupId} onChange={(e) => setCreateForm((prev) => ({ ...prev, groupId: e.target.value }))}>
              <option value="">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
              ))}
            </select>
            <select className="field-input" value={createForm.supervisorId} onChange={(e) => setCreateForm((prev) => ({ ...prev, supervisorId: e.target.value }))}>
              <option value="">No supervisor</option>
              {activeTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
              ))}
            </select>
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Student'}</button>
        </form>
      </section>

      {editingStudentId && (
        <section className="page-card">
          <h2>Edit Student</h2>
          <form className="student-form" onSubmit={handleSaveEdit}>
            <div className="student-form-grid">
              <input className="field-input" placeholder="First name" value={editForm.firstName} onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
              <input className="field-input" placeholder="Last name" value={editForm.lastName} onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
              <input className="field-input" placeholder="Email" type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} required />
              <input className="field-input" placeholder="Diploma topic" value={editForm.diplomaTopic} onChange={(e) => setEditForm((prev) => ({ ...prev, diplomaTopic: e.target.value }))} required />
              <select className="field-input" value={editForm.groupId} onChange={(e) => setEditForm((prev) => ({ ...prev, groupId: e.target.value }))}>
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
                ))}
              </select>
              <select className="field-input" value={editForm.supervisorId} onChange={(e) => setEditForm((prev) => ({ ...prev, supervisorId: e.target.value }))}>
                <option value="">No supervisor</option>
                {activeTeachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                ))}
              </select>
            </div>
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
                <h3>{student.firstName} {student.lastName}</h3>
                <p>{student.email}</p>
                <p><strong>Diploma topic:</strong> {student.diplomaTopic}</p>
                <p><strong>Group:</strong> {student.groupName ?? 'Not assigned'}</p>
                <p><strong>Supervisor:</strong> {student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorFirstName} ${student.supervisorLastName}` : 'Not assigned'}</p>
                <p><strong>Status:</strong> <span className={student.isActive ? 'status-active' : 'status-inactive'}>{student.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(student)} disabled={!student.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => handleDeactivate(student.id)} disabled={!student.isActive || deactivatingStudentId === student.id}>{deactivatingStudentId === student.id ? 'Deactivating...' : 'Deactivate'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
