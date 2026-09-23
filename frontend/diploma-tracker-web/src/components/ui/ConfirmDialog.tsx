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
  /** When true, the destructive action is not offered; only a close button is shown. */
  hideConfirm?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  loading = false,
  hideConfirm = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {hideConfirm ? t('common.close') : t('common.cancel')}
          </Button>
          {!hideConfirm && (
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
              {confirmLabel ?? t('common.confirm')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-text-strong">{message}</div>
    </Modal>
  )
}
