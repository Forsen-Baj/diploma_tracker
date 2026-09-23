import { cn } from '../ui/cn'

export type ProportionSegment = {
  key: string
  label: string
  value: number
  className: string
}

// A stacked bar built from the design tokens. No charting library is added (§7.5).
export function ProportionBar({ segments }: { segments: ProportionSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  if (total === 0) {
    return <div className="h-2 w-full rounded-pill bg-surface" />
  }

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-pill bg-surface">
        {segments.filter((segment) => segment.value > 0).map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full', segment.className)}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5 text-xs text-text-muted">
            <span className={cn('size-2 rounded-pill', segment.className)} aria-hidden />
            {segment.label} {segment.value}
          </span>
        ))}
      </div>
    </div>
  )
}
