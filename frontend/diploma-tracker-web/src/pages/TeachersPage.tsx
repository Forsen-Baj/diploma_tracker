import { useEffect, useMemo, useState } from 'react'
import { ApiError, isApiConflict } from '../api/apiClient'
import { createTeacher, deactivateTeacher, getTeachers, updateTeacher } from '../api/teachersApi'
import type { Teacher } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type CreateFormState = {
  firstName: string
  lastName: string
  email: string
  password: string
}

type EditFormState = {
  firstName: string
  lastName: string
  email: string
}

const emptyCreateForm: CreateFormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: ''
}

const emptyEditForm: EditFormState = {
  firstName: '',
  lastName: '',
  email: ''
}

export function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deactivatingTeacherId, setDeactivatingTeacherId] = useState<string | null>(null)

  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [teachers])

  const loadTeachers = async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await getTeachers()
      setTeachers(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTeachers()
  }, [])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError('')
    try {
      await createTeacher(createForm)
      setCreateForm(emptyCreateForm)
      await loadTeachers()
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

  const startEdit = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id)
    setEditForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      email: teacher.email
    })
  }

  const cancelEdit = () => {
    setEditingTeacherId(null)
    setEditForm(emptyEditForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTeacherId) {
      return
    }

    setIsSavingEdit(true)
    setError('')
    try {
      await updateTeacher(editingTeacherId, editForm)
      cancelEdit()
      await loadTeachers()
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

  const handleDeactivate = async (teacherId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this teacher?')) {
      return
    }

    setDeactivatingTeacherId(teacherId)
    setError('')
    try {
      await deactivateTeacher(teacherId)
      await loadTeachers()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeactivatingTeacherId(null)
    }
  }

  return (
    <div className="teachers-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Manage Teachers</h1>
        <form className="teacher-form" onSubmit={handleCreate}>
          <div className="teacher-form-grid">
            <input className="field-input" placeholder="First name" value={createForm.firstName} onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
            <input className="field-input" placeholder="Last name" value={createForm.lastName} onChange={(e) => setCreateForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
            <input className="field-input" placeholder="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} required />
            <input className="field-input" placeholder="Password" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} required />
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Teacher'}</button>
        </form>
      </section>

      {editingTeacherId && (
        <section className="page-card">
          <h2>Edit Teacher</h2>
          <form className="teacher-form" onSubmit={handleSaveEdit}>
            <div className="teacher-form-grid">
              <input className="field-input" placeholder="First name" value={editForm.firstName} onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
              <input className="field-input" placeholder="Last name" value={editForm.lastName} onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
              <input className="field-input" placeholder="Email" type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} required />
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Teachers</h2>
        {isLoading && <p>Loading teachers...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedTeachers.length === 0 && <p>No teachers found.</p>}
        {!isLoading && !error && sortedTeachers.length > 0 && (
          <div className="list-grid">
            {sortedTeachers.map((teacher) => (
              <article className="entity-card" key={teacher.id}>
                <h3>{teacher.firstName} {teacher.lastName}</h3>
                <p>{teacher.email}</p>
                <p><strong>Status:</strong> <span className={teacher.isActive ? 'status-active' : 'status-inactive'}>{teacher.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(teacher)} disabled={!teacher.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => handleDeactivate(teacher.id)} disabled={!teacher.isActive || deactivatingTeacherId === teacher.id}>{deactivatingTeacherId === teacher.id ? 'Deactivating...' : 'Deactivate'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
