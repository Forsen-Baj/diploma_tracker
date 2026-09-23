import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { StepStatusBadge } from './StepStatusBadge'
import { stepStatusTone } from './stepTones'
import type { GroupProgress } from '../../api/types'

type GroupProgressMatrixProps = {
  progress: GroupProgress
  onOpenStep?: (studentTaskId: string) => void
}

export function GroupProgressMatrix({ progress, onOpenStep }: GroupProgressMatrixProps) {
  const { t, i18n } = useTranslation()

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  if (progress.students.length === 0) {
    return <EmptyState message={t('progress.noStudents')} />
  }

  if (progress.steps.length === 0) {
    return <EmptyState message={t('progress.noSteps')} />
  }

  const totalStudents = progress.students.length

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle">
            <th scope="col" className="sticky left-0 z-10 bg-background px-3 py-2 text-left text-xs font-semibold text-heading">
              {t('steps.student')}
            </th>
            {progress.steps.map((step) => (
              <th key={step.groupTaskId} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-heading">
                <div>{step.order}. {step.title}</div>
                <div className="text-xs font-normal text-text-muted">{dateFormat.format(new Date(step.deadline))}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progress.students.map((student) => (
            <tr key={student.studentProfileId} className="border-b border-border-subtle/60 last:border-0">
              <td className="sticky left-0 z-10 bg-background px-3 py-2.5 text-text-strong">{student.name}</td>
              {progress.steps.map((step) => {
                const cell = student.cells.find((item) => item.groupTaskId === step.groupTaskId)
                return (
                  <td
                    key={step.groupTaskId}
                    onClick={cell && onOpenStep ? () => onOpenStep(cell.studentTaskId) : undefined}
                    className={cn('px-3 py-2.5', cell && onOpenStep && 'cursor-pointer hover:bg-surface')}
                  >
                    {cell && (
                      <span className="inline-flex items-center gap-1.5">
                        <StepStatusBadge status={cell.status} isLate={cell.isLate} isOverdue={cell.isOverdue} />
                        {cell.status === 'Approved' && cell.mark !== null && (
                          <span className="text-xs text-text-muted">{cell.mark}</span>
                        )}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-subtle">
            <td className="sticky left-0 z-10 bg-background px-3 py-2 text-xs font-semibold text-heading" />
            {progress.steps.map((step) => (
              <td key={step.groupTaskId} className="px-3 py-2 text-xs font-semibold text-text-muted">
                {t('review.approvedOf', { approved: step.approvedCount, total: totalStudents })}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span className="font-semibold text-heading">{t('steps.legend')}</span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={stepStatusTone.Pending}>{t('steps.status.Pending')}</Badge>
          {t('steps.legendPending')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone="danger">{t('steps.overdue')}</Badge>
          {t('steps.legendOverdue')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={stepStatusTone.Submitted}>{t('steps.status.Submitted')}</Badge>
          {t('steps.legendSubmitted')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={stepStatusTone.Returned}>{t('steps.status.Returned')}</Badge>
          {t('steps.legendReturned')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge tone={stepStatusTone.Approved}>{t('steps.status.Approved')}</Badge>
          {t('steps.legendApproved')}
        </span>
      </div>
    </div>
  )
}
