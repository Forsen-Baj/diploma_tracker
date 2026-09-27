import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { cn } from '../ui/cn'
import { stepStatusTone } from './stepTones'
import type { StudentTaskStatus } from '../../api/types'

type StepStatusBadgeProps = {
  status: StudentTaskStatus
  isLate?: boolean
  isOverdue?: boolean
  /// Follow-up 2026-09-24: stack the status and lateness/overdue badges vertically instead of
  /// side by side, for a narrow, fixed-width matrix cell.
  stack?: boolean
}

export function StepStatusBadge({ status, isLate = false, isOverdue = false, stack = false }: StepStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <span className={cn('inline-flex items-start gap-1.5', stack ? 'flex-col' : 'items-center')}>
      <Badge tone={stepStatusTone[status]}>{t(`steps.status.${status}`)}</Badge>
      {isOverdue ? <Badge tone="danger">{t('steps.overdue')}</Badge> : isLate && <Badge tone="warning">{t('steps.late')}</Badge>}
    </span>
  )
}
