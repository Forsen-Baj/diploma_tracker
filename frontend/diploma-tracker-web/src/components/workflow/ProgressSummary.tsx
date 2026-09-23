import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { StudentProgress } from '../../api/types'

type ProgressSummaryProps = {
  progress: StudentProgress
}

export function ProgressSummary({ progress }: ProgressSummaryProps) {
  const { t, i18n } = useTranslation()

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <div className="rounded-card bg-surface p-4">
        <p className="text-xs font-medium text-text-muted">{t('progress.approved')}</p>
        <p className="mt-1 text-lg font-semibold text-heading">{t('review.approvedOf', { approved: progress.approved, total: progress.total })}</p>
      </div>
      <div className="rounded-card bg-surface p-4">
        <p className="text-xs font-medium text-text-muted">{t('progress.averageMark')}</p>
        <p className="mt-1 text-lg font-semibold text-heading">{progress.averageMark ?? '—'}</p>
      </div>
      <div className="rounded-card bg-surface p-4">
        <p className="text-xs font-medium text-text-muted">{t('progress.lateSteps')}</p>
        <p className="mt-1 text-lg font-semibold text-heading">{progress.lateSteps}</p>
      </div>
      <div className="rounded-card bg-surface p-4">
        <p className="text-xs font-medium text-text-muted">{t('progress.nextDeadline')}</p>
        <p className="mt-1 text-lg font-semibold text-heading">
          {progress.nextDeadline ? dateFormat.format(new Date(progress.nextDeadline)) : '—'}
        </p>
      </div>
    </div>
  )
}
