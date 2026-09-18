import type { BadgeTone } from './Badge'

// Mirrors the backend's `StudentTaskStatus` enum (Pending | Submitted | Approved | Returned)
// plus the synthetic `MissedDeadline` display status computed by the API.
export const displayStatusTone: Record<string, BadgeTone> = {
  Pending: 'neutral',
  Submitted: 'info',
  Approved: 'success',
  Returned: 'warning',
  MissedDeadline: 'danger'
}
