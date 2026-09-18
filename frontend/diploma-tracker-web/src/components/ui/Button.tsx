import { Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'
import { Tooltip } from './Tooltip'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-strong',
  secondary: 'border border-border-subtle bg-background text-text-strong hover:bg-surface',
  ghost: 'bg-transparent text-accent hover:bg-surface',
  danger: 'bg-danger text-white hover:opacity-90'
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm'
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const ariaLabel = rest['aria-label']
  const isIconOnly = Boolean(Icon) && !children

  const button = (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-control font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  )

  if (isIconOnly && ariaLabel) {
    if (disabled || loading) {
      // A disabled button fires no pointer or focus events, so the tooltip is attached to a
      // hoverable/focusable wrapper instead; the button itself stays disabled and unclickable.
      return (
        <Tooltip content={ariaLabel}>
          <span tabIndex={0} className="inline-flex rounded-control">
            {button}
          </span>
        </Tooltip>
      )
    }
    return <Tooltip content={ariaLabel}>{button}</Tooltip>
  }

  return button
}
