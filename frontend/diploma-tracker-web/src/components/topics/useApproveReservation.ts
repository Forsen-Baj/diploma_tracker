import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import { approveReservation } from '../../api/reservationsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { useToast } from '../ui/useToast'
import type { Reservation } from '../../api/types'

/** Shared approve flow (same API call, confirmation, toast and 409 `reservation.changed`
 *  handling) used by `RequestActions` and by `TopicApproveButton` on topic lists (B). */
export function useApproveReservation(onChanged: () => void) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [target, setTarget] = useState<Reservation | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const open = (reservation: Reservation) => setTarget(reservation)
  const close = () => setTarget(null)

  const confirm = async () => {
    if (!target) return
    setIsBusy(true)
    try {
      const result = await approveReservation(target.id)
      setTarget(null)
      toast.success(t(result.status === 'Approved' ? 'topics.approved' : 'topics.approvalRecorded'))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
      if (err instanceof ApiError && err.status === 409) {
        setTarget(null)
        onChanged()
      }
    } finally {
      setIsBusy(false)
    }
  }

  return { target, isBusy, open, close, confirm }
}
