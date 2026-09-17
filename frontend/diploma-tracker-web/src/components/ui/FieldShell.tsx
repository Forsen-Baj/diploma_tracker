import type { ReactNode } from 'react'
import { cn } from './cn'

type FieldShellProps = {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}

export function FieldShell({ label, htmlFor, hint, error, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-strong">{label}</label>
      {children}
      {(error || hint) && (
        <p id={`${htmlFor}-description`} className={cn('text-xs', error ? 'text-danger' : 'text-text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
