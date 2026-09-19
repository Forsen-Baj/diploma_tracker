import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { approveSubmission, returnSubmission } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../ui/useToast'
import type { StepDetails } from '../../api/types'

type DecisionPanelProps = {
  step: StepDetails
  onDecided: (details: StepDetails) => void
}

type ConfirmAction = 'approve' | 'return' | null

export function DecisionPanel({ step, onDecided }: DecisionPanelProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [mark, setMark] = useState('')
  const [comment, setComment] = useState('')
  const [markError, setMarkError] = useState('')
  const [commentError, setCommentError] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [isDeciding, setIsDeciding] = useState(false)

  const validateApprove = (): boolean => {
    setMarkError('')
    setCommentError('')

    if (mark.trim() === '') {
      setMarkError(t('errors.review.markRequired'))
      return false
    }

    const value = Number(mark)
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      setMarkError(t('errors.review.markOutOfRange'))
      return false
    }

    return true
  }

  const validateReturn = (): boolean => {
    setMarkError('')
    setCommentError('')

    if (comment.trim() === '') {
      setCommentError(t('errors.review.commentRequired'))
      return false
    }

    return true
  }

  const openApprove = () => {
    if (validateApprove()) {
      setConfirmAction('approve')
    }
  }

  const openReturn = () => {
    if (validateReturn()) {
      setConfirmAction('return')
    }
  }

  const confirmDecision = async () => {
    if (!confirmAction || !step.pendingSubmissionId) {
      return
    }

    setIsDeciding(true)
    try {
      const details = confirmAction === 'approve'
        ? await approveSubmission(step.pendingSubmissionId, Number(mark), comment.trim() || undefined)
        : await returnSubmission(step.pendingSubmissionId, comment.trim())
      setConfirmAction(null)
      setMark('')
      setComment('')
      toast.success(t(confirmAction === 'approve' ? 'steps.approved' : 'steps.returned'))
      onDecided(details)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeciding(false)
    }
  }

  return (
    <Card title={t('steps.reviewTitle')}>
      <div className="flex flex-col gap-4">
        <TextField
          label={t('steps.mark')}
          type="number"
          min={0}
          max={100}
          step={1}
          value={mark}
          onChange={(event) => setMark(event.target.value)}
          error={markError}
        />
        <Textarea
          label={t('steps.comment')}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          error={commentError}
        />
        <div className="flex items-center gap-2">
          <Button onClick={openApprove}>{t('steps.approve')}</Button>
          <Button variant="secondary" onClick={openReturn}>{t('steps.return')}</Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        title={t(confirmAction === 'return' ? 'steps.return' : 'steps.approve')}
        message={confirmAction === 'approve' ? t('steps.approveConfirm', { mark }) : t('steps.returnConfirm')}
        tone="primary"
        loading={isDeciding}
        onConfirm={() => void confirmDecision()}
        onCancel={() => setConfirmAction(null)}
      />
    </Card>
  )
}
