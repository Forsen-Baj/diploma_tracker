import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { cn } from '../ui/cn'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import type { GroupSort, GroupSortKey } from './groupSort'
import type { DashboardGroupRow } from '../../api/types'

type GroupTableProps = {
  rows: DashboardGroupRow[]
  sort: GroupSort
  onSortChange: (key: GroupSortKey) => void
}

// The seven-column group breakdown shown, identically, on the teacher and the administrator
// dashboard (task-15 brief, Step 5). Defined once here and imported by both pages.
export function GroupTable({ rows, sort, onSortChange }: GroupTableProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const sortableHeader = (key: GroupSortKey, label: string) => {
    const isActive = sort.key === key
    const Icon = isActive ? (sort.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
    return (
      <button type="button" onClick={() => onSortChange(key)} className="inline-flex items-center gap-1 text-left">
        {label}
        <Icon className={cn('size-3.5', isActive ? 'text-heading' : 'text-text-muted')} aria-hidden />
      </button>
    )
  }

  const columns: DataTableColumn<DashboardGroupRow>[] = [
    {
      key: 'code',
      header: sortableHeader('code', t('groups.code')),
      render: (row) => (
        <div>
          <div className="font-semibold text-text-strong">{row.groupCode}</div>
          <div className="text-xs text-text-muted">{row.academicYear}</div>
        </div>
      )
    },
    {
      key: 'department',
      header: sortableHeader('department', t('groups.department')),
      render: (row) => row.departmentName
    },
    {
      key: 'students',
      header: sortableHeader('students', t('dashboard.studentsColumn')),
      render: (row) => row.studentCount
    },
    {
      key: 'approvedTopics',
      header: sortableHeader('approvedTopics', t('dashboard.approvedTopics')),
      render: (row) => `${row.approvedTopicCount}/${row.studentCount}`
    },
    {
      key: 'stepsApproved',
      header: sortableHeader('stepsApproved', t('dashboard.stepsApproved')),
      render: (row) => t('review.approvedOf', { approved: row.stepsApproved, total: row.stepsTotal })
    },
    {
      key: 'waiting',
      header: sortableHeader('waiting', t('dashboard.waiting')),
      render: (row) => row.waitingReviews
    },
    {
      key: 'late',
      header: sortableHeader('late', t('dashboard.late')),
      render: (row) => row.lateSteps
    },
    {
      key: 'overdue',
      header: sortableHeader('overdue', t('dashboard.overdue')),
      render: (row) => <span className={row.overdueSteps > 0 ? 'text-danger' : undefined}>{row.overdueSteps}</span>
    }
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.groupId}
      emptyState={<EmptyState message={t('dashboard.groupsEmpty')} />}
      onRowClick={(row) => navigate(`/groups/${row.groupId}/progress`)}
    />
  )
}
