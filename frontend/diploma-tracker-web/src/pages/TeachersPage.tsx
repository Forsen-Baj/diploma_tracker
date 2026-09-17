import { useEffect, useMemo, useState } from 'react'
import { createTeacher, deactivateTeacher, getTeachers, setTeacherPassword, updateTeacher } from '../api/teachersApi'
import type { Teacher } from '../api/types'
import { PASSWORD_MAX, PASSWORD_POLICY_MESSAGE, isPasswordLengthValid } from '../auth/passwordPolicy'
import { ErrorModal } from '../components/ErrorModal'
import { optional } from '../utils/optional'

type TeacherFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  password: string
}

const emptyForm: TeacherFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  password: ''
}

export function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<TeacherFormState>(emptyForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TeacherFormState>(emptyForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deactivatingTeacherId, setDeactivatingTeacherId] = useState<string | null>(null)
  const [passwordTeacher, setPasswordTeacher] = useState<Teacher | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState('')

  const sortedTeachers = useMemo(() => [...teachers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)), [teachers])

  const loadTeachers = async () => {
    setIsLoading(true)
    setError('')
    try {
      setTeachers(await getTeachers())
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
    if (!isPasswordLengthValid(createForm.password)) {
      setModalMessage(PASSWORD_POLICY_MESSAGE)
      return
    }

    setIsCreating(true)
    try {
      await createTeacher({
        firstName: createForm.firstName.trim(),
        lastName: createForm.lastName.trim(),
        patronymic: optional(createForm.patronymic),
        email: createForm.email.trim(),
        password: createForm.password
      })
      setCreateForm(emptyForm)
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id)
    setEditForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      patronymic: teacher.patronymic ?? '',
      email: teacher.email,
      password: ''
    })
  }

  const cancelEdit = () => {
    setEditingTeacherId(null)
    setEditForm(emptyForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTeacherId) {
      return
    }

    setIsSavingEdit(true)
    try {
      await updateTeacher(editingTeacherId, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        patronymic: optional(editForm.patronymic),
        email: editForm.email.trim()
      })
      cancelEdit()
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDeactivate = async (teacherId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this teacher?')) {
      return
    }

    setDeactivatingTeacherId(teacherId)
    try {
      await deactivateTeacher(teacherId)
      await loadTeachers()
    } catch (err) {
      setModalMessage((err as Error).message)
    } finally {
      setDeactivatingTeacherId(null)
    }
  }

  const openPasswordModal = (teacher: Teacher) => {
    setPasswordTeacher(teacher)
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setPasswordSuccessMessage('')
  }

  const closePasswordModal = () => {
    if (isSavingPassword) {
      return
    }
    setPasswordTeacher(null)
  }

  const handleSetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordTeacher) {
      return
    }

    if (!isPasswordLengthValid(newPassword)) {
      setPasswordError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    setIsSavingPassword(true)
    try {
      await setTeacherPassword(passwordTeacher.id, newPassword)
      setPasswordSuccessMessage(`Password updated for ${passwordTeacher.firstName} ${passwordTeacher.lastName}.`)
      setPasswordTeacher(null)
    } catch (err) {
      setPasswordError((err as Error).message)
    } finally {
      setIsSavingPassword(false)
    }
  }

  const renderNameFields = (form: TeacherFormState, setForm: React.Dispatch<React.SetStateAction<TeacherFormState>>) => (
    <>
      <input className="field-input" placeholder="Last name" maxLength={100} value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} required />
      <input className="field-input" placeholder="First name" maxLength={100} value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} required />
      <input className="field-input" placeholder="Patronymic (optional)" maxLength={100} value={form.patronymic} onChange={(e) => setForm((prev) => ({ ...prev, patronymic: e.target.value }))} />
      <input className="field-input" placeholder="Email" type="email" maxLength={256} value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} required />
    </>
  )

  return (
    <div className="teachers-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      {passwordTeacher && (
        <div className="modal-backdrop" onClick={closePasswordModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Set password for {passwordTeacher.lastName} {passwordTeacher.firstName}</h3>
            <form onSubmit={handleSetPassword} className="login-form">
              <input className="field-input" type="password" placeholder="New password" maxLength={PASSWORD_MAX} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoFocus />
              <input className="field-input" type="password" placeholder="Confirm new password" maxLength={PASSWORD_MAX} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              {passwordError && <p className="error-text">{passwordError}</p>}
              <div className="actions-row">
                <button className="primary-button" type="submit" disabled={isSavingPassword}>{isSavingPassword ? 'Saving...' : 'Set password'}</button>
                <button className="secondary-button" type="button" onClick={closePasswordModal} disabled={isSavingPassword}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="page-card">
        <h1>Manage Teachers</h1>
        {passwordSuccessMessage && <p className="success-text">{passwordSuccessMessage}</p>}
        <form className="teacher-form" onSubmit={handleCreate}>
          <div className="teacher-form-grid">
            {renderNameFields(createForm, setCreateForm)}
            <input className="field-input" placeholder="Password" type="password" maxLength={PASSWORD_MAX} value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} required />
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Teacher'}</button>
        </form>
      </section>

      {editingTeacherId && (
        <section className="page-card">
          <h2>Edit Teacher</h2>
          <form className="teacher-form" onSubmit={handleSaveEdit}>
            <div className="teacher-form-grid">
              {renderNameFields(editForm, setEditForm)}
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
                <h3>{teacher.lastName} {teacher.firstName} {teacher.patronymic ?? ''}</h3>
                <p>{teacher.email}</p>
                <p><strong>Status:</strong> <span className={teacher.isActive ? 'status-active' : 'status-inactive'}>{teacher.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(teacher)} disabled={!teacher.isActive}>Edit</button>
                  <button className="secondary-button" onClick={() => openPasswordModal(teacher)} disabled={!teacher.isActive}>Set password</button>
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
