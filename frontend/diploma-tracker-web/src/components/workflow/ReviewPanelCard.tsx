import { Plus, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import { getStep, removePanelReviewer } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge, type BadgeTone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/useToast'
import { AddReviewerDialog } from './AddReviewerDialog'
import type { PanelSeat, StepDetails } from '../../api/types'

type ReviewPanelCardProps = {
  step: StepDetails
  onChanged: (details: StepDetails) => void
}

const stateTones: Record<PanelSeat['state'], BadgeTone> = {
  Approved: 'success',
  Returned: 'warning',
  Waiting: 'neutral'
}

export function ReviewPanelCard({ step, onChanged }: ReviewPanelCardProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<PanelSeat | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  const confirmRemove = async () => {
    if (!removing?.reviewerId) return
    setIsRemoving(true)
    try {
      const details = await removePanelReviewer(step.id, removing.reviewerId)
      setRemoving(null)
      // M10: a removal can leave every remaining seat satisfied and approve the step at once - say
      // so, rather than letting a plain "reviewer removed" toast hide that the step just closed.
      toast.success(details.status === 'Approved'
        ? t('steps.reviewerRemovedApproved', { mark: details.mark ?? '—' })
        : t('steps.reviewerRemoved'))
      onChanged(details)
    } catch (err) {
      // M4: on a 409 (e.g. step.alreadyApproved because someone else's decision just completed the
      // panel), re-fetch the step so the page reflects reality instead of keeping this reviewer on
      // screen as removable.
      if (err instanceof ApiError && err.status === 409) {
        setRemoving(null)
        try {
          onChanged(await getStep(step.id))
        } catch {
          // Ignore - the toast below still explains the original failure.
        }
      }
      toast.error(errorMessage(err))
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <Card
      title={t('steps.panelTitle')}
      className="mb-6"
      actions={
        step.canManagePanel ? (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setIsAddOpen(true)}>
            {t('steps.addReviewer')}
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col divide-y divide-border-subtle">
        {step.panel.map((seat, index) => (
          <li key={`${seat.seat}-${seat.reviewerId ?? index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-strong">{seat.reviewerName ?? t('steps.noSupervisor')}</p>
              <p className="text-xs text-text-muted">{t(`steps.seat.${seat.seat}`)}</p>
            </div>
            <div className="flex items-center gap-2">
              {seat.reviewerId && !seat.isActive && <Badge tone="danger">{t('steps.inactiveReviewer')}</Badge>}
              <Badge tone={stateTones[seat.state]}>
                {seat.state === 'Approved' ? t('steps.seatState.Approved', { mark: seat.mark ?? '—' }) : t(`steps.seatState.${seat.state}`)}
              </Badge>
              {seat.canRemove && (
                <Button variant="ghost" size="sm" icon={UserMinus} aria-label={t('steps.removeReviewer')} onClick={() => setRemoving(seat)} />
              )}
            </div>
          </li>
        ))}
      </ul>

      {isAddOpen && (
        <AddReviewerDialog
          step={step}
          onClose={() => setIsAddOpen(false)}
          onAdded={(details) => {
            setIsAddOpen(false)
            onChanged(details)
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('steps.removeReviewer')}
        message={t('steps.removeReviewerConfirm', { name: removing?.reviewerName ?? '' })}
        confirmLabel={t('steps.removeReviewer')}
        loading={isRemoving}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  )
}
