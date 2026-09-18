import type { BadgeTone } from '../ui/Badge'
import type { ReservationStatus, TopicStatus } from '../../api/types'

export const topicStatusTone: Record<TopicStatus, BadgeTone> = {
  Available: 'success',
  Reserved: 'warning',
  Approved: 'success'
}

export const reservationStatusTone: Record<ReservationStatus, BadgeTone> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'neutral',
  Released: 'neutral'
}
