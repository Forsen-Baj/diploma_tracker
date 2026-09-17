import { cn } from './cn'

export type SegmentedOption = {
  value: string
  label: string
}

type SegmentedControlProps = {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  size?: 'sm' | 'md'
}

export function SegmentedControl({ options, value, onChange, ariaLabel, size = 'md' }: SegmentedControlProps) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-pill bg-surface p-1 shadow-inset">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-control font-medium transition-colors',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-xs',
              selected ? 'bg-background text-text-strong shadow-subtle' : 'text-text-muted hover:text-text-strong'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
