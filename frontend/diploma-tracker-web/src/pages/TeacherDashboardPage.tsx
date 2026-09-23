import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getTeacherDashboard } from '../api/dashboardApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { StatTile } from '../components/dashboard/StatTile'
import { GroupProgressCard } from '../components/dashboard/GroupProgressCard'
import { GroupTable } from '../components/dashboard/GroupTable'
import { nextGroupSort, sortGroupRows, type GroupSort } from '../components/dashboard/groupSort'
import { StepStatusBadge } from '../components/workflow/StepStatusBadge'
import type { OverdueStepRow, ReviewQueueItem, SupervisedStudentRow, TeacherDashboard } from '../api/types'

export function TeacherDashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [groupSort, setGroupSort] = useState<GroupSort>({ key: 'code', direction: 'asc' })

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setDashboard(await getTeacherDashboard())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedGroups = useMemo(() => (dashboard ? sortGroupRows(dashboard.groups, groupSort) : []), [dashboard, groupSort])

  const latestForReviewColumns: DataTableColumn<ReviewQueueItem>[] = [
    { key: 'student', header: t('steps.student'), render: (item) => item.studentName },
    { key: 'group', header: t('review.group'), render: (item) => item.groupCode },
    { key: 'step', header: t('steps.step'), render: (item) => `${item.stepOrder}. ${item.stepTitle}` },
    { key: 'version', header: t('review.version'), render: (item) => item.version },
    { key: 'submittedAt', header: t('review.submittedAt'), render: (item) => dateTimeFormat.format(new Date(item.submittedAt)) },
    {
      key: 'late',
      header: <span className="sr-only">{t('steps.late')}</span>,
      render: (item) => (item.isLate ? <Badge tone="warning">{t('steps.late')}</Badge> : null)
    }
  ]

  const overdueColumns: DataTableColumn<OverdueStepRow>[] = [
    { key: 'student', header: t('steps.student'), render: (row) => row.studentName },
    { key: 'group', header: t('review.group'), render: (row) => row.groupCode },
    { key: 'step', header: t('steps.step'), render: (row) => `${row.stepOrder}. ${row.stepTitle}` },
    { key: 'deadline', header: t('groupDetails.deadline'), render: (row) => dateFormat.format(new Date(row.deadline)) },
    {
      key: 'daysOverdue',
      header: t('dashboard.overdue'),
      render: (row) => <span className="text-danger">{t('dashboard.daysOverdue', { count: row.daysOverdue })}</span>
    }
  ]

  const supervisedColumns: DataTableColumn<SupervisedStudentRow>[] = [
    { key: 'student', header: t('steps.student'), render: (row) => row.studentName },
    { key: 'group', header: t('review.group'), render: (row) => row.groupCode },
    { key: 'topic', header: t('groupDetails.topic'), render: (row) => row.topicTitle ?? t('dashboard.noTopic') },
    {
      key: 'currentStep',
      header: t('dashboard.currentStep'),
      render: (row) =>
        row.currentStepStatus ? (
          <span className="inline-flex items-center gap-2">
            {row.currentStepTitle}
            <StepStatusBadge status={row.currentStepStatus} />
          </span>
        ) : (
          '—'
        )
    },
    {
      key: 'nextDeadline',
      header: t('dashboard.nextDeadline'),
      render: (row) => (row.nextDeadline ? dateFormat.format(new Date(row.nextDeadline)) : '—')
    }
  ]

  return (
    <>
      <PageHeader title={t('dashboard.teacherTitle')} />

      {isLoading && (
        <div className="flex justify-center py-10">
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
          <div className="mb-6 grid grid-cols-2 gap-4">
            <StatTile label={t('dashboard.waiting')} value={dashboard.waitingReviews} onClick={() => navigate('/review')} />
            <StatTile label={t('nav.groups')} value={dashboard.groups.length} onClick={() => navigate('/teacher/groups')} />
          </div>

          <Card title={t('dashboard.latestForReview')} className="mb-6">
            <DataTable
              columns={latestForReviewColumns}
              rows={dashboard.latestForReview}
              getRowKey={(item) => item.submissionId}
              emptyState={<EmptyState message={t('dashboard.noWaiting')} />}
              onRowClick={(item) => navigate(`/review/steps/${item.studentTaskId}`)}
            />
            {dashboard.waitingReviews > dashboard.latestForReview.length && (
              <div className="mt-4">
                <Button variant="secondary" size="sm" onClick={() => navigate('/review')}>
                  {t('dashboard.openReview')}
                </Button>
              </div>
            )}
          </Card>

          <Card title={t('dashboard.overdueSteps')} className="mb-6">
            <DataTable
              columns={overdueColumns}
              rows={dashboard.overdueSteps}
              getRowKey={(row) => row.studentTaskId}
              emptyState={<EmptyState message={t('dashboard.overdueEmpty')} />}
              onRowClick={(row) => navigate(`/review/steps/${row.studentTaskId}`)}
            />
          </Card>

          <Card title={t('dashboard.supervisedStudents')} className="mb-6">
            <DataTable
              columns={supervisedColumns}
              rows={dashboard.supervisedStudents}
              getRowKey={(row) => row.studentProfileId}
              emptyState={<EmptyState message={t('dashboard.supervisedEmpty')} />}
            />
          </Card>

          <Card title={t('dashboard.groupsBreakdown')} className="mb-6">
            <GroupTable rows={sortedGroups} sort={groupSort} onSortChange={(key) => setGroupSort((current) => nextGroupSort(current, key))} />
          </Card>

          <GroupProgressCard />
        </>
      )}
    </>
  )
}
