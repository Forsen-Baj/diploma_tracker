import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { getDocumentCounts } from '../../api/documentsApi'

// Fix wave M6: a route change already re-reads the count, but *Pass on*, *Send back* and *Done* all
// happen on `/documents/:id` without leaving it. A tiny pub-sub lets that page ask every mounted
// badge to re-read right after a write succeeds, instead of the badge showing a document the user
// no longer holds until they navigate elsewhere.
const listeners = new Set<() => void>()

export function refreshDocumentCounts(): void {
  listeners.forEach((listener) => listener())
}

/** Documents waiting for the user (review + signing), re-read on every route change and whenever
 *  refreshDocumentCounts() is called. The badge is a hint: a failed read keeps the last value
 *  rather than showing an error in the header. */
export function useDocumentCounts(enabled: boolean): number {
  const location = useLocation()
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
    const listener = () => setTick((value) => value + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let isCurrent = true
    getDocumentCounts()
      .then((counts) => {
        if (isCurrent) setCount(counts.review + counts.signing)
      })
      .catch(() => undefined)
    return () => {
      isCurrent = false
    }
  }, [enabled, location.pathname, location.search, tick])

  return count
}
