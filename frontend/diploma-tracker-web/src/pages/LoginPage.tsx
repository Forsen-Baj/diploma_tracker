import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useErrorMessage } from '../api/useErrorMessage'
import { AuthLayout } from '../components/layout/AuthLayout'
import { homeRouteByRole } from '../components/layout/navigation'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { user, login, isInitializing } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isInitializing && user) {
    return <Navigate to={homeRouteByRole[user.role]} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const authenticatedUser = await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      const fallbackRoute = homeRouteByRole[authenticatedUser.role]
      navigate(from && from !== '/login' ? from : fallbackRoute, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout title={t('auth.signInTitle')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextField
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label={t('auth.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" loading={isLoading}>
          {isLoading ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
      <p className="mt-6 text-sm text-text-muted">
        {t('auth.firstTime')}{' '}
        <Link to="/claim" className="text-accent font-medium hover:underline">
          {t('auth.claimLink')}
        </Link>
      </p>
    </AuthLayout>
  )
}
