import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../ui/Modal'
import { TopicStatusBadge } from './TopicStatusBadge'
import type { Topic } from '../../api/types'

type TopicDetailsModalProps = {
  topic: Topic | null
  open: boolean
  onClose: () => void
  footer?: ReactNode
}

export function TopicDetailsModal({ topic, open, onClose, footer }: TopicDetailsModalProps) {
  const { t } = useTranslation()

  return (
    <Modal open={open} onClose={onClose} title={topic?.title ?? ''} footer={footer}>
      {topic && (
        <div className="flex flex-col gap-3 text-sm text-text-strong">
          <div className="flex items-center gap-2">
            <TopicStatusBadge status={topic.status} />
          </div>
          <p><span className="font-medium text-heading">{t('topics.supervisor')}:</span> {topic.supervisorName}</p>
          <p><span className="font-medium text-heading">{t('topics.department')}:</span> {topic.departmentName} · {topic.facultyName}</p>
          <p className="whitespace-pre-line text-text-strong">{topic.description || t('common.noDescription')}</p>
        </div>
      )}
    </Modal>
  )
}
