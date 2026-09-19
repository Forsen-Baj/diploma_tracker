import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../api/groupsApi'
import { getReviewQueue } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'

export function TeacherDashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [waitingReviews, setWaitingReviews] = useState(0)
  const [myGroups, setMyGroups] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const [queue, groups] = await Promise.all([getReviewQueue(), getGroups()])
        setWaitingReviews(queue.length)
        setMyGroups(groups.length)
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
      <PageHeader title={t('dashboard.teacherTitle')} />

      {loadError && (
        <Card className="mb-6">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-medium text-text-muted">{t('dashboard.waitingReviews')}</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{isLoading ? <Spinner /> : waitingReviews}</p>
          <div className="mt-3">
            <Button onClick={() => navigate('/review')}>{t('dashboard.openReview')}</Button>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-medium text-text-muted">{t('dashboard.myGroups')}</p>
          <p className="mt-1 text-2xl font-semibold text-heading">{isLoading ? <Spinner /> : myGroups}</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => navigate('/teacher/groups')}>{t('dashboard.openGroups')}</Button>
          </div>
        </Card>
      </div>
    </>
  )
}
