import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { changePassword } from '../api/authApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { PASSWORD_MAX, isPasswordLengthValid } from '../auth/passwordPolicy'
import { useAuth } from '../auth/useAuth'

export function AccountPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [newPasswordError, setNewPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setNewPasswordError('')
    setConfirmPasswordError('')

    if (!isPasswordLengthValid(newPassword)) {
      setNewPasswordError(t('validation.passwordLength'))
      return
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(t('validation.passwordMismatch'))
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('account.passwordChanged'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title={t('account.title')}
        description={user ? `${user.firstName} ${user.lastName} · ${user.email}` : undefined}
      />
      <Card title={t('account.changePassword')}>
        <form id="account-password-form" onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
          <TextField
            label={t('account.currentPassword')}
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <TextField
            label={t('account.newPassword')}
            type="password"
            maxLength={PASSWORD_MAX}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={newPasswordError}
            required
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
          <Button type="submit" loading={isSaving} className="self-start">
            {isSaving ? t('common.saving') : t('account.submit')}
          </Button>
        </form>
      </Card>
    </>
  )
}
