import { useState, type FormEvent } from 'react'
import { changePassword } from '../api/authApi'
import { PASSWORD_MAX, PASSWORD_POLICY_MESSAGE, isPasswordLengthValid } from '../auth/passwordPolicy'
import { useAuth } from '../auth/useAuth'

export function AccountPage() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!isPasswordLengthValid(newPassword)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSaving(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password changed.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="account-page">
      <section className="page-card">
        <h1>Account</h1>
        {user && <p>{user.firstName} {user.lastName} · {user.email}</p>}
      </section>
      <section className="page-card">
        <h2>Change password</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-label" htmlFor="current-password">Current password</label>
          <input id="current-password" type="password" className="field-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          <label className="field-label" htmlFor="new-password">New password</label>
          <input id="new-password" type="password" className="field-input" maxLength={PASSWORD_MAX} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" type="password" className="field-input" maxLength={PASSWORD_MAX} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Change password'}
          </button>
          {error && <p className="error-text">{error}</p>}
          {success && <p className="success-text">{success}</p>}
        </form>
      </section>
    </div>
  )
}
