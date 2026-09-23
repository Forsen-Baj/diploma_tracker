import { useEffect, useId, useRef, type ReactNode } from 'react'

type CheckboxProps = {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel?: string
  indeterminate?: boolean
}

export function Checkbox({ label, checked, onChange, disabled, ariaLabel, indeterminate }: CheckboxProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate)
    }
  }, [indeterminate])

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
      />
      {label ? <label htmlFor={id} className="text-sm text-text-strong">{label}</label> : null}
    </div>
  )
}
