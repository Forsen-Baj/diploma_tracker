import type { BadgeTone } from '../ui/Badge'
import type { DocumentState } from '../../api/types'

export const documentStateTone: Record<DocumentState, BadgeTone> = {
  WithOwner: 'neutral',
  InCirculation: 'info',
  Completed: 'success'
}
