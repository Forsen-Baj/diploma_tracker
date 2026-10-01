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
  // A row-level predicate, not a table-wide flag: a "My students" row is always the caller's own,
  // but an "Others" row is openable read-only only when the backend's own CanSeeStudentTaskAsync
  // rule (mirrored in GroupProgressStudent.CanOpen) actually grants it - a pure group-reviewer seat
  // does, an unrelated bystander doesn't.
  clickable: (student: Student) => boolean
  dateFormat: Intl.DateTimeFormat
  onOpenStep?: (studentTaskId: string) => void
}

function ProgressTable({ heading, students, steps, clickable, dateFormat, onOpenStep }: ProgressTableProps) {
  const { t } = useTranslation()

  return (
    <div className={heading ? 'mt-6 first:mt-0' : undefined}>
      {heading && <h3 className="mb-2 text-sm font-semibold text-heading">{heading}</h3>}
      {students.length === 0 ? (
        <EmptyState message={t('progress.noStudents')} />
      ) : (
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
              {students.map((student) => {
                const rowClickable = clickable(student)
                return (
                <tr key={student.studentProfileId} className="border-b border-border-subtle/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2.5 text-text-strong">{student.name}</td>
                  {steps.map((step) => {
                    const cell = student.cells.find((item) => item.groupTaskId === step.groupTaskId)
                    const showPanelProgress = cell?.status === 'Submitted' && cell.panelSize !== null && cell.panelSize > 1
                    return (
                      <td
                        key={step.groupTaskId}
                        onClick={cell && rowClickable && onOpenStep ? () => onOpenStep(cell.studentTaskId) : undefined}
                        className={cn('w-36 min-w-36 px-3 py-2.5', cell && rowClickable && onOpenStep && 'cursor-pointer hover:bg-surface')}
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
                )
              })}
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
      )}
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

  // Task 7 bug 3: split every group view into "My students" (supervised, or the caller sits on
  // the panel for any step - `isMine`) and "Others" - not just the students whose steps happen to
  // be un-openable. A group reviewer with no seat of their own used to see the whole group counted
  // as "mine" (isMine is false for all of them, canOpen true for all), which is exactly the bug:
  // everything landed in one table with no split. "Others" stays openable read-only (`canOpen`
  // drives clickability here; the step page's own canDecide - not this list - hides Approve/
  // Return there). Administrators own every row (`isMine` is true for all, set server-side), so
  // they keep the single, unsplit table with no section headings.
  const allMine = progress.students.every((student) => student.isMine)
  const noneMine = progress.students.every((student) => !student.isMine)
  const myStudents = progress.students.filter((student) => student.isMine)
  const otherStudents = progress.students.filter((student) => !student.isMine)

  return (
    <div>
      {allMine ? (
        <ProgressTable
          students={progress.students}
          steps={progress.steps}
          clickable={(student) => student.canOpen}
          dateFormat={dateFormat}
          onOpenStep={onOpenStep}
        />
      ) : noneMine ? (
        // Review I4 (task 7 fix round 1): a group reviewer who supervises nobody in the group and
        // sits on no panel had `myStudents` come back empty - rendering it anyway showed an empty
        // "My students" table saying "no students" directly above "Others" holding the whole
        // roster, which reads as a data bug rather than as "you own none of these". Show only
        // Others, under a plain heading, with no My-students table at all.
        <ProgressTable
          heading={t('progress.otherStudents')}
          students={otherStudents}
          steps={progress.steps}
          clickable={(student) => student.canOpen}
          dateFormat={dateFormat}
          onOpenStep={onOpenStep}
        />
      ) : (
        <>
          <ProgressTable
            heading={t('progress.myStudents')}
            students={myStudents}
            steps={progress.steps}
            clickable={(student) => student.canOpen}
            dateFormat={dateFormat}
            onOpenStep={onOpenStep}
          />
          <ProgressTable
            heading={t('progress.otherStudents')}
            students={otherStudents}
            steps={progress.steps}
            clickable={(student) => student.canOpen}
            dateFormat={dateFormat}
            onOpenStep={onOpenStep}
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
