import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className={cn('w-full rounded-card bg-background p-6 shadow-xl', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <DialogTitle className="text-lg font-semibold text-heading">{title}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-control p-1 text-text-muted hover:bg-surface hover:text-text-strong"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
