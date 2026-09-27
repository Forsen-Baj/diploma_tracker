import { UserCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getGroups } from '../../api/groupsApi'
import { getTasksForGroup } from '../../api/groupTasksApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { Select, type SelectOption } from '../ui/Select'
import { StandardsControllerDialog } from './StandardsControllerDialog'
import type { Group, GroupTask } from '../../api/types'

type GroupStepsSectionProps = {
  /** The faculty picked on the Steps page; its groups are offered. */
  facultyId: string
}

/** Design 2026-09-27 §8: Steps → Group steps → a group → its steps, each with its standards
 *  controller. The controller applies to every student of the group on that step. */
export function GroupStepsSection({ facultyId }: GroupStepsSectionProps) {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()

  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setGroupId] = useState('')
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<GroupTask | null>(null)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium' }),
    [i18n.language]
  )

  useEffect(() => {
    let cancelled = false
    getGroups()
      .then((data) => {
        if (cancelled) return
        const inFaculty = data.filter((group) => group.facultyId === facultyId)
        setGroups(inFaculty)
        setGroupId((current) => (inFaculty.some((group) => group.id === current) ? current : ''))
      })
      .catch((err) => { if (!cancelled) setLoadError(errorMessage(err)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId])

  const loadTasks = useCallback(async () => {
    if (!groupId) {
      setTasks([])
      return
    }
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await getTasksForGroup(groupId)
      setTasks([...data].sort((a, b) => a.taskOrder - b.taskOrder))
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const groupOptions: SelectOption[] = groups.map((group) => ({ value: group.id, label: `${group.code} · ${group.academicYear}` }))

  const columns: DataTableColumn<GroupTask>[] = [
    { key: 'order', header: t('taskTemplates.order'), render: (task) => task.taskOrder },
    { key: 'title', header: t('taskTemplates.titleField'), render: (task) => task.taskTitle },
    { key: 'deadline', header: t('taskTemplates.deadline'), render: (task) => dateFormat.format(new Date(task.deadline)) },
    { key: 'controller', header: t('taskTemplates.standardsController'), render: (task) => task.standardsControllerName ?? t('common.notAssigned') },
    {
      key: 'passed',
      header: t('taskTemplates.standardsPassed'),
      render: (task) => (task.standardsControllerId
        ? t('taskTemplates.passedCount', { passed: task.standardsControlApproved, total: task.standardsControlTotal })
        : '—')
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (task) => (
        <Button variant="secondary" size="sm" icon={UserCheck} onClick={() => setEditing(task)}>
          {task.standardsControllerId ? t('taskTemplates.changeController') : t('taskTemplates.setController')}
        </Button>
      )
    }
  ]

  return (
    <Card>
      <div className="mb-4 max-w-xs">
        <Select label={t('taskTemplates.group')} value={groupId} onChange={setGroupId} options={groupOptions} placeholder={t('common.select')} />
      </div>
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
      {!groupId ? (
        <EmptyState message={t('taskTemplates.selectGroup')} />
      ) : (
        <DataTable
          columns={columns}
          rows={tasks}
          getRowKey={(task) => task.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('taskTemplates.noGroupSteps')} />}
        />
      )}

      {editing && (
        <StandardsControllerDialog
          groupTask={editing}
          onClose={() => setEditing(null)}
          onChanged={() => {
            setEditing(null)
            void loadTasks()
          }}
        />
      )}
    </Card>
  )
}
