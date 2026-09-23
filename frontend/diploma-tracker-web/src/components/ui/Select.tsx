import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import { controlClasses } from './styles'
import { TruncatedText } from './TruncatedText'

export type SelectOption = {
  value: string
  label: string
}

type SelectProps = {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function Select({ label, value, onChange, options, placeholder, hint, error, disabled }: SelectProps) {
  const { t } = useTranslation()
  const id = useId()
  const selected = options.find((option) => option.value === value)

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <ListboxButton
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-description` : undefined}
          className={cn(controlClasses, 'flex items-center justify-between text-left', Boolean(error) && 'border-danger')}
        >
          <TruncatedText text={selected?.label ?? placeholder ?? ''} className={cn(!selected && 'text-text-muted')} />
          <ChevronDown className="size-4 shrink-0 text-text-muted" aria-hidden />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-50 mt-1 max-h-64 w-(--button-width) overflow-auto rounded-control border border-border-subtle bg-background p-1 shadow-lg focus:outline-none"
        >
          {options.length === 0 && (
            <div role="option" aria-disabled="true" className="px-3 py-2 text-sm text-text-muted">
              {t('common.noOptions')}
            </div>
          )}
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="group flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-strong data-focus:bg-surface data-selected:font-semibold"
            >
              <span className="truncate">{option.label}</span>
              <Check className="invisible size-4 text-accent group-data-selected:visible" aria-hidden />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </FieldShell>
  )
}
