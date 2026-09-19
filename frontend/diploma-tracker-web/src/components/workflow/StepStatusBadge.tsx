import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { stepStatusTone } from './stepTones'
import type { StudentTaskStatus } from '../../api/types'

type StepStatusBadgeProps = {
  status: StudentTaskStatus
  isLate?: boolean
}

export function StepStatusBadge({ status, isLate = false }: StepStatusBadgeProps) {
  const { t } = useTranslation()

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={stepStatusTone[status]}>{t(`steps.status.${status}`)}</Badge>
      {isLate && <Badge tone="warning">{t('steps.late')}</Badge>}
    </span>
  )
}
