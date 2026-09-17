import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { Modal } from './Modal'

type ConfirmDialogProps = {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'danger', loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{t('common.cancel')}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-text-strong">{message}</p>
    </Modal>
  )
}
