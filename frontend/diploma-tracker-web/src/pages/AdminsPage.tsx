import { KeyRound, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { activateAdmin, createAdmin, deactivateAdmin, getAdmins, setAdminPassword, updateAdmin } from '../api/adminsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
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
import type { Admin } from '../api/types'

type AdminFormState = {
  firstName: string
  lastName: string
  patronymic: string
  email: string
  password: string
}

const emptyForm: AdminFormState = {
  firstName: '',
  lastName: '',
  patronymic: '',
  email: '',
  password: ''
}

export function AdminsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { user } = useAuth()

  const [admins, setAdmins] = useState<Admin[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [adminForm, setAdminForm] = useState<AdminFormState>(emptyForm)
  const [passwordError, setPasswordError] = useState('')
  const [isSavingAdmin, setIsSavingAdmin] = useState(false)

  const [deactivatingAdmin, setDeactivatingAdmin] = useState<Admin | null>(null)
  const [isDeactivatingAdmin, setIsDeactivatingAdmin] = useState(false)
  const [activatingAdminId, setActivatingAdminId] = useState<string | null>(null)

  const [passwordAdmin, setPasswordAdmin] = useState<Admin | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  const sortedAdmins = useMemo(
    () => [...admins].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
    [admins]
  )

  const loadAdmins = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      setAdmins(await getAdmins())
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadAdmins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreateAdmin = () => {
    setEditingAdmin(null)
    setAdminForm(emptyForm)
    setPasswordError('')
    setIsAdminModalOpen(true)
  }

  const openEditAdmin = (admin: Admin) => {
    setEditingAdmin(admin)
    setAdminForm({
      firstName: admin.firstName,
      lastName: admin.lastName,
      patronymic: admin.patronymic ?? '',
      email: admin.email,
      password: ''
    })
    setPasswordError('')
    setIsAdminModalOpen(true)
  }

  const closeAdminModal = () => {
    if (isSavingAdmin) return
    setIsAdminModalOpen(false)
  }

  const submitAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingAdmin) {
      if (!isPasswordLengthValid(adminForm.password)) {
        setPasswordError(t('validation.passwordLength'))
        return
      }
      setPasswordError('')
    }

    setIsSavingAdmin(true)
    try {
      if (editingAdmin) {
        await updateAdmin(editingAdmin.id, {
          firstName: adminForm.firstName.trim(),
          lastName: adminForm.lastName.trim(),
          patronymic: optional(adminForm.patronymic),
          email: adminForm.email.trim()
        })
      } else {
        await createAdmin({
          firstName: adminForm.firstName.trim(),
          lastName: adminForm.lastName.trim(),
          patronymic: optional(adminForm.patronymic),
          email: adminForm.email.trim(),
          password: adminForm.password
        })
      }
      setIsAdminModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadAdmins()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingAdmin(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivatingAdmin) return

    setIsDeactivatingAdmin(true)
    try {
      await deactivateAdmin(deactivatingAdmin.id)
      setDeactivatingAdmin(null)
      toast.success(t('common.savedToast'))
      await loadAdmins()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeactivatingAdmin(false)
    }
  }

  const handleActivate = async (admin: Admin) => {
    setActivatingAdminId(admin.id)
    try {
      await activateAdmin(admin.id)
      toast.success(t('common.savedToast'))
      await loadAdmins()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setActivatingAdminId(null)
    }
  }

  const openPasswordModal = (admin: Admin) => {
    setPasswordAdmin(admin)
    setNewPassword('')
    setConfirmPassword('')
    setNewPasswordError('')
    setConfirmPasswordError('')
  }

  const closePasswordModal = () => {
    if (isSavingPassword) return
    setPasswordAdmin(null)
  }

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!passwordAdmin) return

    const lengthInvalid = !isPasswordLengthValid(newPassword)
    const mismatch = !lengthInvalid && newPassword !== confirmPassword
    setNewPasswordError(lengthInvalid ? t('validation.passwordLength') : '')
    setConfirmPasswordError(mismatch ? t('validation.passwordMismatch') : '')

    if (lengthInvalid || mismatch) {
      return
    }

    setIsSavingPassword(true)
    try {
      await setAdminPassword(passwordAdmin.id, newPassword)
      toast.success(t('admins.passwordUpdated', { name: `${passwordAdmin.firstName} ${passwordAdmin.lastName}` }))
      setPasswordAdmin(null)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingPassword(false)
    }
  }

  const adminColumns: DataTableColumn<Admin>[] = [
    {
      key: 'name',
      header: t('admins.lastName'),
      render: (admin) => `${admin.lastName} ${admin.firstName}${admin.patronymic ? ` ${admin.patronymic}` : ''}`
    },
    { key: 'email', header: t('admins.email'), render: (admin) => admin.email },
    {
      key: 'active',
      header: t('common.status'),
      render: (admin) => <Badge tone={admin.isActive ? 'success' : 'neutral'}>{admin.isActive ? t('common.active') : t('common.inactive')}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (admin) => {
        const isSelf = admin.id === user?.id
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditAdmin(admin)} disabled={!admin.isActive} />
            <Button variant="ghost" size="sm" icon={KeyRound} aria-label={t('admins.setPassword')} onClick={() => openPasswordModal(admin)} disabled={!admin.isActive} />
            {admin.isActive ? (
              !isSelf && (
                <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('admins.deactivate')} onClick={() => setDeactivatingAdmin(admin)} />
              )
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                aria-label={t('admins.activate')}
                loading={activatingAdminId === admin.id}
                onClick={() => void handleActivate(admin)}
              />
            )}
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title={t('admins.title')}
        actions={<Button icon={Plus} onClick={openCreateAdmin}>{t('admins.addAdmin')}</Button>}
      />

      <Card>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={adminColumns}
            rows={sortedAdmins}
            getRowKey={(admin) => admin.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('admins.noAdmins')} />}
          />
        )}
      </Card>

      <Modal
        open={isAdminModalOpen}
        onClose={closeAdminModal}
        title={editingAdmin ? t('admins.editAdmin') : t('admins.addAdmin')}
        footer={
          <>
            <Button variant="secondary" onClick={closeAdminModal} disabled={isSavingAdmin}>{t('common.cancel')}</Button>
            <Button form="admin-form" type="submit" loading={isSavingAdmin}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="admin-form" onSubmit={submitAdmin} className="flex flex-col gap-4">
          <TextField
            label={t('admins.lastName')}
            maxLength={100}
            value={adminForm.lastName}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, lastName: e.target.value }))}
            required
          />
          <TextField
            label={t('admins.firstName')}
            maxLength={100}
            value={adminForm.firstName}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, firstName: e.target.value }))}
            required
          />
          <TextField
            label={t('admins.patronymic')}
            maxLength={100}
            value={adminForm.patronymic}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, patronymic: e.target.value }))}
          />
          <TextField
            label={t('admins.email')}
            type="email"
            maxLength={256}
            value={adminForm.email}
            onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          {!editingAdmin && (
            <TextField
              label={t('admins.password')}
              type="password"
              maxLength={PASSWORD_MAX}
              value={adminForm.password}
              onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
              error={passwordError}
              required
            />
          )}
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordAdmin)}
        onClose={closePasswordModal}
        title={passwordAdmin ? t('admins.setPasswordFor', { name: `${passwordAdmin.lastName} ${passwordAdmin.firstName}` }) : ''}
        footer={
          <>
            <Button variant="secondary" onClick={closePasswordModal} disabled={isSavingPassword}>{t('common.cancel')}</Button>
            <Button form="admin-password-form" type="submit" loading={isSavingPassword}>{t('admins.setPassword')}</Button>
          </>
        }
      >
        <form id="admin-password-form" onSubmit={submitPassword} className="flex flex-col gap-4">
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
        open={Boolean(deactivatingAdmin)}
        title={t('admins.deactivate')}
        message={deactivatingAdmin ? t('admins.deactivateConfirm', { name: `${deactivatingAdmin.firstName} ${deactivatingAdmin.lastName}` }) : ''}
        loading={isDeactivatingAdmin}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setDeactivatingAdmin(null)}
      />
    </>
  )
}
