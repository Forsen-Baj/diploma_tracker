import { ListPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../../api/departmentsApi'
import { deleteDirection, getDirections } from '../../api/directionsApi'
import { searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../ui/useToast'
import { DirectionFormModal } from './DirectionFormModal'
import type { Department, Direction, StaffOption } from '../../api/types'

type DirectionsSectionProps = {
  /** 'admin' lists every direction and names managers; 'manager' lists the caller's own. */
  mode: 'admin' | 'manager'
  /** When given, each row offers "Add topic" (the direction manager's page). */
  onAddTopic?: (direction: Direction) => void
  /** Reports the loaded directions, e.g. for the page's topic form. */
  onLoaded?: (directions: Direction[]) => void
}

export function DirectionsSection({ mode, onAddTopic, onLoaded }: DirectionsSectionProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const isAdmin = mode === 'admin'

  const [directions, setDirections] = useState<Direction[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [managers, setManagers] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Direction | undefined>(undefined)
  const [deleting, setDeleting] = useState<Direction | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [directionsData, departmentsData, managersData] = await Promise.all([
        getDirections(isAdmin ? {} : { mine: true }),
        getDepartments(),
        isAdmin ? searchStaff('', 'directionManager') : Promise.resolve([] as StaffOption[])
      ])
      setDirections(directionsData)
      setDepartments(departmentsData)
      setManagers(managersData)
      onLoaded?.(directionsData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditing(undefined)
    setIsFormOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setIsDeleting(true)
    try {
      await deleteDirection(deleting.id)
      setDeleting(null)
      toast.success(t('common.deletedToast'))
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const columns: DataTableColumn<Direction>[] = [
    {
      key: 'name',
      header: t('directions.name'),
      render: (direction) => (
        <div>
          <p className="font-medium text-text-strong">{direction.name}</p>
          {direction.description && <p className="text-xs text-text-muted">{direction.description}</p>}
        </div>
      )
    },
    { key: 'department', header: t('directions.department'), render: (direction) => `${direction.departmentName} · ${direction.facultyName}` },
    ...(isAdmin ? [{ key: 'manager', header: t('directions.manager'), render: (direction: Direction) => direction.managerName }] : []),
    {
      key: 'topics',
      header: t('topics.catalogueTitle'),
      render: (direction) => t('directions.topicCounts', {
        available: direction.topicsAvailable,
        reserved: direction.topicsReserved,
        approved: direction.topicsApproved
      })
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (direction) => (
        <div className="flex items-center gap-1">
          {onAddTopic && (
            <Button variant="ghost" size="sm" icon={ListPlus} onClick={() => onAddTopic(direction)}>{t('directions.addTopic')}</Button>
          )}
          {direction.canManage && (
            <>
              <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => { setEditing(direction); setIsFormOpen(true) }} />
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                aria-label={t('common.delete')}
                onClick={() => setDeleting(direction)}
                disabled={direction.topicsAvailable + direction.topicsReserved + direction.topicsApproved > 0}
              />
            </>
          )}
        </div>
      )
    }
  ]

  return (
    <Card
      title={isAdmin ? t('directions.title') : t('directions.myTitle')}
      className="mb-6"
      actions={<Button size="sm" icon={Plus} onClick={openCreate}>{t('directions.add')}</Button>}
    >
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
      <DataTable
        columns={columns}
        rows={directions}
        getRowKey={(direction) => direction.id}
        loading={isLoading}
        emptyState={<EmptyState message={t('directions.none')} />}
      />

      <DirectionFormModal
        open={isFormOpen}
        initial={editing}
        departments={departments}
        managers={managers}
        isAdmin={isAdmin}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false)
          toast.success(t('common.savedToast'))
          void load()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('directions.deleteTitle')}
        message={deleting ? t('directions.deleteConfirm', { name: deleting.name }) : ''}
        loading={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  )
}
