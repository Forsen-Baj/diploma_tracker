import { Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getReservationsForDecision } from '../api/reservationsApi'
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
import { TopicRequestsTable } from '../components/topics/TopicRequestsTable'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import { useWaitingApprovals } from '../components/topics/useWaitingApprovals'
import type { Direction, Reservation, SupervisorOption, Topic } from '../api/types'

/** Design 2026-09-27 §8: a direction manager's directions, the topics in them and the requests
 *  waiting in them. Reached only while acting as direction manager (phase 12 §4.2). */
export function DirectionsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [directions, setDirections] = useState<Direction[]>([])
  const [supervisors, setSupervisors] = useState<SupervisorOption[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [requests, setRequests] = useState<Reservation[]>([])
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
      // Acting as direction manager, the pending requests are those in the caller's directions.
      const [topicsData, requestsData] = await Promise.all([getTopics(), getReservationsForDecision('Pending')])
      setTopics(topicsData.filter((topic) => topic.directionManagerId === user?.id))
      setRequests(requestsData)
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

  // Design 2026-09-27 (phase 12) §4: the supervisors on offer are the teachers who cover the
  // direction's department, loaded for that department whenever the topic form opens.
  const openTopicForm = async (departmentId: string, directionId: string | undefined, topic: Topic | undefined) => {
    try {
      setSupervisors(await getTopicSupervisors(departmentId))
    } catch (err) {
      toast.error(errorMessage(err))
      return
    }
    setEditingTopic(topic)
    setFormDirectionId(directionId)
    setIsFormOpen(true)
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
              onClick={() => void openTopicForm(topic.departmentId, undefined, topic)} />
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
        onAddTopic={(direction) => void openTopicForm(direction.departmentId, direction.id, undefined)}
      />

      <Card title={t('topics.requestsTitle')} className="mb-6">
        <TopicRequestsTable rows={requests} loading={isLoading} onChanged={handleTopicApproved} />
      </Card>

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
