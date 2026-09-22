import { CheckCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../api/groupsApi'
import { getReviewQueue } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { SegmentedControl, type SegmentedOption } from '../components/ui/SegmentedControl'
import { Select, type SelectOption } from '../components/ui/Select'
import type { Group, Paged, ReviewQueueItem } from '../api/types'

type LateFilter = 'all' | 'late' | 'onTime'

const emptyPage: Paged<ReviewQueueItem> = { items: [], page: 1, pageSize: 25, total: 0 }

export function ReviewQueuePage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [data, setData] = useState<Paged<ReviewQueueItem>>(emptyPage)
  const [groupId, setGroupId] = useState('')
  const [lateFilter, setLateFilter] = useState<LateFilter>('all')
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const load = async () => {
      try {
        setGroups(await getGroups())
      } catch {
        // The group filter is a convenience; its failure must not hide the review queue itself.
      }
    }
    void load()
  }, [])

  useEffect(() => {
    const requestId = ++requestRef.current

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const late = lateFilter === 'all' ? undefined : lateFilter === 'late'
        const result = await getReviewQueue(groupId || undefined, late, page)
        if (requestRef.current !== requestId) return
        setData(result)
        if (result.items.length === 0 && result.total > 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(result.total / result.pageSize)))
        }
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, lateFilter, page])

  const handleGroupChange = (value: string) => {
    setGroupId(value)
    setPage(1)
  }

  const handleLateFilterChange = (value: string) => {
    setLateFilter(value as LateFilter)
    setPage(1)
  }

  const groupOptions: SelectOption[] = [
    { value: '', label: t('review.allGroups') },
    ...groups.map((group) => ({ value: group.id, label: group.code }))
  ]

  const lateOptions: SegmentedOption[] = [
    { value: 'all', label: t('review.filterAll') },
    { value: 'late', label: t('review.filterLate') },
    { value: 'onTime', label: t('review.filterOnTime') }
  ]

  const openItem = (item: ReviewQueueItem) => navigate(`/review/steps/${item.studentTaskId}`)

  const columns: DataTableColumn<ReviewQueueItem>[] = [
    { key: 'student', header: t('steps.student'), render: (item) => item.studentName },
    { key: 'group', header: t('review.group'), render: (item) => item.groupCode },
    { key: 'step', header: t('steps.step'), render: (item) => `${item.stepOrder}. ${item.stepTitle}` },
    { key: 'version', header: t('review.version'), render: (item) => item.version },
    { key: 'submittedAt', header: t('review.submittedAt'), render: (item) => dateTimeFormat.format(new Date(item.submittedAt)) },
    {
      key: 'late',
      header: <span className="sr-only">{t('steps.late')}</span>,
      render: (item) => (item.isLate ? <Badge tone="warning">{t('steps.late')}</Badge> : null)
    }
  ]

  return (
    <>
      <PageHeader title={t('review.title')} description={t('review.subtitle')} />

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1">
            <Select label={t('review.group')} value={groupId} onChange={handleGroupChange} options={groupOptions} />
          </div>
          <SegmentedControl
            ariaLabel={t('review.lateFilterLabel')}
            value={lateFilter}
            onChange={handleLateFilterChange}
            options={lateOptions}
          />
        </div>

        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <>
            <DataTable
              columns={columns}
              rows={data.items}
              getRowKey={(item) => item.submissionId}
              loading={isLoading}
              emptyState={<EmptyState icon={CheckCheck} message={t('review.empty')} />}
              onRowClick={openItem}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} disabled={isLoading} />
          </>
        )}
      </Card>
    </>
  )
}
