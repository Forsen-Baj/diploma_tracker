import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getStep } from '../../api/workflowApi'
import { useCodeMessage, useErrorMessage } from '../../api/useErrorMessage'
import { Card } from '../ui/Card'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { Spinner } from '../ui/Spinner'
import { DecisionPanel } from './DecisionPanel'
import { StepStatusBadge } from './StepStatusBadge'
import { StepTimeline } from './StepTimeline'
import { SubmitWorkForm } from './SubmitWorkForm'
import type { StepDetails as StepDetailsData } from '../../api/types'

type StepDetailsProps = {
  stepId: string
  mode: 'student' | 'reviewer'
}

export function StepDetails({ stepId, mode }: StepDetailsProps) {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const codeMessage = useCodeMessage()

  const blockedMessage = (reason: string): string => {
    const key = `steps.blocked.${reason.replace(/\./g, '_')}`
    return i18n.exists(key) ? String(t(key as never)) : codeMessage(reason)
  }

  const [step, setStep] = useState<StepDetailsData | null>(null)
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
    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getStep(stepId)
        if (!isCurrent) return
        setStep(data)
      } catch (err) {
        if (!isCurrent) return
        setLoadError(errorMessage(err))
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    void load()

    return () => {
      isCurrent = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId])

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (loadError || !step) {
    return (
      <Card>
        <p className="text-sm text-danger">{loadError || t('errors.server.unexpected')}</p>
      </Card>
    )
  }

  const isOverdue = new Date(step.deadline).getTime() < Date.now() && step.status !== 'Approved'

  return (
    <>
      <PageHeader
        title={`${step.order}. ${step.title}`}
        description={mode === 'reviewer' ? `${step.studentName} · ${step.groupCode}` : undefined}
      />

      <Card className="mb-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-text-muted">{t('steps.deadline')}</p>
            <p className={cn('text-sm text-text-strong', isOverdue && 'text-danger')}>{dateFormat.format(new Date(step.deadline))}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('common.status')}</p>
            <StepStatusBadge status={step.status} isLate={step.isLate} />
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('steps.mark')}</p>
            <p className="text-sm text-text-strong">{step.mark ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('steps.completedAt')}</p>
            <p className="text-sm text-text-strong">{step.completedAt ? dateTimeFormat.format(new Date(step.completedAt)) : '—'}</p>
          </div>
        </div>
      </Card>

      <Card className="mb-6">
        <p className="whitespace-pre-line text-sm text-text-strong">{step.description || t('common.noDescription')}</p>
      </Card>

      {mode === 'student' && step.blockReason && (
        <Card className="mb-6">
          {/* The student's own step page has its own second-person wording per the design; any
              block reason without one falls back to the shared error catalogue. */}
          <EmptyState message={blockedMessage(step.blockReason)} />
        </Card>
      )}

      {mode === 'student' && step.canSubmit && (
        <div className="mb-6">
          <SubmitWorkForm step={step} onSubmitted={setStep} />
        </div>
      )}

      {mode === 'reviewer' && step.canReview && (
        <div className="mb-6">
          <DecisionPanel step={step} onDecided={setStep} />
        </div>
      )}

      <Card title={t('steps.timeline')}>
        <StepTimeline timeline={step.timeline} />
      </Card>
    </>
  )
}
