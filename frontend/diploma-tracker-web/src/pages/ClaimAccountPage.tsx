import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { claimAccount } from '../api/authApi'
import { getRegistrationStatus } from '../api/registrationApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { PASSWORD_MAX, isPasswordLengthValid } from '../auth/passwordPolicy'
import { useAuth } from '../auth/useAuth'

export function ClaimAccountPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { user, isInitializing, completeSignIn } = useAuth()
  const navigate = useNavigate()
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')

  useEffect(() => {
    getRegistrationStatus()
      .then((status) => setRegistrationOpen(status.open))
      .catch(() => setLoadError(true))
  }, [])

  if (!isInitializing && user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPasswordError('')
    setConfirmPasswordError('')

    if (!isPasswordLengthValid(password)) {
      setPasswordError(t('validation.passwordLength'))
      return
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError(t('validation.passwordMismatch'))
      return
    }

    setIsSubmitting(true)
    try {
      const result = await claimAccount({ email: email.trim(), studentNumber: studentNumber.trim(), password })
      completeSignIn(result)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout title={t('claim.title')}>
      {loadError && (
        <p className="mb-4 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{t('claim.statusLoadFailed')}</p>
      )}
      {!loadError && registrationOpen === false && (
        <p className="mb-4 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">{t('claim.closedReopenedOnly')}</p>
      )}
      <p className="mb-4 text-sm text-text-muted">{t('claim.hint')}</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          maxLength={256}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label={t('claim.studentNumber')}
          maxLength={32}
          value={studentNumber}
          onChange={(e) => setStudentNumber(e.target.value)}
          required
        />
        <TextField
          label={t('claim.newPassword')}
          type="password"
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
          required
        />
        <TextField
          label={t('claim.confirmPassword')}
          type="password"
          maxLength={PASSWORD_MAX}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={confirmPasswordError}
          required
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('claim.submitting') : t('claim.submit')}
        </Button>
      </form>
      <p className="mt-6 text-sm text-text-muted">
        <Link to="/login" className="text-accent font-medium hover:underline">
          {t('claim.backToSignIn')}
        </Link>
      </p>
    </AuthLayout>
  )
}
