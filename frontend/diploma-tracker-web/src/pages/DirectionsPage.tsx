import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { deleteTopic, getTopics, getTopicSupervisors } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/useToast'
import { DirectionsSection, type DirectionsSectionHandle } from '../components/topics/DirectionsSection'
import { TopicApproveButton } from '../components/topics/TopicApproveButton'
import { TopicFormModal } from '../components/topics/TopicFormModal'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import { useWaitingApprovals } from '../components/topics/useWaitingApprovals'
import type { Direction, SupervisorOption, Topic } from '../api/types'

/** Design 2026-09-27 §8: a direction manager's directions, and the topics in them. */
export function DirectionsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [directions, setDirections] = useState<Direction[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formDirectionId, setFormDirectionId] = useState<string | undefined>(undefined)
  const [editingTopic, setEditingTopic] = useState<Topic | undefined>(undefined)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const directionsSectionRef = useRef<DirectionsSectionHandle>(null)
  const { waitingByTopicId, refreshWaiting } = useWaitingApprovals()

  const loadTopics = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [topicsData, supervisorsData] = await Promise.all([getTopics(), getTopicSupervisors()])
      setTopics(topicsData.filter((topic) => topic.directionManagerId === user?.id))
      setSupervisors(supervisorsData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  if (user && !user.isDirectionManager) {
    return <Navigate to="/teacher/dashboard" replace />
  }

  const confirmDeleteTopic = async () => {
    if (!deletingTopic) return
    setIsDeleting(true)
    try {
      await deleteTopic(deletingTopic.id)
      setDeletingTopic(null)
      toast.success(t('common.deletedToast'))
      await loadTopics()
      void refreshWaiting()
      directionsSectionRef.current?.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleTopicApproved = () => {
    void loadTopics()
    void refreshWaiting()
    directionsSectionRef.current?.reload()
  }

  const columns: DataTableColumn<Topic>[] = [
    { key: 'title', header: t('topics.title'), render: (topic) => topic.title },
    { key: 'direction', header: t('topics.direction'), render: (topic) => topic.directionName },
    { key: 'supervisor', header: t('topics.supervisor'), render: (topic) => topic.supervisorName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    { key: 'student', header: t('topics.student'), render: (topic) => (topic.studentName ? `${topic.studentName} · ${topic.groupCode ?? ''}` : '—') },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => {
        const waitingReservation = waitingByTopicId[topic.id]
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} disabled={!topic.canEdit}
              onClick={() => { setEditingTopic(topic); setFormDirectionId(undefined); setIsFormOpen(true) }} />
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} disabled={!topic.canDelete}
              onClick={() => setDeletingTopic(topic)} />
            {waitingReservation && <TopicApproveButton reservation={waitingReservation} onChanged={handleTopicApproved} />}
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader title={t('directions.myTitle')} />

      <DirectionsSection
        ref={directionsSectionRef}
        mode="manager"
        onLoaded={setDirections}
        onAddTopic={(direction) => {
          setEditingTopic(undefined)
          setFormDirectionId(direction.id)
          setIsFormOpen(true)
        }}
      />

      <Card title={t('directions.topicsTitle')}>
        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        <DataTable
          columns={columns}
          rows={topics}
          getRowKey={(topic) => topic.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('directions.noTopics')} />}
        />
      </Card>

      <TopicFormModal
        open={isFormOpen}
        mode={editingTopic ? 'edit' : 'create'}
        initial={editingTopic}
        showSupervisor
        directions={directions}
        supervisors={supervisors}
        fixedDirectionId={formDirectionId}
        canMoveDirection={false}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false)
          toast.success(t('common.savedToast'))
          void loadTopics()
          void refreshWaiting()
          directionsSectionRef.current?.reload()
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingTopic)}
        title={t('topics.deleteTitle')}
        message={deletingTopic ? t('topics.deleteConfirm', { title: deletingTopic.title }) : ''}
        loading={isDeleting}
        onConfirm={() => void confirmDeleteTopic()}
        onCancel={() => setDeletingTopic(null)}
      />
    </>
  )
}
