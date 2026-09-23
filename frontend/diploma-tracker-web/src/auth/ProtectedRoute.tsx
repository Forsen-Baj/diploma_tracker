import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../components/ui/Spinner'
import { useAuth } from './useAuth'

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
  const { t } = useTranslation()

  if (isInitializing) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={routeByRole(user.role)} replace />
  }

  return <Outlet />
}
