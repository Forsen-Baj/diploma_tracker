import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getStudentDashboard } from '../api/dashboardApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { MyTopicCard } from '../components/topics/MyTopicCard'
import { ProgressSummary } from '../components/workflow/ProgressSummary'
import type { StudentDashboard } from '../api/types'

export function StudentDashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setDashboard(await getStudentDashboard())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const decision = dashboard?.latestDecision ?? null

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

      {!isLoading && !loadError && dashboard && (
        <>
          <ProgressSummary progress={dashboard.progress} />

          <Card title={t('dashboard.latestDecision')} className="mb-6">
            {!decision && <EmptyState message={t('dashboard.noDecisionYet')} />}

            {decision && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-heading">
                    {decision.stepOrder}. {decision.stepTitle}
                  </p>
                  <Badge tone={decision.decision === 'Approved' ? 'success' : 'warning'}>
                    {decision.decision === 'Approved'
                      ? `${t('dashboard.decisionApproved')}${decision.mark !== null ? ` · ${decision.mark}` : ''}`
                      : t('dashboard.decisionReturned')}
                  </Badge>
                </div>
                <p className="text-sm text-text-muted">
                  {decision.reviewerName} · {dateFormat.format(new Date(decision.decidedAt))}
                </p>
                {decision.reviewerComment && <p className="text-sm text-text-strong">{decision.reviewerComment}</p>}
                <div>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/student/tasks/${decision.studentTaskId}`)}>
                    {t('dashboard.openStep')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      <Card>
        <Button onClick={() => navigate('/student/tasks')}>{t('dashboard.goToMyTasks')}</Button>
      </Card>
    </>
  )
}
