import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReservationDecision } from '../../api/types'

/** The decisions made on a topic request, oldest first. */
export function RequestTimeline({ timeline }: { timeline: ReservationDecision[] }) {
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  if (timeline.length === 0) return null

  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('topics.history')}</h4>
      <ol className="mt-1 flex flex-col gap-1">
        {timeline.map((decision, index) => (
          <li key={`${decision.decidedAt}-${index}`} className="text-sm text-text-strong">
            <span className="text-text-muted">{dateFormat.format(new Date(decision.decidedAt))}</span>
            {' · '}
            {decision.deciderName} — {t(`topics.decisionKind.${decision.kind}`)}
            {decision.comment && <span className="block pl-4 text-text-muted">{decision.comment}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
