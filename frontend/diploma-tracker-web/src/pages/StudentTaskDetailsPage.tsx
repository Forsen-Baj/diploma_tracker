import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { getMyStudentTaskDetails } from '../api/groupTasksApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { displayStatusTone } from '../components/ui/statusTones'
import { formatPeriod } from '../utils/period'
import type { MyStudentTaskDetails, StudentTaskReviewHistoryItem, StudentTaskSubmissionHistoryItem } from '../api/types'

export function StudentTaskDetailsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const { id } = useParams<{ id: string }>()

  const [task, setTask] = useState<MyStudentTaskDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

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
      if (!id) return
      setIsLoading(true)
      setLoadError('')
      try {
        setTask(await getMyStudentTaskDetails(id))
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const submissionColumns: DataTableColumn<StudentTaskSubmissionHistoryItem>[] = [
    { key: 'file', header: t('myTasks.file'), render: (submission) => submission.originalFileName },
    { key: 'submittedAt', header: t('myTasks.submittedAt'), render: (submission) => dateTimeFormat.format(new Date(submission.submittedAt)) },
    {
      key: 'late',
      header: t('myTasks.late'),
      render: (submission) => (submission.isLate ? <Badge tone="warning">{t('myTasks.late')}</Badge> : null)
    },
    { key: 'comment', header: t('myTasks.comment'), render: (submission) => submission.comment ?? t('common.notSet') }
  ]

  const reviewColumns: DataTableColumn<StudentTaskReviewHistoryItem>[] = [
    { key: 'reviewer', header: t('myTasks.reviewer'), render: (review) => `${review.reviewerLastName} ${review.reviewerFirstName}` },
    {
      key: 'decision',
      header: t('myTasks.decision'),
      render: (review) => (review.decision ? t(`myTasks.status.${review.decision}` as never) : t('common.notSet'))
    },
    { key: 'mark', header: t('myTasks.mark'), render: (review) => review.mark ?? '—' },
    { key: 'comment', header: t('myTasks.comment'), render: (review) => review.comment ?? t('common.notSet') },
    { key: 'date', header: t('myTasks.date'), render: (review) => dateTimeFormat.format(new Date(review.createdAt)) }
  ]

  return (
    <>
      <Link to="/student/tasks" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {t('myTasks.back')}
      </Link>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && task && (
        <>
          <PageHeader title={`${task.order}. ${task.title}`} description={task.description || t('common.noDescription')} />

          <Card className="mb-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium text-text-muted">{t('myTasks.period')}</p>
                <p className="text-sm text-text-strong">{formatPeriod(task.startDate, task.deadline, dateFormat)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">{t('myTasks.status.label')}</p>
                <Badge tone={displayStatusTone[task.displayStatus] ?? 'neutral'}>{t(`myTasks.status.${task.displayStatus}` as never)}</Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">{t('myTasks.currentMark')}</p>
                <p className="text-sm text-text-strong">{task.currentMark ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">{t('myTasks.completedAt')}</p>
                <p className="text-sm text-text-strong">{task.completedAt ? dateTimeFormat.format(new Date(task.completedAt)) : t('myTasks.notCompleted')}</p>
              </div>
            </div>
          </Card>

          <Card title={t('myTasks.submissions')} className="mb-6">
            <DataTable
              columns={submissionColumns}
              rows={task.submissions}
              getRowKey={(submission) => submission.id}
              emptyState={<EmptyState message={t('myTasks.noSubmissions')} />}
            />
          </Card>

          <Card title={t('myTasks.reviews')}>
            <DataTable
              columns={reviewColumns}
              rows={task.reviews}
              getRowKey={(review) => review.id}
              emptyState={<EmptyState message={t('myTasks.noReviews')} />}
            />
          </Card>
        </>
      )}
    </>
  )
}
