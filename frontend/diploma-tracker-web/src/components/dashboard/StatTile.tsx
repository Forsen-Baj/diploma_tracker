import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../ui/cn'

type StatTileProps = {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: 'neutral' | 'warning' | 'danger'
  onClick?: () => void
}

const toneClasses = {
  neutral: 'text-heading',
  warning: 'text-warning',
  danger: 'text-danger'
} as const

export function StatTile({ label, value, hint, icon: Icon, tone = 'neutral', onClick }: StatTileProps) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-text-muted" aria-hidden />}
        <p className="text-xs font-medium text-text-muted">{label}</p>
      </div>
      <p className={cn('mt-1 text-2xl font-semibold', toneClasses[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </>
  )

  if (!onClick) {
    return <div className="rounded-card bg-surface p-4">{content}</div>
  }

  return (
    <button type="button" onClick={onClick} className="rounded-card bg-surface p-4 text-left hover:bg-surface/80">
      {content}
    </button>
  )
}
