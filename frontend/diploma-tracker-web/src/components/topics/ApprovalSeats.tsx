import { Check, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import type { ApprovalSeat } from '../../api/types'

/** Design 2026-09-27 §5.4: the three approvals of an open topic request. */
export function ApprovalSeats({ seats }: { seats: ApprovalSeat[] }) {
  const { t } = useTranslation()
  if (seats.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('topics.approvalsLabel')}>
      {seats.map((seat) => (
        <li key={seat.seat}>
          <Badge tone={seat.isSatisfied ? 'success' : 'neutral'}>
            <span className="inline-flex items-center gap-1">
              {seat.isSatisfied ? <Check className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
              {t(`topics.seat.${seat.seat}`)}
              {seat.holderName ? ` · ${seat.holderName}` : ''}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}
