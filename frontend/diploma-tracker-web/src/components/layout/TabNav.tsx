import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

export type TabItem = {
  to: string
  label: string
  badge?: number
  badgeLabel?: string
}

export function TabNav({ items }: { items: TabItem[] }) {
  return (
    <nav className="flex items-center justify-center gap-8">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'inline-flex items-center gap-1.5 border-b-2 py-1 text-sm text-text-strong transition-colors',
              isActive ? 'border-text-strong font-bold' : 'border-transparent font-medium hover:text-accent'
            )
          }
        >
          {item.label}
          {item.badge ? (
            <span
              aria-label={item.badgeLabel}
              className="inline-flex min-w-5 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-accent-contrast"
            >
              {item.badge}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  )
}
