import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getMyStudentTasks } from '../api/groupTasksApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { SegmentedControl, type SegmentedOption } from '../components/ui/SegmentedControl'
import { displayStatusTone } from '../components/ui/statusTones'
import { formatPeriod } from '../utils/period'
import type { MyStudentTask } from '../api/types'

const statusFilters = ['All', 'Pending', 'Submitted', 'Approved', 'Returned', 'MissedDeadline'] as const
type StatusFilter = (typeof statusFilters)[number]

export function StudentMyTasksPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState<MyStudentTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => a.order - b.order), [tasks])

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'All') {
      return sortedTasks
    }
    return sortedTasks.filter((task) => task.displayStatus === statusFilter)
  }, [sortedTasks, statusFilter])

  const statusFilterOptions: SegmentedOption[] = statusFilters.map((status) => ({
    value: status,
    label: status === 'All' ? t('myTasks.status.all') : t(`myTasks.status.${status}` as never)
  }))

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setTasks(await getMyStudentTasks())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openTask = (task: MyStudentTask) => navigate(`/student/tasks/${task.id}`)

  const columns: DataTableColumn<MyStudentTask>[] = [
    { key: 'order', header: t('myTasks.order'), render: (task) => task.order },
    { key: 'title', header: t('myTasks.step'), render: (task) => task.title },
    { key: 'period', header: t('myTasks.period'), render: (task) => formatPeriod(task.startDate, task.deadline, dateFormat) },
    {
      key: 'status',
      header: t('myTasks.status.label'),
      render: (task) => <Badge tone={displayStatusTone[task.displayStatus] ?? 'neutral'}>{t(`myTasks.status.${task.displayStatus}` as never)}</Badge>
    },
    { key: 'mark', header: t('myTasks.mark'), render: (task) => task.currentMark ?? '—' },
    {
      key: 'actions',
      header: '',
      render: (task) => (
        <Button variant="ghost" size="sm" icon={ArrowRight} aria-label={t('myTasks.open')} onClick={() => openTask(task)} />
      )
    }
  ]

  return (
    <>
      <PageHeader title={t('myTasks.title')} />

      <Card>
        <div className="mb-4">
          <SegmentedControl
            ariaLabel={t('myTasks.status.label')}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={statusFilterOptions}
          />
        </div>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={filteredTasks}
            getRowKey={(task) => task.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('myTasks.noTasks')} />}
            onRowClick={openTask}
          />
        )}
      </Card>
    </>
  )
}
