import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

function routeByRole(role: 'Admin' | 'Teacher' | 'Student'): string {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

export function RoleRedirect() {
  const { user, isInitializing } = useAuth()

  if (isInitializing) {
    return <section className="page-card"><p>Loading session...</p></section>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={routeByRole(user.role)} replace />
}
