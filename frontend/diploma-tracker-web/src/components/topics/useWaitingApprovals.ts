import { useCallback, useEffect, useState } from 'react'
import { getReservationsForDecision } from '../../api/reservationsApi'
import type { Reservation } from '../../api/types'

/** Phase 11 follow-up B: topicId -> the open request waiting for the current user's decision, so
 *  topic lists (not just the requests table) can offer an Approve button. */
export function useWaitingApprovals() {
  const [waitingByTopicId, setWaitingByTopicId] = useState<Record<string, Reservation>>({})

  const refreshWaiting = useCallback(async () => {
    const rows = await getReservationsForDecision('Pending', true)
    const next: Record<string, Reservation> = {}
    for (const reservation of rows) {
      if (reservation.topicId && reservation.canDecide) next[reservation.topicId] = reservation
    }
    setWaitingByTopicId(next)
  }, [])

  useEffect(() => {
    void refreshWaiting()
  }, [refreshWaiting])

  return { waitingByTopicId, refreshWaiting }
}
