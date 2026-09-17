import { useEffect, useRef, useState } from 'react'
import { cn } from './cn'
import { Tooltip } from './Tooltip'

type TruncatedTextProps = {
  text: string
  className?: string
}

/**
 * Renders `text` on a single line with an ellipsis when it overflows its container, and shows
 * the full text in a `Tooltip` only when it is actually truncated. Overflow is measured on
 * mount and whenever the element is resized.
 */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }

    const measure = () => setIsTruncated(node.scrollWidth > node.clientWidth)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  return (
    <Tooltip content={text} disabled={!isTruncated}>
      <span ref={ref} className={cn('block min-w-0 truncate', className)}>
        {text}
      </span>
    </Tooltip>
  )
}
