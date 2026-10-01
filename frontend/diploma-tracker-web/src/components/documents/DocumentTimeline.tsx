import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocumentEvent } from '../../api/types'

export function DocumentTimeline({ events }: { events: DocumentEvent[] }) {
  const { t, i18n } = useTranslation()
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const describe = (event: DocumentEvent): string => {
    const params = {
      actor: event.actorName,
      recipient: event.recipientName ?? '',
      purpose: event.purpose ? t(`documents.purposeFor.${event.purpose}`) : '',
      version: event.versionNumber ?? ''
    }
    if (event.kind === 'Recalled' && event.actorRemoved) return t('documents.events.RecalledRemoved', params)
    return t(`documents.events.${event.kind}`, params)
  }

  return (
    <ol className="flex flex-col gap-4">
      {[...events].reverse().map((event) => (
        <li key={event.sequence} className="border-l-2 border-border-subtle pl-4">
          <p className="text-sm text-text-strong">{describe(event)}</p>
          <p className="text-xs text-text-muted">{dateTimeFormat.format(new Date(event.at))}</p>
          {event.comment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{event.comment}</p>}
        </li>
      ))}
    </ol>
  )
}
