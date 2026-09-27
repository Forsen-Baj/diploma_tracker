import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'

type RequiredCommentModalProps = {
  open: boolean
  title: ReactNode
  label: string
  confirmLabel: string
  loading?: boolean
  onConfirm: (comment: string) => void
  onClose: () => void
}

export function RequiredCommentModal({ open, title, label, confirmLabel, loading = false, onConfirm, onClose }: RequiredCommentModalProps) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setComment('')
      setError('')
    }
  }, [open])

  const close = () => {
    if (loading) return
    onClose()
  }

  const confirm = () => {
    if (comment.trim() === '') {
      setError(t('validation.required'))
      return
    }
    onConfirm(comment.trim())
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={confirm}>{confirmLabel}</Button>
        </>
      }
    >
      <Textarea label={label} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} error={error} />
    </Modal>
  )
}
