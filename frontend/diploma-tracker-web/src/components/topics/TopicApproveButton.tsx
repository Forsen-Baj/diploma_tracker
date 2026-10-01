import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useApproveReservation } from './useApproveReservation'
import type { Reservation } from '../../api/types'

type TopicApproveButtonProps = {
  reservation: Reservation
  onChanged: () => void
}

/** B: an Approve button for topic list rows whose open request is waiting for the current
 *  user's decision - reuses the approve flow from `RequestActions`. */
export function TopicApproveButton({ reservation, onChanged }: TopicApproveButtonProps) {
  const { t } = useTranslation()
  const { target, isBusy, open, close, confirm } = useApproveReservation(onChanged)

  return (
    <>
      <Button size="sm" onClick={() => open(reservation)}>{t('topics.approve')}</Button>
      <ConfirmDialog
        open={target?.id === reservation.id}
        title={t('topics.approve')}
        message={t('topics.approveConfirm', { title: reservation.topicTitle, student: reservation.studentName })}
        tone="primary"
        loading={isBusy}
        onConfirm={() => void confirm()}
        onCancel={close}
      />
    </>
  )
}
