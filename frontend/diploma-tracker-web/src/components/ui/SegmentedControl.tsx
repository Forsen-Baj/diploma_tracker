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
              // Review I2 (task 7 fix round 1): the track is rounded-pill but the selected segment
              // used rounded-control (8px) - inside a fully rounded track with only p-1, the
              // thumb's tighter corners visibly cut into the pill curve. rounded-pill on the
              // segment matches the track exactly; an inset focus ring (never clippable) replaces
              // the browser's default outside outline.
              'rounded-pill font-medium transition-colors',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
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
