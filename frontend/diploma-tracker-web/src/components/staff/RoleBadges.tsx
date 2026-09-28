import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import type { RoleAssignment } from '../../api/types'

/** A person's roles as badges, "Викладач · ФІОТ / ІПЗ" (design 2026-09-27, phase 12, §6). */
export function RoleBadges({ assignments }: { assignments: RoleAssignment[] }) {
  const { t } = useTranslation()

  if (assignments.length === 0) {
    return <span className="text-sm text-text-muted">{t('staff.noRoles')}</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {assignments.map((assignment) => (
        <Badge key={assignment.id} tone="info">
          {t(`roles.${assignment.role}`)} · {assignment.scopePath}
        </Badge>
      ))}
    </div>
  )
}
