import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from './cn'
import { FieldShell } from './FieldShell'
import type { SelectOption } from './Select'
import { controlClasses } from './styles'

type MultiSelectProps = {
  label: ReactNode
  values: string[]
  onChange: (values: string[]) => void
  options: SelectOption[]
  placeholder?: string
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
}

export function MultiSelect({ label, values, onChange, options, placeholder, hint, error, disabled }: MultiSelectProps) {
  const { t } = useTranslation()
  const id = useId()
  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label)

  return (
    <FieldShell label={label} htmlFor={id} hint={hint} error={error}>
      <Listbox value={values} onChange={onChange} multiple disabled={disabled}>
        <ListboxButton
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-description` : undefined}
          className={cn(controlClasses, 'flex h-auto min-h-10 items-center justify-between py-2 text-left', Boolean(error) && 'border-danger')}
        >
          <span className={cn('line-clamp-2', selectedLabels.length === 0 && 'text-text-muted')}>
            {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder ?? ''}
          </span>
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
