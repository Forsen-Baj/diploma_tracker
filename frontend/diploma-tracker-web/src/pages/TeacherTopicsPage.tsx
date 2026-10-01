import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDirections } from '../api/directionsApi'
import { getReservationsForDecision, releaseReservation } from '../api/reservationsApi'
import { deleteTopic, getTopics } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Tooltip } from '../components/ui/Tooltip'
import { useToast } from '../components/ui/useToast'
import { DecisionCommentModal } from '../components/topics/DecisionCommentModal'
import { TopicApproveButton } from '../components/topics/TopicApproveButton'
import { TopicFormModal } from '../components/topics/TopicFormModal'
import { TopicRequestsTable } from '../components/topics/TopicRequestsTable'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import { useWaitingApprovals } from '../components/topics/useWaitingApprovals'
import type { Direction, Reservation, Topic } from '../api/types'

export function TeacherTopicsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { user } = useAuth()

  const [pendingRequests, setPendingRequests] = useState<Reservation[]>([])
  const [approvedStudents, setApprovedStudents] = useState<Reservation[]>([])
  const [ownTopics, setOwnTopics] = useState<Topic[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { waitingByTopicId, refreshWaiting } = useWaitingApprovals()

  const [releasing, setReleasing] = useState<Reservation | null>(null)
  const [isReleasing, setIsReleasing] = useState(false)

  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | undefined>(undefined)

  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [isDeletingTopic, setIsDeletingTopic] = useState(false)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const loadAll = async () => {
    setIsLoading(true)
    setLoadError('')

    const [pendingResult, approvedResult, ownResult, directionsResult] = await Promise.allSettled([
      getReservationsForDecision('Pending'),
      getReservationsForDecision('Approved'),
      getTopics(),
      // Design 2026-09-27 (phase 12) §4: only directions of departments the teacher's role covers.
      getDirections({ covered: true })
    ])

    // A single failed call (typically the direction lookup, only needed for the create-topic
    // modal) must not hide the requests the teacher still needs to decide on.
    if (pendingResult.status === 'fulfilled') setPendingRequests(pendingResult.value)
    if (approvedResult.status === 'fulfilled') setApprovedStudents(approvedResult.value)
    if (ownResult.status === 'fulfilled') setOwnTopics(ownResult.value)
    if (directionsResult.status === 'fulfilled') setDirections(directionsResult.value)

    const failed = [pendingResult, approvedResult, ownResult, directionsResult].find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failed) {
      setLoadError(errorMessage(failed.reason))
    }

    setIsLoading(false)
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirmRelease = async (comment?: string) => {
    if (!releasing) return

    setIsReleasing(true)
    try {
      await releaseReservation(releasing.id, comment)
      setReleasing(null)
      toast.success(t('topics.released'))
      await loadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsReleasing(false)
    }
  }

  const openCreateTopic = () => {
    setEditingTopic(undefined)
    setIsTopicModalOpen(true)
  }

  const openEditTopic = (topic: Topic) => {
    setEditingTopic(topic)
    setIsTopicModalOpen(true)
  }

  const closeTopicModal = () => setIsTopicModalOpen(false)

  const handleTopicSaved = () => {
    setIsTopicModalOpen(false)
    toast.success(t('common.savedToast'))
    void loadAll()
    void refreshWaiting()
  }

  const confirmDeleteTopic = async () => {
    if (!deletingTopic) return

    setIsDeletingTopic(true)
    try {
      await deleteTopic(deletingTopic.id)
      setDeletingTopic(null)
      toast.success(t('common.deletedToast'))
      await loadAll()
      void refreshWaiting()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingTopic(false)
    }
  }

  const handleTopicApproved = () => {
    void loadAll()
    void refreshWaiting()
  }

  const approvedColumns: DataTableColumn<Reservation>[] = [
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
    { key: 'topic', header: t('topics.title'), render: (reservation) => reservation.topicTitle },
    {
      key: 'decidedAt',
      header: t('topics.decidedAt'),
      render: (reservation) => (reservation.decidedAt ? dateFormat.format(new Date(reservation.decidedAt)) : '—')
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (reservation) =>
        reservation.canRelease ? (
          reservation.hasSubmissions ? (
            <Tooltip content={t('topics.hasSubmissionsHint')}>
              <span tabIndex={0} className="inline-flex">
                <Button variant="secondary" size="sm" disabled>{t('topics.release')}</Button>
              </span>
            </Tooltip>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setReleasing(reservation)}>{t('topics.release')}</Button>
          )
        ) : null
    }
  ]

  const ownTopicsColumns: DataTableColumn<Topic>[] = [
    { key: 'title', header: t('topics.title'), render: (topic) => topic.title },
    { key: 'direction', header: t('topics.direction'), render: (topic) => topic.directionName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    { key: 'student', header: t('topics.student'), render: (topic) => topic.studentName ?? '—' },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => {
        const waitingReservation = waitingByTopicId[topic.id]
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditTopic(topic)} disabled={!topic.canEdit} />
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingTopic(topic)} disabled={!topic.canDelete} />
            {waitingReservation && <TopicApproveButton reservation={waitingReservation} onChanged={handleTopicApproved} />}
          </div>
        )
      }
    }
  ]

  // A teacher assigned to a group only covers no department, so has no direction to publish in.
  const canCreateTopic = directions.length > 0

  return (
    <>
      <PageHeader
        title={t('topics.myTopicsTitle')}
        actions={canCreateTopic ? <Button icon={Plus} onClick={openCreateTopic}>{t('topics.addTopic')}</Button> : undefined}
      />

      {loadError && (
        <Card className="mb-6">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      <Card title={t('topics.requestsTitle')} className="mb-6">
        <TopicRequestsTable rows={pendingRequests} loading={isLoading} onChanged={handleTopicApproved} />
      </Card>

      <Card title={t('topics.approvedTitle')} className="mb-6">
        <DataTable
          columns={approvedColumns}
          rows={approvedStudents}
          getRowKey={(reservation) => reservation.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('topics.noApproved')} />}
        />
      </Card>

      <Card title={t('topics.catalogueCard')}>
        <DataTable
          columns={ownTopicsColumns}
          rows={ownTopics.filter((topic) => topic.supervisorId === user?.id)}
          getRowKey={(topic) => topic.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('topics.noOwnTopics')} />}
        />
      </Card>

      <TopicFormModal
        open={isTopicModalOpen}
        mode={editingTopic ? 'edit' : 'create'}
        initial={editingTopic}
        showSupervisor={false}
        directions={directions}
        supervisors={[]}
        canMoveDirection={false}
        onClose={closeTopicModal}
        onSaved={handleTopicSaved}
      />

      <DecisionCommentModal
        open={Boolean(releasing)}
        title={t('topics.releaseTitle')}
        confirmLabel={t('topics.release')}
        tone="danger"
        loading={isReleasing}
        onConfirm={(comment) => void confirmRelease(comment)}
        onClose={() => setReleasing(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingTopic)}
        title={t('topics.deleteTitle')}
        message={deletingTopic ? t('topics.deleteConfirm', { title: deletingTopic.title }) : ''}
        loading={isDeletingTopic}
        onConfirm={() => void confirmDeleteTopic()}
        onCancel={() => setDeletingTopic(null)}
      />
    </>
  )
}
