import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getMyProgress, getMySteps } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../components/ui/cn'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { ProgressSummary } from '../components/workflow/ProgressSummary'
import { StepStatusBadge } from '../components/workflow/StepStatusBadge'
import type { StudentProgress, StudentStep } from '../api/types'

export function StudentMyTasksPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()

  const [steps, setSteps] = useState<StudentStep[]>([])
  const [progress, setProgress] = useState<StudentProgress | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  const sortedSteps = useMemo(() => [...steps].sort((a, b) => a.order - b.order), [steps])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const [stepsData, progressData] = await Promise.all([getMySteps(), getMyProgress()])
        setSteps(stepsData)
        setProgress(progressData)
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openStep = (step: StudentStep) => navigate(`/student/tasks/${step.id}`)

  const columns: DataTableColumn<StudentStep>[] = [
    { key: 'order', header: t('steps.order'), render: (step) => step.order },
    { key: 'title', header: t('steps.step'), render: (step) => step.title },
    {
      key: 'deadline',
      header: t('steps.deadline'),
      render: (step) => (
        <span className={cn(new Date(step.deadline).getTime() < Date.now() && step.status !== 'Approved' && 'text-danger')}>
          {dateFormat.format(new Date(step.deadline))}
        </span>
      )
    },
    { key: 'status', header: t('common.status'), render: (step) => <StepStatusBadge status={step.status} isLate={step.isLate} /> },
    { key: 'mark', header: t('steps.mark'), render: (step) => step.mark ?? '—' },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      render: (step) => <Button variant="ghost" size="sm" icon={ArrowRight} aria-label={t('steps.open')} onClick={() => openStep(step)} />
    }
  ]

  return (
    <>
      <PageHeader title={t('steps.myTitle')} />

      {!isLoading && !loadError && progress && <ProgressSummary progress={progress} />}

      <Card>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={sortedSteps}
            getRowKey={(step) => step.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('steps.noSteps')} />}
            onRowClick={openStep}
          />
        )}
      </Card>
    </>
  )
}
