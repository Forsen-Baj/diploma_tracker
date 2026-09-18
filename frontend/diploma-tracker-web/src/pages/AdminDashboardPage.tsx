import { useTranslation } from 'react-i18next'
import { PageHeader } from '../components/ui/PageHeader'

export function AdminDashboardPage() {
  const { t } = useTranslation()

  return <PageHeader title={t('dashboard.adminTitle')} />
}
