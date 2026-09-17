import type { ReactNode } from 'react'
import { cn } from './cn'

type CardProps = {
  title?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, actions, className, children }: CardProps) {
  return (
    <section className={cn('rounded-card border border-border-subtle bg-background p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-lg font-semibold text-heading">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
