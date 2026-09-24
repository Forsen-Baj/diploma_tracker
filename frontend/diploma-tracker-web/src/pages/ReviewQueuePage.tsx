import { Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../api/groupsApi'
import { getReviewStudents } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { SegmentedControl, type SegmentedOption } from '../components/ui/SegmentedControl'
import { Select, type SelectOption } from '../components/ui/Select'
import { StepStatusBadge } from '../components/workflow/StepStatusBadge'
import type { Group, Paged, ReviewStateFilter, ReviewStudentItem } from '../api/types'

type LateFilter = 'all' | 'late' | 'onTime'

const emptyPage: Paged<ReviewStudentItem> = { items: [], page: 1, pageSize: 25, total: 0 }

const stateFilterOptions: ReviewStateFilter[] = ['All', 'Waiting', 'NotStarted', 'Submitted', 'Returned', 'Approved']

// O3: the Review tab is an overview of the caller's students and where each one is (not just
// submissions awaiting a decision - the dashboard keeps its own "waiting for review" list for
// that). Filters and paging follow the page's own earlier pattern.
export function ReviewQueuePage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [data, setData] = useState<Paged<ReviewStudentItem>>(emptyPage)
  const [groupId, setGroupId] = useState('')
  const [lateFilter, setLateFilter] = useState<LateFilter>('all')
  const [stateFilter, setStateFilter] = useState<ReviewStateFilter>('All')
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
        // The group filter is a convenience; its failure must not hide the review tab itself.
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
        const result = await getReviewStudents(groupId || undefined, late, stateFilter, page)
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
  }, [groupId, lateFilter, stateFilter, page])

  const handleGroupChange = (value: string) => {
    setGroupId(value)
    setPage(1)
  }

  const handleLateFilterChange = (value: string) => {
    setLateFilter(value as LateFilter)
    setPage(1)
  }

  const handleStateFilterChange = (value: string) => {
    setStateFilter(value as ReviewStateFilter)
    setPage(1)
  }

  const groupOptions: SelectOption[] = [
    { value: '', label: t('review.allGroups') },
    ...groups.map((group) => ({ value: group.id, label: group.code }))
  ]

  const stateOptions: SelectOption[] = stateFilterOptions.map((value) => ({ value, label: t(`review.stateFilter.${value}`) }))

  const lateOptions: SegmentedOption[] = [
    { value: 'all', label: t('review.filterAll') },
    { value: 'late', label: t('review.filterLate') },
    { value: 'onTime', label: t('review.filterOnTime') }
  ]

  // I1 fix: a row is listed as soon as the caller has SOME grant on the student, but the current
  // step's link is only live when the caller can actually open that specific step (canOpen) -
  // matching CanSeeStudentTaskAsync's narrower, per-task rule. isRowClickable keeps a
  // not-openable row (including a "No steps" row, canOpen defaults false there too) from even
  // showing the pointer-cursor hover styling.
  const isRowOpenable = (item: ReviewStudentItem) => Boolean(item.studentTaskId) && item.canOpen

  const openItem = (item: ReviewStudentItem) => {
    if (isRowOpenable(item)) {
      navigate(`/review/steps/${item.studentTaskId}`)
    }
  }

  const columns: DataTableColumn<ReviewStudentItem>[] = [
    {
      key: 'student',
      header: t('steps.student'),
      render: (item) => (
        <span className="inline-flex items-center gap-2">
          {item.studentName}
          {item.isMyDecision && <Badge tone="info">{t('review.myDecision')}</Badge>}
        </span>
      )
    },
    { key: 'group', header: t('review.group'), render: (item) => item.groupCode },
    {
      key: 'step',
      header: t('review.currentStep'),
      render: (item) => (item.stepOrder !== null ? `${item.stepOrder}. ${item.stepTitle}` : t('review.noSteps'))
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (item) => (item.status ? <StepStatusBadge status={item.status} isLate={item.isLate} isOverdue={item.isOverdue} /> : '—')
    },
    { key: 'version', header: t('review.version'), render: (item) => item.version ?? '—' },
    {
      key: 'submittedAt',
      header: t('review.submittedAt'),
      render: (item) => (item.submittedAt ? dateTimeFormat.format(new Date(item.submittedAt)) : '—')
    },
    {
      key: 'panel',
      header: t('review.panel'),
      render: (item) => (item.panelSize !== null ? t('review.approvedOf', { approved: item.panelApproved, total: item.panelSize }) : '—')
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
          <div className="max-w-xs flex-1">
            <Select label={t('review.stateFilterLabel')} value={stateFilter} onChange={handleStateFilterChange} options={stateOptions} />
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
              getRowKey={(item) => item.studentProfileId}
              loading={isLoading}
              emptyState={<EmptyState icon={Users} message={t('review.empty')} />}
              onRowClick={openItem}
              isRowClickable={isRowOpenable}
            />
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} disabled={isLoading} />
          </>
        )}
      </Card>
    </>
  )
}
