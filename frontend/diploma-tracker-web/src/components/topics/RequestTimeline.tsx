import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReservationDecision } from '../../api/types'

type RequestTimelineProps = {
  timeline: ReservationDecision[]
  /** D: decisions decided before this no longer count; a resubmission line may be inserted here. */
  contentChangedAt: string
  createdAt: string
  studentName: string
}

type TimelineRow =
  | { type: 'decision'; decision: ReservationDecision; stale: boolean }
  | { type: 'resubmitted'; at: string }

/** The decisions made on a topic request, oldest first, plus (D) a note on approvals the wording
 *  outgrew and a line marking when the student resubmitted after a return. */
export function RequestTimeline({ timeline, contentChangedAt, createdAt, studentName }: RequestTimelineProps) {
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const rows = useMemo<TimelineRow[]>(() => {
    const changedAtMs = new Date(contentChangedAt).getTime()
    const createdAtMs = new Date(createdAt).getTime()

    const decisionRows: TimelineRow[] = timeline.map((decision) => ({
      type: 'decision',
      decision,
      stale: (decision.kind === 'Approved' || decision.kind === 'Edited') && new Date(decision.decidedAt).getTime() < changedAtMs
    }))

    const hasEditAtChange = timeline.some((decision) => new Date(decision.decidedAt).getTime() === changedAtMs)
    const priorDecisions = timeline.filter((decision) => new Date(decision.decidedAt).getTime() < changedAtMs)
    const latestPrior = priorDecisions[priorDecisions.length - 1]
    const showsResubmission = changedAtMs > createdAtMs && !hasEditAtChange && latestPrior?.kind === 'Returned'

    if (!showsResubmission) return decisionRows

    const insertAt = decisionRows.findIndex(
      (row) => row.type === 'decision' && new Date(row.decision.decidedAt).getTime() >= changedAtMs
    )
    const resubmitRow: TimelineRow = { type: 'resubmitted', at: contentChangedAt }
    return insertAt === -1
      ? [...decisionRows, resubmitRow]
      : [...decisionRows.slice(0, insertAt), resubmitRow, ...decisionRows.slice(insertAt)]
  }, [timeline, contentChangedAt, createdAt])

  if (rows.length === 0) return null

  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('topics.history')}</h4>
      <ol className="mt-1 flex flex-col gap-1">
        {rows.map((row, index) =>
          row.type === 'resubmitted' ? (
            <li key={`resubmit-${row.at}`} className="text-sm text-text-strong">
              <span className="text-text-muted">{dateFormat.format(new Date(row.at))}</span>
              {' · '}
              {t('topics.resubmittedEntry', { student: studentName })}
            </li>
          ) : (
            <li key={`${row.decision.decidedAt}-${index}`} className="text-sm text-text-strong">
              <span className="text-text-muted">{dateFormat.format(new Date(row.decision.decidedAt))}</span>
              {' · '}
              {row.decision.deciderName} —{' '}
              <span className={row.stale ? 'text-text-muted line-through' : undefined}>
                {t(`topics.decisionKind.${row.decision.kind}`)}
              </span>
              {row.stale && <span className="ml-1 text-text-muted italic">({t('topics.decisionStale')})</span>}
              {row.decision.comment && <span className="block pl-4 text-text-muted">{row.decision.comment}</span>}
            </li>
          )
        )}
      </ol>
    </div>
  )
}
