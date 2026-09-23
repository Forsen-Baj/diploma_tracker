import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createTeacher, deactivateTeacher, getTeachers, setTeacherPassword, updateTeacher } from '../api/teachersApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { PASSWORD_MAX, isPasswordLengthValid } from '../auth/passwordPolicy'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { optional } from '../utils/optional'
import type { Teacher } from '../api/types'

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
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [teacherForm, setTeacherForm] = useState<TeacherFormState>(emptyForm)
  const [passwordError, setPasswordError] = useState('')
  const [isSavingTeacher, setIsSavingTeacher] = useState(false)

  const [deactivatingTeacher, setDeactivatingTeacher] = useState<Teacher | null>(null)
  const [isDeactivatingTeacher, setIsDeactivatingTeacher] = useState(false)

  const [passwordTeacher, setPasswordTeacher] = useState<Teacher | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [teachers]
  )

  const loadTeachers = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      setTeachers(await getTeachers())
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTeachers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreateTeacher = () => {
    setEditingTeacher(null)
    setTeacherForm(emptyForm)
    setPasswordError('')
    setIsTeacherModalOpen(true)
  }

  const openEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher)
    setTeacherForm({
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      patronymic: teacher.patronymic ?? '',
      email: teacher.email,
      password: ''
    })
    setPasswordError('')
    setIsTeacherModalOpen(true)
  }

  const closeTeacherModal = () => {
    if (isSavingTeacher) return
    setIsTeacherModalOpen(false)
  }

  const submitTeacher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingTeacher) {
      if (!isPasswordLengthValid(teacherForm.password)) {
        setPasswordError(t('validation.passwordLength'))
        return
      }
      setPasswordError('')
    }

    setIsSavingTeacher(true)
    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher.id, {
          firstName: teacherForm.firstName.trim(),
          lastName: teacherForm.lastName.trim(),
          patronymic: optional(teacherForm.patronymic),
          email: teacherForm.email.trim()
        })
      } else {
        await createTeacher({
          firstName: teacherForm.firstName.trim(),
          lastName: teacherForm.lastName.trim(),
          patronymic: optional(teacherForm.patronymic),
          email: teacherForm.email.trim(),
          password: teacherForm.password
        })
      }
      setIsTeacherModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadTeachers()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingTeacher(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivatingTeacher) return

    setIsDeactivatingTeacher(true)
    try {
      await deactivateTeacher(deactivatingTeacher.id)
      setDeactivatingTeacher(null)
      toast.success(t('common.deletedToast'))
      await loadTeachers()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeactivatingTeacher(false)
    }
  }

  const openPasswordModal = (teacher: Teacher) => {
    setPasswordTeacher(teacher)
    setNewPassword('')
    setConfirmPassword('')
    setNewPasswordError('')
    setConfirmPasswordError('')
  }

  const closePasswordModal = () => {
    if (isSavingPassword) return
    setPasswordTeacher(null)
  }

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordTeacher) return

    const lengthInvalid = !isPasswordLengthValid(newPassword)
    const mismatch = !lengthInvalid && newPassword !== confirmPassword
    setNewPasswordError(lengthInvalid ? t('validation.passwordLength') : '')
    setConfirmPasswordError(mismatch ? t('validation.passwordMismatch') : '')

    if (lengthInvalid || mismatch) {
      return
    }

    setIsSavingPassword(true)
    try {
      await setTeacherPassword(passwordTeacher.id, newPassword)
      toast.success(t('teachers.passwordUpdated', { name: `${passwordTeacher.firstName} ${passwordTeacher.lastName}` }))
      setPasswordTeacher(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingPassword(false)
    }
  }

  const teacherColumns: DataTableColumn<Teacher>[] = [
    {
      key: 'name',
      header: t('teachers.lastName'),
      render: (teacher) => `${teacher.lastName} ${teacher.firstName}${teacher.patronymic ? ` ${teacher.patronymic}` : ''}`
    },
    { key: 'email', header: t('teachers.email'), render: (teacher) => teacher.email },
    {
      key: 'active',
      header: t('common.status'),
      render: (teacher) => <Badge tone={teacher.isActive ? 'success' : 'neutral'}>{teacher.isActive ? t('common.active') : t('common.inactive')}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (teacher) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditTeacher(teacher)} disabled={!teacher.isActive} />
          <Button variant="ghost" size="sm" icon={KeyRound} aria-label={t('teachers.setPassword')} onClick={() => openPasswordModal(teacher)} disabled={!teacher.isActive} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('teachers.deactivate')} onClick={() => setDeactivatingTeacher(teacher)} disabled={!teacher.isActive} />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('teachers.title')}
        actions={<Button icon={Plus} onClick={openCreateTeacher}>{t('teachers.addTeacher')}</Button>}
      />

      <Card>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={teacherColumns}
            rows={sortedTeachers}
            getRowKey={(teacher) => teacher.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('teachers.noTeachers')} />}
          />
        )}
      </Card>

      <Modal
        open={isTeacherModalOpen}
        onClose={closeTeacherModal}
        title={editingTeacher ? t('teachers.editTeacher') : t('teachers.addTeacher')}
        footer={
          <>
            <Button variant="secondary" onClick={closeTeacherModal} disabled={isSavingTeacher}>{t('common.cancel')}</Button>
            <Button form="teacher-form" type="submit" loading={isSavingTeacher}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="teacher-form" onSubmit={submitTeacher} className="flex flex-col gap-4">
          <TextField
            label={t('teachers.lastName')}
            maxLength={100}
            value={teacherForm.lastName}
            onChange={(e) => setTeacherForm((prev) => ({ ...prev, lastName: e.target.value }))}
            required
          />
          <TextField
            label={t('teachers.firstName')}
            maxLength={100}
            value={teacherForm.firstName}
            onChange={(e) => setTeacherForm((prev) => ({ ...prev, firstName: e.target.value }))}
            required
          />
          <TextField
            label={t('teachers.patronymic')}
            maxLength={100}
            value={teacherForm.patronymic}
            onChange={(e) => setTeacherForm((prev) => ({ ...prev, patronymic: e.target.value }))}
          />
          <TextField
            label={t('teachers.email')}
            type="email"
            maxLength={256}
            value={teacherForm.email}
            onChange={(e) => setTeacherForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          {!editingTeacher && (
            <TextField
              label={t('teachers.password')}
              type="password"
              maxLength={PASSWORD_MAX}
              value={teacherForm.password}
              onChange={(e) => setTeacherForm((prev) => ({ ...prev, password: e.target.value }))}
              error={passwordError}
              required
            />
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordTeacher)}
        onClose={closePasswordModal}
        title={passwordTeacher ? t('teachers.setPasswordFor', { name: `${passwordTeacher.lastName} ${passwordTeacher.firstName}` }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closePasswordModal} disabled={isSavingPassword}>{t('common.cancel')}</Button>
            <Button form="teacher-password-form" type="submit" loading={isSavingPassword}>{t('teachers.setPassword')}</Button>
          </>
        }
      >
        <form id="teacher-password-form" onSubmit={submitPassword} className="flex flex-col gap-4">
          <TextField
            label={t('account.newPassword')}
            type="password"
            maxLength={PASSWORD_MAX}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={newPasswordError}
            required
            autoFocus
          />
          <TextField
            label={t('account.confirmPassword')}
            type="password"
            maxLength={PASSWORD_MAX}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmPasswordError}
            required
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivatingTeacher)}
        title={t('teachers.deactivate')}
        message={deactivatingTeacher ? t('teachers.deactivateConfirm', { name: `${deactivatingTeacher.firstName} ${deactivatingTeacher.lastName}` }) : ''}
        loading={isDeactivatingTeacher}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setDeactivatingTeacher(null)}
      />
    </>
  )
}
