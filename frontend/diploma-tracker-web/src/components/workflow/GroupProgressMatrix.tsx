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

type Student = GroupProgress['students'][number]
type Step = GroupProgress['steps'][number]

function approvedCountFor(students: Student[], groupTaskId: string) {
  return students.filter((student) => student.cells.some((cell) => cell.groupTaskId === groupTaskId && cell.status === 'Approved')).length
}

type ProgressTableProps = {
  heading?: string
  students: Student[]
  steps: Step[]
  clickable: boolean
  dateFormat: Intl.DateTimeFormat
  onOpenStep?: (studentTaskId: string) => void
}

function ProgressTable({ heading, students, steps, clickable, dateFormat, onOpenStep }: ProgressTableProps) {
  const { t } = useTranslation()

  return (
    <div className={heading ? 'mt-6 first:mt-0' : undefined}>
      {heading && <h3 className="mb-2 text-sm font-semibold text-heading">{heading}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th scope="col" className="sticky left-0 z-10 bg-background px-3 py-2 text-left text-xs font-semibold text-heading">
                {t('steps.student')}
              </th>
              {steps.map((step) => (
                <th key={step.groupTaskId} scope="col" className="w-36 min-w-36 px-3 py-2 text-left text-xs font-semibold text-heading">
                  <div>{step.order}. {step.title}</div>
                  <div className="text-xs font-normal text-text-muted">{dateFormat.format(new Date(step.deadline))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.studentProfileId} className="border-b border-border-subtle/60 last:border-0">
                <td className="sticky left-0 z-10 bg-background px-3 py-2.5 text-text-strong">{student.name}</td>
                {steps.map((step) => {
                  const cell = student.cells.find((item) => item.groupTaskId === step.groupTaskId)
                  const showPanelProgress = cell?.status === 'Submitted' && cell.panelSize !== null && cell.panelSize > 1
                  return (
                    <td
                      key={step.groupTaskId}
                      onClick={cell && clickable && onOpenStep ? () => onOpenStep(cell.studentTaskId) : undefined}
                      className={cn('w-36 min-w-36 px-3 py-2.5', cell && clickable && onOpenStep && 'cursor-pointer hover:bg-surface')}
                    >
                      {cell && (
                        <div className="flex flex-col items-start gap-1">
                          <StepStatusBadge status={cell.status} isLate={cell.isLate} isOverdue={cell.isOverdue} stack />
                          {cell.status === 'Approved' && cell.mark !== null && (
                            <span className="text-sm font-semibold text-text-strong">{cell.mark}</span>
                          )}
                          {showPanelProgress && (
                            <span
                              className="text-xs text-text-muted"
                              title={t('steps.panelProgress', { approved: cell.panelApproved, total: cell.panelSize })}
                            >
                              {t('review.approvedOf', { approved: cell.panelApproved, total: cell.panelSize })}
                            </span>
                          )}
                        </div>
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
              {steps.map((step) => (
                <td key={step.groupTaskId} className="w-36 min-w-36 px-3 py-2 text-xs font-semibold text-text-muted">
                  {t('review.approvedOf', { approved: approvedCountFor(students, step.groupTaskId), total: students.length })}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
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

  // Follow-up 2026-09-24: a teacher who only supervises some of the group's students can open
  // their step pages but not their groupmates' - split the matrix so the un-openable rows are
  // visibly separate and their cells are not clickable. Administrators and group reviewers can
  // open every row, so they still get a single table with no section headings.
  const allOpenable = progress.students.every((student) => student.canOpen)
  const myStudents = allOpenable ? progress.students : progress.students.filter((student) => student.canOpen)
  const otherStudents = allOpenable ? [] : progress.students.filter((student) => !student.canOpen)

  return (
    <div>
      {allOpenable ? (
        <ProgressTable students={progress.students} steps={progress.steps} clickable dateFormat={dateFormat} onOpenStep={onOpenStep} />
      ) : (
        <>
          <ProgressTable
            heading={t('progress.myStudents')}
            students={myStudents}
            steps={progress.steps}
            clickable
            dateFormat={dateFormat}
            onOpenStep={onOpenStep}
          />
          <ProgressTable
            heading={t('progress.otherStudents')}
            students={otherStudents}
            steps={progress.steps}
            clickable={false}
            dateFormat={dateFormat}
          />
        </>
      )}

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
