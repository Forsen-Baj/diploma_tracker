import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getMyProgress } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { MyTopicCard } from '../components/topics/MyTopicCard'
import { ProgressSummary } from '../components/workflow/ProgressSummary'
import type { StudentProgress } from '../api/types'

export function StudentDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [progress, setProgress] = useState<StudentProgress | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setProgress(await getMyProgress())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader title={t('dashboard.studentTitle')} />
      <MyTopicCard />

      {isLoading && (
        <div className="mb-6 flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card className="mb-6">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && progress && <ProgressSummary progress={progress} />}

      <Card>
        <Button onClick={() => navigate('/student/tasks')}>{t('dashboard.goToMyTasks')}</Button>
      </Card>
    </>
  )
}
