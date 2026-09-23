import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getAdminDashboard } from '../api/dashboardApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { StatTile } from '../components/dashboard/StatTile'
import { ProportionBar, type ProportionSegment } from '../components/dashboard/ProportionBar'
import { GroupProgressCard } from '../components/dashboard/GroupProgressCard'
import { GroupTable } from '../components/dashboard/GroupTable'
import { nextGroupSort, sortGroupRows, type GroupSort } from '../components/dashboard/groupSort'
import type { AdminDashboard } from '../api/types'

type StructureTile = {
  key: string
  label: string
  value: number
  onClick?: () => void
}

export function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [groupSort, setGroupSort] = useState<GroupSort>({ key: 'code', direction: 'asc' })

  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setDashboard(await getAdminDashboard())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedGroups = useMemo(() => (dashboard ? sortGroupRows(dashboard.groups, groupSort) : []), [dashboard, groupSort])

  const topicSegments: ProportionSegment[] = dashboard
    ? [
        { key: 'withTopic', label: t('dashboard.withTopic'), value: dashboard.topicSelection.withApprovedTopic, className: 'bg-success' },
        { key: 'withRequest', label: t('dashboard.withRequest'), value: dashboard.topicSelection.withPendingRequest, className: 'bg-accent' },
        { key: 'withoutTopic', label: t('dashboard.withoutTopic'), value: dashboard.topicSelection.withoutTopic, className: 'bg-warning' }
      ]
    : []

  const structureTiles: StructureTile[] = dashboard
    ? [
        { key: 'faculties', label: t('dashboard.faculties'), value: dashboard.structure.faculties, onClick: () => navigate('/admin/faculties') },
        { key: 'departments', label: t('dashboard.departments'), value: dashboard.structure.departments },
        { key: 'groupsCount', label: t('dashboard.groupsCount'), value: dashboard.structure.groups, onClick: () => navigate('/admin/groups') },
        {
          key: 'activeStudents',
          label: t('dashboard.activeStudents'),
          value: dashboard.structure.activeStudents,
          onClick: () => navigate('/admin/students')
        },
        { key: 'unclaimedAccounts', label: t('dashboard.unclaimedAccounts'), value: dashboard.structure.unclaimedAccounts },
        { key: 'teachers', label: t('dashboard.teachers'), value: dashboard.structure.teachers, onClick: () => navigate('/admin/teachers') },
        {
          key: 'topicsAvailable',
          label: t('dashboard.topicsAvailable'),
          value: dashboard.structure.topicsAvailable,
          onClick: () => navigate('/admin/topics')
        },
        {
          key: 'topicsReserved',
          label: t('dashboard.topicsReserved'),
          value: dashboard.structure.topicsReserved,
          onClick: () => navigate('/admin/topics')
        },
        {
          key: 'topicsApproved',
          label: t('dashboard.topicsApproved'),
          value: dashboard.structure.topicsApproved,
          onClick: () => navigate('/admin/topics')
        }
      ]
    : []

  return (
    <>
      <PageHeader title={t('dashboard.adminTitle')} />

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card className="mb-6">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && dashboard && (
        <>
          <Card title={t('dashboard.topicSelection')} className="mb-6">
            <ProportionBar segments={topicSegments} />
            <p className="mt-3 flex items-center gap-2 text-sm text-text-muted">
              {dashboard.topicSelection.deadline ? (
                <>
                  {t('dashboard.deadlineOn', { date: dateTimeFormat.format(new Date(dashboard.topicSelection.deadline)) })}
                  <Badge tone={dashboard.topicSelection.isOpen ? 'success' : 'danger'}>
                    {t(dashboard.topicSelection.isOpen ? 'dashboard.selectionOpen' : 'dashboard.selectionClosed')}
                  </Badge>
                </>
              ) : (
                t('dashboard.noDeadline')
              )}
            </p>
          </Card>

          <div className="mb-6 grid grid-cols-3 gap-4">
            <StatTile label={t('dashboard.waiting')} value={dashboard.reviewBacklog.waitingReviews} onClick={() => navigate('/review')} />
            <StatTile label={t('dashboard.waitingLate')} value={dashboard.reviewBacklog.waitingLate} tone="warning" />
            <StatTile label={t('dashboard.overdue')} value={dashboard.reviewBacklog.overdueSteps} tone="danger" />
          </div>

          <Card title={t('dashboard.structure')} className="mb-6">
            <div className="grid grid-cols-3 gap-4">
              {structureTiles.map((tile) => (
                <StatTile key={tile.key} label={tile.label} value={tile.value} onClick={tile.onClick} />
              ))}
            </div>
          </Card>

          <Card title={t('dashboard.groupsBreakdown')} className="mb-6">
            <GroupTable rows={sortedGroups} sort={groupSort} onSortChange={(key) => setGroupSort((current) => nextGroupSort(current, key))} />
          </Card>

          <GroupProgressCard />
        </>
      )}
    </>
  )
}
