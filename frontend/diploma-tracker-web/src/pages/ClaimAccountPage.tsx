import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { claimAccount } from '../api/authApi'
import { getRegistrationStatus } from '../api/registrationApi'
import { PASSWORD_MAX, PASSWORD_POLICY_MESSAGE, isPasswordLengthValid } from '../auth/passwordPolicy'
import { useAuth } from '../auth/useAuth'

export function ClaimAccountPage() {
  const { user, isInitializing, completeSignIn } = useAuth()
  const navigate = useNavigate()
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [email, setEmail] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    setError('')

    if (!isPasswordLengthValid(password)) {
      setError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await claimAccount({ email: email.trim(), studentNumber: studentNumber.trim(), password })
      completeSignIn(result)
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-card">
        <h1>Claim your account</h1>
        {registrationOpen === null && !loadError && <p>Loading...</p>}
        {loadError && <p className="error-text">Could not check registration status. Try again.</p>}
        {!loadError && registrationOpen === false && (
          <p>Registration is closed. Contact your department administrator.</p>
        )}
        {!loadError && registrationOpen && (
          <form onSubmit={handleSubmit} className="login-form">
            <p className="field-hint">Use the email and student ID number from your department's list.</p>
            <label className="field-label" htmlFor="claim-email">Email</label>
            <input id="claim-email" type="email" className="field-input" maxLength={256} value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label className="field-label" htmlFor="claim-number">Student ID number</label>
            <input id="claim-number" className="field-input" maxLength={32} value={studentNumber} onChange={(e) => setStudentNumber(e.target.value)} required />
            <label className="field-label" htmlFor="claim-password">New password</label>
            <input id="claim-password" type="password" className="field-input" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <label className="field-label" htmlFor="claim-confirm">Confirm password</label>
            <input id="claim-confirm" type="password" className="field-input" maxLength={PASSWORD_MAX} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? 'Claiming...' : 'Claim account'}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        )}
        <p className="auth-link"><Link to="/login">Back to sign in</Link></p>
      </section>
    </div>
  )
}
