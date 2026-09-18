import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { MyTopicCard } from '../components/topics/MyTopicCard'

export function StudentDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title={t('dashboard.studentTitle')} />
      <MyTopicCard />
      <Card>
        <Button onClick={() => navigate('/student/tasks')}>{t('dashboard.goToMyTasks')}</Button>
      </Card>
    </>
  )
}
