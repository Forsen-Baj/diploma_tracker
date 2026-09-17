import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function TextField({ label, hint, error, id, className, ...rest }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <FieldShell label={label} htmlFor={inputId} hint={hint} error={error}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-description` : undefined}
        className={cn(controlClasses, Boolean(error) && 'border-danger', className)}
        {...rest}
      />
    </FieldShell>
  )
}
