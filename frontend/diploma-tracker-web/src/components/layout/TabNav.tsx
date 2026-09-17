import { NavLink } from 'react-router-dom'
import { cn } from '../ui/cn'

export type TabItem = {
  to: string
  label: string
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
              'border-b-2 py-1 text-sm text-text-strong transition-colors',
              isActive ? 'border-text-strong font-bold' : 'border-transparent font-medium hover:text-accent'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
