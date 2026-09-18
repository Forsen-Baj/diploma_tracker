import { Inbox, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: LucideIcon
  message: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon = Inbox, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center">
      <Icon className="size-8 text-text-muted" aria-hidden />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  )
}
