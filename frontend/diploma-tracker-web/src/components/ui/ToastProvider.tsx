import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'
import { ToastContext, type ToastApi, type ToastTone } from './toastContext'

type ToastItem = {
  id: number
  tone: ToastTone
  message: string
}

const DISMISS_AFTER_MS = 4000

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: 'text-success' },
  error: { icon: XCircle, className: 'text-danger' },
  info: { icon: Info, className: 'text-accent' }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timeoutIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    const pendingTimeoutIds = timeoutIds.current
    return () => {
      pendingTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
      pendingTimeoutIds.clear()
    }
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, tone, message }])
    const timeoutId = window.setTimeout(() => {
      timeoutIds.current.delete(timeoutId)
      dismiss(id)
    }, DISMISS_AFTER_MS)
    timeoutIds.current.add(timeoutId)
  }, [dismiss])

  const api = useMemo<ToastApi>(() => ({
    success: (message) => show('success', message),
    error: (message) => show('error', message),
    info: (message) => show('info', message)
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((toast) => {
          const { icon: Icon, className } = toneStyles[toast.tone]
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-control border border-border-subtle bg-background px-4 py-3 text-sm text-text-strong shadow-lg"
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden />
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t('common.close')}
                className="shrink-0 rounded-control p-0.5 text-text-muted hover:bg-surface hover:text-text-strong"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
