import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { reservationStatusTone } from './topicTones'
import type { ReservationStatus } from '../../api/types'

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  const { t } = useTranslation()
  return <Badge tone={reservationStatusTone[status]}>{t(`reservations.status.${status}`)}</Badge>
}
