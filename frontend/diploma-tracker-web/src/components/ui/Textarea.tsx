import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function Textarea({ label, hint, error, id, className, rows = 4, ...rest }: TextareaProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <FieldShell label={label} htmlFor={inputId} hint={hint} error={error}>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-description` : undefined}
        className={cn(controlClasses, 'h-auto py-2', Boolean(error) && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  )
}
