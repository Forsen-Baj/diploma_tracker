import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'

type DecisionCommentModalProps = {
  open: boolean
  title: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: (comment?: string) => void
  onClose: () => void
}

export function DecisionCommentModal({ open, title, confirmLabel, tone = 'primary', loading = false, onConfirm, onClose }: DecisionCommentModalProps) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (open) setComment('')
  }, [open])

  const close = () => {
    if (loading) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={() => onConfirm(optional(comment))}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Textarea
        label={t('topics.comment')}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        hint={t('common.optional')}
      />
    </Modal>
  )
}
