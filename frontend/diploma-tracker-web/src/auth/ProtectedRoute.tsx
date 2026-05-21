import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

type ProtectedRouteProps = {
  allowedRoles?: Array<'Admin' | 'Teacher' | 'Student'>
}

function routeByRole(role: 'Admin' | 'Teacher' | 'Student'): string {
  if (role === 'Admin') return '/admin/dashboard'
  if (role === 'Teacher') return '/teacher/dashboard'
  return '/student/dashboard'
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, isInitializing } = useAuth()
  const location = useLocation()

  if (isInitializing) {
    return <section className="page-card"><p>Loading session...</p></section>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={routeByRole(user.role)} replace />
  }

  return <Outlet />
}
