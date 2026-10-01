import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spinner } from '../components/ui/Spinner'
import { homeRouteByRole } from '../components/layout/navigation'
import { useAuth } from './useAuth'

export function RoleRedirect() {
  const { user, isInitializing } = useAuth()
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
    return <Navigate to="/login" replace />
  }

  return <Navigate to={homeRouteByRole[user.role]} replace />
}
