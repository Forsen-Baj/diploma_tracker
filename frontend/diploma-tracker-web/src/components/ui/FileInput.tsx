import { useId, type ReactNode } from 'react'
import { cn } from './cn'
import { FieldShell } from './FieldShell'

type FileInputProps = {
  label: ReactNode
  accept?: string
  multiple?: boolean
  onChange: (files: File[]) => void
  resetKey?: number
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function FileInput({ label, accept, multiple, onChange, resetKey, hint, error, disabled }: FileInputProps) {
  const id = useId()

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <input
        key={resetKey}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-description` : undefined}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        className={cn(
          'block w-full text-sm text-text-strong',
          'file:mr-3 file:cursor-pointer file:rounded-control file:border-0 file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-strong hover:file:bg-surface-subtle',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />
    </FieldShell>
  )
}
