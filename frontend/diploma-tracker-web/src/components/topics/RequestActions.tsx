import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import { editReservationWording, rejectReservation, returnReservation } from '../../api/reservationsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/useToast'
import { DecisionCommentModal } from './DecisionCommentModal'
import { RequiredCommentModal } from './RequiredCommentModal'
import { useApproveReservation } from './useApproveReservation'
import { WordingModal } from './WordingModal'
import type { Reservation } from '../../api/types'

type Action = 'return' | 'reject' | 'wording' | null

type RequestActionsProps = {
  reservation: Reservation
  /** Called after every successful action, and after a 409 so the list catches up. */
  onChanged: () => void
}

export function RequestActions({ reservation, onChanged }: RequestActionsProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [action, setAction] = useState<Action>(null)
  const [isBusy, setIsBusy] = useState(false)
  const approval = useApproveReservation(onChanged)

  const run = async (work: () => Promise<Reservation>, success: (result: Reservation) => string) => {
    setIsBusy(true)
    try {
      const result = await work()
      setAction(null)
      toast.success(success(result))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
      if (err instanceof ApiError && err.status === 409) {
        setAction(null)
        onChanged()
      }
    } finally {
      setIsBusy(false)
    }
  }

  if (reservation.status === 'Returned') {
    return (
      <div className="flex items-center gap-1">
        <Badge tone="warning">{t('topics.waitingForStudent')}</Badge>
        {reservation.canReject && (
          <Button variant="ghost" size="sm" onClick={() => setAction('reject')}>{t('topics.reject')}</Button>
        )}
        <DecisionCommentModal
          open={action === 'reject'}
          title={t('topics.rejectTitle')}
          confirmLabel={t('topics.reject')}
          tone="danger"
          loading={isBusy}
          onConfirm={(comment) => void run(() => rejectReservation(reservation.id, comment), () => t('topics.rejected'))}
          onClose={() => setAction(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {reservation.canDecide && (
        <>
          <Button size="sm" onClick={() => approval.open(reservation)}>{t('topics.approve')}</Button>
          <Button variant="secondary" size="sm" onClick={() => setAction('return')}>{t('topics.return')}</Button>
        </>
      )}
      {reservation.canEditWording && (
        <Button variant="ghost" size="sm" onClick={() => setAction('wording')}>{t('topics.editWording')}</Button>
      )}
      {reservation.canReject && (
        <Button variant="ghost" size="sm" onClick={() => setAction('reject')}>{t('topics.reject')}</Button>
      )}

      <ConfirmDialog
        open={approval.target?.id === reservation.id}
        title={t('topics.approve')}
        message={t('topics.approveConfirm', { title: reservation.topicTitle, student: reservation.studentName })}
        tone="primary"
        loading={approval.isBusy}
        onConfirm={() => void approval.confirm()}
        onCancel={approval.close}
      />
      <RequiredCommentModal
        open={action === 'return'}
        title={t('topics.returnTitle')}
        label={t('topics.returnComment')}
        confirmLabel={t('topics.return')}
        loading={isBusy}
        onConfirm={(comment) => void run(() => returnReservation(reservation.id, comment), () => t('topics.returnedToast'))}
        onClose={() => setAction(null)}
      />
      <DecisionCommentModal
        open={action === 'reject'}
        title={t('topics.rejectTitle')}
        confirmLabel={t('topics.reject')}
        tone="danger"
        loading={isBusy}
        onConfirm={(comment) => void run(() => rejectReservation(reservation.id, comment), () => t('topics.rejected'))}
        onClose={() => setAction(null)}
      />
      <WordingModal
        open={action === 'wording'}
        title={t('topics.editWording')}
        hint={t('topics.editWordingHint')}
        confirmLabel={t('common.save')}
        initialTitle={reservation.topicTitle}
        initialDescription={reservation.topicDescription}
        loading={isBusy}
        onConfirm={(request) => void run(() => editReservationWording(reservation.id, request), () => t('topics.wordingSaved'))}
        onClose={() => setAction(null)}
      />
    </div>
  )
}
