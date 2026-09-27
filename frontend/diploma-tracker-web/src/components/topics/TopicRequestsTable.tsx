import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/Badge'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { ApprovalSeats } from './ApprovalSeats'
import { RequestActions } from './RequestActions'
import type { Reservation } from '../../api/types'

type TopicRequestsTableProps = {
  rows: Reservation[]
  loading: boolean
  onChanged: () => void
}

/** Open topic requests with their three approvals (design 2026-09-27 §5.4); the ones waiting for
 *  the caller come first. */
export function TopicRequestsTable({ rows, loading, onChanged }: TopicRequestsTableProps) {
  const { t, i18n } = useTranslation()
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )
  const sorted = useMemo(() => [...rows].sort((a, b) => Number(b.canDecide) - Number(a.canDecide)), [rows])

  const columns: DataTableColumn<Reservation>[] = [
    {
      key: 'student',
      header: t('topics.student'),
      render: (reservation) => (
        <div>
          <p>{reservation.studentName}</p>
          <p className="text-xs text-text-muted">{reservation.groupCode}</p>
        </div>
      )
    },
    {
      key: 'topic',
      header: t('topics.title'),
      render: (reservation) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span>{reservation.topicTitle}</span>
            {reservation.origin === 'StudentProposal' && <Badge tone="neutral">{t('topics.proposalBadge')}</Badge>}
            {reservation.currentTopicId && <Badge tone="warning">{t('topics.changeBadge')}</Badge>}
          </div>
          <p className="text-xs text-text-muted">{reservation.directionName} · {reservation.supervisorName}</p>
          {reservation.currentTopicId && (
            <p className="text-xs text-text-muted">{t('topics.currentTopicLabel', { title: reservation.currentTopicTitle })}</p>
          )}
          <ApprovalSeats seats={reservation.seats} />
        </div>
      )
    },
    { key: 'requestedAt', header: t('topics.requestedAt'), render: (reservation) => dateFormat.format(new Date(reservation.createdAt)) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (reservation) => <RequestActions reservation={reservation} onChanged={onChanged} />
    }
  ]

  return (
    <DataTable
      columns={columns}
      rows={sorted}
      getRowKey={(reservation) => reservation.id}
      loading={loading}
      emptyState={<EmptyState message={t('topics.noRequests')} />}
    />
  )
}
