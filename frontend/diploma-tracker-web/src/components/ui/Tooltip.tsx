import { cloneElement, useEffect, useId, useRef, useState } from 'react'
import type { HTMLAttributes, MutableRefObject, ReactElement, ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'

const SHOW_DELAY_MS = 300
const VIEWPORT_MARGIN_PX = 8
const TOOLTIP_MAX_WIDTH_PX = 320 // matches Tailwind's max-w-xs
const MIN_SPACE_ABOVE_PX = 40 // enough room for a single-line tooltip plus the gap

type TooltipPlacement = 'top' | 'bottom'

type TooltipProps<E extends HTMLElement> = {
  content: ReactNode
  children: ReactElement<HTMLAttributes<E>>
  disabled?: boolean
}

/**
 * Wraps a trigger element and shows a small bubble with `content` above it (or below it, when
 * there isn't enough room above): after a short hover delay, immediately on keyboard focus,
 * hidden on leave/blur/Escape. The bubble is rendered through a portal (positioned with fixed
 * coordinates) so it is never clipped by an `overflow` ancestor such as a scrollable table or a
 * Headless UI listbox, and it never adds any element around the trigger, so it cannot shift
 * layout. The horizontal position is clamped so the bubble never overflows the viewport edges.
 */
export function Tooltip<E extends HTMLElement = HTMLElement>({ content, children, disabled }: TooltipProps<E>) {
  const id = useId()
  const triggerRef = useRef<E | null>(null)
  const showTimeoutRef = useRef<number | undefined>(undefined)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; placement: TooltipPlacement }>({
    top: 0,
    left: 0,
    placement: 'top'
  })

  const enabled = !disabled && content !== undefined && content !== null && content !== ''

  const updatePosition = () => {
    const node = triggerRef.current
    if (!node) {
      return
    }
    const rect = node.getBoundingClientRect()
    const halfWidth = TOOLTIP_MAX_WIDTH_PX / 2
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, halfWidth + VIEWPORT_MARGIN_PX),
      window.innerWidth - halfWidth - VIEWPORT_MARGIN_PX
    )
    const placement: TooltipPlacement = rect.top < MIN_SPACE_ABOVE_PX ? 'bottom' : 'top'
    const top = placement === 'top' ? rect.top : rect.bottom
    setPosition({ top, left, placement })
  }

  const clearShowTimeout = () => {
    window.clearTimeout(showTimeoutRef.current)
    showTimeoutRef.current = undefined
  }

  const show = (immediate: boolean) => {
    if (!enabled) {
      return
    }
    clearShowTimeout()
    if (immediate) {
      updatePosition()
      setVisible(true)
      return
    }
    showTimeoutRef.current = window.setTimeout(() => {
      updatePosition()
      setVisible(true)
    }, SHOW_DELAY_MS)
  }

  const hide = () => {
    clearShowTimeout()
    setVisible(false)
  }

  useEffect(() => clearShowTimeout, [])

  useEffect(() => {
    if (!visible) {
      return
    }
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [visible])

  if (!enabled) {
    return children
  }

  const childRef = (children as { ref?: Ref<E> }).ref
  const setRef = (node: E | null) => {
    triggerRef.current = node
    if (typeof childRef === 'function') {
      childRef(node)
    } else if (childRef) {
      (childRef as MutableRefObject<E | null>).current = node
    }
  }

  const extraProps: Partial<HTMLAttributes<E>> = {
    'aria-describedby': visible ? id : undefined,
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event)
      show(false)
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event)
      hide()
    },
    onFocus: (event) => {
      children.props.onFocus?.(event)
      show(true)
    },
    onBlur: (event) => {
      children.props.onBlur?.(event)
      hide()
    },
    onKeyDown: (event) => {
      children.props.onKeyDown?.(event)
      if (event.key === 'Escape') {
        hide()
      }
    }
  }

  const trigger = cloneElement(children, { ...extraProps, ref: setRef } as never)

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            style={{ top: position.top, left: position.left }}
            className={cn(
              'pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 whitespace-normal break-words rounded-control bg-text-strong px-2 py-1 text-left text-xs text-white shadow-lg',
              position.placement === 'top' ? '-translate-y-[calc(100%+8px)]' : 'translate-y-2'
            )}
          >
            {content}
          </span>,
          document.body
        )}
    </>
  )
}
