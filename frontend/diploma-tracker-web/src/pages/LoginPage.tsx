import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { useAuth } from '../auth/useAuth'

function routeByRole(role: 'Admin' | 'Teacher' | 'Student'): string {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

export function LoginPage() {
  const { user, login, isInitializing } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isInitializing && user) {
    return <Navigate to={routeByRole(user.role)} replace />
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')
    try {
      const authenticatedUser = await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      const fallbackRoute = routeByRole(authenticatedUser.role)
      navigate(from && from !== '/login' ? from : fallbackRoute, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? err.message : 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-card">
        <h1>Diploma Tracker Login</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="primary-button" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
        <p className="auth-link">First time here? <Link to="/claim">Claim your account</Link></p>
      </section>
    </div>
  )
}
