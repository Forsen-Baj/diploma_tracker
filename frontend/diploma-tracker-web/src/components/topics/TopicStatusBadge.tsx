import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { topicStatusTone } from './topicTones'
import type { TopicStatus } from '../../api/types'

export function TopicStatusBadge({ status }: { status: TopicStatus }) {
  const { t } = useTranslation()
  return <Badge tone={topicStatusTone[status]}>{t(`topics.status.${status}`)}</Badge>
}
