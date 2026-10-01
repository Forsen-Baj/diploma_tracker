import { KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { createStaff, deactivateStaff, getStaff, setStaffPassword, updateStaff } from '../api/staffApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { PASSWORD_MAX, isPasswordLengthValid } from '../auth/passwordPolicy'
import { RoleBadges } from '../components/staff/RoleBadges'
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
import type { StaffMember } from '../api/types'

type StaffFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  password: string
}

const emptyForm: StaffFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  password: ''
}

export function StaffPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null)
  const [memberForm, setMemberForm] = useState<StaffFormState>(emptyForm)
  const [passwordError, setPasswordError] = useState('')
  const [isSavingMember, setIsSavingMember] = useState(false)

  const [deactivatingMember, setDeactivatingMember] = useState<StaffMember | null>(null)
  const [isDeactivatingMember, setIsDeactivatingMember] = useState(false)

  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [staff]
  )

  const loadStaff = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      setStaff(await getStaff())
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadStaff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreateMember = () => {
    setEditingMember(null)
    setMemberForm(emptyForm)
    setPasswordError('')
    setIsMemberModalOpen(true)
  }

  const openEditMember = (member: StaffMember) => {
    setEditingMember(member)
    setMemberForm({
      firstName: member.firstName,
      lastName: member.lastName,
      patronymic: member.patronymic ?? '',
      email: member.email,
      password: ''
    })
    setPasswordError('')
    setIsMemberModalOpen(true)
  }

  const closeMemberModal = () => {
    if (isSavingMember) return
    setIsMemberModalOpen(false)
  }

  const submitMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingMember) {
      if (!isPasswordLengthValid(memberForm.password)) {
        setPasswordError(t('validation.passwordLength'))
        return
      }
      setPasswordError('')
    }

    setIsSavingMember(true)
    try {
      if (editingMember) {
        await updateStaff(editingMember.id, {
          firstName: memberForm.firstName.trim(),
          lastName: memberForm.lastName.trim(),
          patronymic: optional(memberForm.patronymic),
          email: memberForm.email.trim()
        })
      } else {
        await createStaff({
          firstName: memberForm.firstName.trim(),
          lastName: memberForm.lastName.trim(),
          patronymic: optional(memberForm.patronymic),
          email: memberForm.email.trim(),
          password: memberForm.password
        })
      }
      setIsMemberModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadStaff()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingMember(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivatingMember) return

    setIsDeactivatingMember(true)
    try {
      await deactivateStaff(deactivatingMember.id)
      setDeactivatingMember(null)
      toast.success(t('common.deletedToast'))
      await loadStaff()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeactivatingMember(false)
    }
  }

  const openPasswordModal = (member: StaffMember) => {
    setPasswordMember(member)
    setNewPassword('')
    setConfirmPassword('')
    setNewPasswordError('')
    setConfirmPasswordError('')
  }

  const closePasswordModal = () => {
    if (isSavingPassword) return
    setPasswordMember(null)
  }

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordMember) return

    const lengthInvalid = !isPasswordLengthValid(newPassword)
    const mismatch = !lengthInvalid && newPassword !== confirmPassword
    setNewPasswordError(lengthInvalid ? t('validation.passwordLength') : '')
    setConfirmPasswordError(mismatch ? t('validation.passwordMismatch') : '')

    if (lengthInvalid || mismatch) {
      return
    }

    setIsSavingPassword(true)
    try {
      await setStaffPassword(passwordMember.id, newPassword)
      toast.success(t('staff.passwordUpdated', { name: `${passwordMember.firstName} ${passwordMember.lastName}` }))
      setPasswordMember(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingPassword(false)
    }
  }

  const staffColumns: DataTableColumn<StaffMember>[] = [
    {
      key: 'name',
      header: t('staff.lastName'),
      render: (member) => `${member.lastName} ${member.firstName}${member.patronymic ? ` ${member.patronymic}` : ''}`
    },
    {
      key: 'roles',
      header: t('staff.roles'),
      render: (member) => <RoleBadges assignments={member.assignments} />
    },
    { key: 'email', header: t('staff.email'), render: (member) => member.email },
    {
      key: 'active',
      header: t('common.status'),
      render: (member) => <Badge tone={member.isActive ? 'success' : 'neutral'}>{member.isActive ? t('common.active') : t('common.inactive')}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (member) => (
        // The row opens the person's page; the buttons here do their own thing.
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditMember(member)} disabled={!member.isActive} />
          <Button variant="ghost" size="sm" icon={ShieldCheck} aria-label={t('staff.openRoles')} onClick={() => navigate(`/admin/staff/${member.id}`)} />
          <Button variant="ghost" size="sm" icon={KeyRound} aria-label={t('staff.setPassword')} onClick={() => openPasswordModal(member)} disabled={!member.isActive} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('staff.deactivate')} onClick={() => setDeactivatingMember(member)} disabled={!member.isActive} />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('staff.title')}
        actions={<Button icon={Plus} onClick={openCreateMember}>{t('staff.add')}</Button>}
      />

      <Card>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={staffColumns}
            rows={sortedStaff}
            getRowKey={(member) => member.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('staff.noStaff')} />}
            onRowClick={(member) => navigate(`/admin/staff/${member.id}`)}
          />
        )}
      </Card>

      <Modal
        open={isMemberModalOpen}
        onClose={closeMemberModal}
        title={editingMember ? t('staff.edit') : t('staff.add')}
        footer={
          <>
            <Button variant="secondary" onClick={closeMemberModal} disabled={isSavingMember}>{t('common.cancel')}</Button>
            <Button form="staff-form" type="submit" loading={isSavingMember}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submitMember} className="flex flex-col gap-4">
          <TextField
            label={t('staff.lastName')}
            maxLength={100}
            value={memberForm.lastName}
            onChange={(e) => setMemberForm((prev) => ({ ...prev, lastName: e.target.value }))}
            required
          />
          <TextField
            label={t('staff.firstName')}
            maxLength={100}
            value={memberForm.firstName}
            onChange={(e) => setMemberForm((prev) => ({ ...prev, firstName: e.target.value }))}
            required
          />
          <TextField
            label={t('staff.patronymic')}
            maxLength={100}
            value={memberForm.patronymic}
            onChange={(e) => setMemberForm((prev) => ({ ...prev, patronymic: e.target.value }))}
          />
          <TextField
            label={t('staff.email')}
            type="email"
            maxLength={256}
            value={memberForm.email}
            onChange={(e) => setMemberForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          {!editingMember && (
            <TextField
              label={t('staff.password')}
              type="password"
              maxLength={PASSWORD_MAX}
              value={memberForm.password}
              onChange={(e) => setMemberForm((prev) => ({ ...prev, password: e.target.value }))}
              error={passwordError}
              required
            />
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordMember)}
        onClose={closePasswordModal}
        title={passwordMember ? t('staff.setPasswordFor', { name: `${passwordMember.lastName} ${passwordMember.firstName}` }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closePasswordModal} disabled={isSavingPassword}>{t('common.cancel')}</Button>
            <Button form="staff-password-form" type="submit" loading={isSavingPassword}>{t('staff.setPassword')}</Button>
          </>
        }
      >
        <form id="staff-password-form" onSubmit={submitPassword} className="flex flex-col gap-4">
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
        open={Boolean(deactivatingMember)}
        title={t('staff.deactivate')}
        message={deactivatingMember ? t('staff.deactivateConfirm', { name: `${deactivatingMember.firstName} ${deactivatingMember.lastName}` }) : ''}
        loading={isDeactivatingMember}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setDeactivatingMember(null)}
      />
    </>
  )
}
