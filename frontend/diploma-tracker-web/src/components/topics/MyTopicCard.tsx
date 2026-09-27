import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { cancelReservation, getMyReservations, resubmitReservation } from '../../api/reservationsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../ui/useToast'
import { ApprovalSeats } from './ApprovalSeats'
import { RequestTimeline } from './RequestTimeline'
import { ReservationStatusBadge } from './ReservationStatusBadge'
import { WordingModal } from './WordingModal'
import type { Reservation } from '../../api/types'

const DISMISSED_REJECTION_STORAGE_KEY = 'dt.dismissedRejectionId'

// `localStorage` can throw (private browsing, cleared/blocked site data), and a card that crashes
// because of it would be worse than the "notice never goes away" bug this is meant to fix — so
// every read and write degrades to the current page view only instead of propagating.
function readDismissedRejectionId(): string | null {
  try {
    return localStorage.getItem(DISMISSED_REJECTION_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissedRejectionId(id: string): void {
  try {
    localStorage.setItem(DISMISSED_REJECTION_STORAGE_KEY, id)
  } catch {
    // Storage can be unavailable; the dismissal then lasts for this page view only.
  }
}

type MyTopicCardProps = {
  /** When provided, the card renders this list instead of loading its own copy — the caller
   *  (e.g. `StudentTopicsPage`) owns the fetch and refreshes it after every mutation, including
   *  ones made elsewhere on the same page, so this card never shows stale reservation state. */
  reservations?: Reservation[]
  /** Whether the controlled `reservations` are still loading. Ignored when `reservations` is omitted. */
  loading?: boolean
  /** Called after a successful cancel when `reservations` is controlled, so the caller can refresh
   *  its own copy (and anything derived from it, such as a disabled-action matrix) in one place. */
  onChanged?: () => void
}

export function MyTopicCard({ reservations: controlledReservations, loading: controlledLoading, onChanged }: MyTopicCardProps = {}) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  const isControlled = controlledReservations !== undefined

  const [ownReservations, setOwnReservations] = useState<Reservation[]>([])
  const [isOwnLoading, setIsOwnLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [cancelling, setCancelling] = useState<Reservation | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)

  const [resubmitting, setResubmitting] = useState(false)
  const [isResubmitting, setIsResubmitting] = useState(false)

  // Only the latest rejection is ever rendered, so remembering just its id is enough; a later
  // rejection is a different reservation and must appear again rather than staying pre-dismissed.
  const [dismissedRejectionId, setDismissedRejectionId] = useState<string | null>(() => readDismissedRejectionId())

  const load = async () => {
    setIsOwnLoading(true)
    setLoadError('')
    try {
      setOwnReservations(await getMyReservations())
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsOwnLoading(false)
    }
  }

  useEffect(() => {
    if (isControlled) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reservations = isControlled ? controlledReservations : ownReservations
  const isLoading = isControlled ? Boolean(controlledLoading) : isOwnLoading

  const confirmCancel = async () => {
    if (!cancelling) return

    setIsCancelling(true)
    try {
      await cancelReservation(cancelling.id)
      setCancelling(null)
      toast.success(t('topics.cancelled'))
      if (isControlled) {
        onChanged?.()
      } else {
        await load()
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsCancelling(false)
    }
  }

  const confirmResubmit = async (request: { title: string; description?: string }) => {
    if (!open) return

    setIsResubmitting(true)
    try {
      await resubmitReservation(open.id, request)
      toast.success(t('topics.resubmitted'))
      setResubmitting(false)
      if (isControlled) {
        onChanged?.()
      } else {
        await load()
      }
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsResubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <Card title={t('topics.myTopic')} className="mb-6">
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </Card>
    )
  }

  if (!isControlled && loadError) {
    return (
      <Card title={t('topics.myTopic')} className="mb-6">
        <p className="text-sm text-danger">{loadError}</p>
      </Card>
    )
  }

  const approved = reservations.find((reservation) => reservation.status === 'Approved') ?? null
  const open = reservations.find((r) => r.status === 'Pending' || r.status === 'Returned') ?? null
  // The API already returns the student's reservations newest-first, so no re-sort is needed here.
  const latest = reservations[0] ?? null
  const lastRejected = latest && latest.status === 'Rejected' && latest.id !== dismissedRejectionId ? latest : null

  const dismissRejection = (id: string) => {
    setDismissedRejectionId(id)
    writeDismissedRejectionId(id)
  }

  return (
    <Card title={t('topics.myTopic')} className="mb-6">
      {!approved && !open && (
        <EmptyState
          message={t('topics.noTopicYet')}
          action={<Button onClick={() => navigate('/student/topics')}>{t('topics.browseTopics')}</Button>}
        />
      )}

      {approved && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-heading">{approved.topicTitle}</p>
            <ReservationStatusBadge status={approved.status} />
          </div>
          <p className="text-sm text-text-muted">{approved.supervisorName}</p>
          <p className="text-xs text-text-muted">{approved.directionName}</p>
        </div>
      )}

      {!approved && open && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-heading">{open.topicTitle}</p>
            <ReservationStatusBadge status={open.status} />
          </div>
          <p className="text-sm text-text-muted">{open.supervisorName}</p>
          <p className="text-xs text-text-muted">{open.directionName}</p>
          <ApprovalSeats seats={open.seats} />
          {open.canCancel && (
            <div>
              <Button variant="secondary" size="sm" onClick={() => setCancelling(open)}>{t('topics.cancel')}</Button>
            </div>
          )}
          {open.status === 'Returned' && (
            <div className="mt-2 rounded-card bg-warning-soft p-3">
              <p className="text-sm font-semibold text-warning">{t('topics.returnedNotice')}</p>
              {open.returnComment && <p className="mt-1 text-sm text-text-strong">{open.returnComment}</p>}
              {open.canResubmit && (
                <Button size="sm" className="mt-2" onClick={() => setResubmitting(true)}>{t('topics.resubmit')}</Button>
              )}
            </div>
          )}
          <RequestTimeline timeline={open.timeline} contentChangedAt={open.contentChangedAt} createdAt={open.createdAt} studentName={open.studentName} />
        </div>
      )}

      {approved && open && (
        <div className="mt-4 rounded-card bg-surface p-4">
          <h3 className="text-sm font-semibold text-heading">{t('topics.changeRequested')}</h3>
          <p className="mt-1 text-sm text-text-strong">{open.topicTitle}</p>
          <p className="text-xs text-text-muted">{open.supervisorName}</p>
          <p className="text-xs text-text-muted">{open.directionName}</p>
          <ApprovalSeats seats={open.seats} />
          <div className="mt-2 flex items-center gap-2">
            <ReservationStatusBadge status={open.status} />
            {open.canCancel && (
              <Button variant="secondary" size="sm" onClick={() => setCancelling(open)}>{t('topics.cancel')}</Button>
            )}
          </div>
          {open.status === 'Returned' && (
            <div className="mt-2 rounded-card bg-warning-soft p-3">
              <p className="text-sm font-semibold text-warning">{t('topics.returnedNotice')}</p>
              {open.returnComment && <p className="mt-1 text-sm text-text-strong">{open.returnComment}</p>}
              {open.canResubmit && (
                <Button size="sm" className="mt-2" onClick={() => setResubmitting(true)}>{t('topics.resubmit')}</Button>
              )}
            </div>
          )}
          <RequestTimeline timeline={open.timeline} contentChangedAt={open.contentChangedAt} createdAt={open.createdAt} studentName={open.studentName} />
        </div>
      )}

      {lastRejected && (
        <div className="mt-4 rounded-card bg-warning-soft p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-warning">{t('topics.lastRejected')}</h3>
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              aria-label={t('topics.dismissRejection')}
              onClick={() => dismissRejection(lastRejected.id)}
            />
          </div>
          <p className="mt-1 text-sm text-text-strong">{lastRejected.topicTitle}</p>
          {lastRejected.decidedAt && (
            <p className="mt-1 text-xs text-text-muted">
              {t('topics.decidedAt')} {dateFormat.format(new Date(lastRejected.decidedAt))}
            </p>
          )}
          <p className="mt-1 text-sm text-text-strong">
            {lastRejected.decisionComment || t('topics.rejectedNoComment')}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        title={t('topics.cancel')}
        message={cancelling ? t('topics.cancelConfirm', { title: cancelling.topicTitle }) : ''}
        loading={isCancelling}
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelling(null)}
      />

      <WordingModal
        open={resubmitting && open !== null}
        title={t('topics.resubmit')}
        hint={t('topics.resubmitHint')}
        confirmLabel={t('topics.resubmit')}
        initialTitle={open?.topicTitle ?? ''}
        initialDescription={open?.topicDescription ?? null}
        loading={isResubmitting}
        onConfirm={(request) => void confirmResubmit(request)}
        onClose={() => setResubmitting(false)}
      />
    </Card>
  )
}
