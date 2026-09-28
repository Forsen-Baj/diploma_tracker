import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../components/ui/Spinner'
import { homeRouteByRole, type Role } from '../components/layout/navigation'
import { useAuth } from './useAuth'

type ProtectedRouteProps = {
  allowedRoles?: Role[]
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
    return <Navigate to={homeRouteByRole[user.role]} replace />
  }

  return <Outlet />
}
