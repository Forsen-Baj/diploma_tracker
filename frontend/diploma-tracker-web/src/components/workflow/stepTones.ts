import type { BadgeTone } from '../ui/Badge'
import type { StudentTaskStatus } from '../../api/types'

export const stepStatusTone: Record<StudentTaskStatus, BadgeTone> = {
  Pending: 'neutral',
  Submitted: 'info',
  Returned: 'warning',
  Approved: 'success'
}
