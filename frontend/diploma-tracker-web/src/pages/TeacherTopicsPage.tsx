import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../api/departmentsApi'
import { approveReservation, getReservationsForDecision, rejectReservation, releaseReservation } from '../api/reservationsApi'
import { deleteTopic, getTopics } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/useToast'
import { DecisionCommentModal } from '../components/topics/DecisionCommentModal'
import { TopicFormModal } from '../components/topics/TopicFormModal'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import type { Department, Reservation, Topic } from '../api/types'

export function TeacherTopicsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [pendingRequests, setPendingRequests] = useState<Reservation[]>([])
  const [approvedStudents, setApprovedStudents] = useState<Reservation[]>([])
  const [ownTopics, setOwnTopics] = useState<Topic[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [approving, setApproving] = useState<Reservation | null>(null)
  const [isApproving, setIsApproving] = useState(false)

  const [rejecting, setRejecting] = useState<Reservation | null>(null)
  const [isRejecting, setIsRejecting] = useState(false)

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

    const [pendingResult, approvedResult, ownResult, departmentsResult] = await Promise.allSettled([
      getReservationsForDecision('Pending'),
      getReservationsForDecision('Approved'),
      getTopics(),
      getDepartments()
    ])

    // A single failed call (typically the department lookup, only needed for the create-topic
    // modal) must not hide the requests the teacher still needs to decide on.
    if (pendingResult.status === 'fulfilled') setPendingRequests(pendingResult.value)
    if (approvedResult.status === 'fulfilled') setApprovedStudents(approvedResult.value)
    if (ownResult.status === 'fulfilled') setOwnTopics(ownResult.value)
    if (departmentsResult.status === 'fulfilled') setDepartments(departmentsResult.value)

    const failed = [pendingResult, approvedResult, ownResult, departmentsResult].find(
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

  const confirmApprove = async () => {
    if (!approving) return

    setIsApproving(true)
    try {
      await approveReservation(approving.id)
      setApproving(null)
      toast.success(t('topics.approved'))
      await loadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsApproving(false)
    }
  }

  const confirmReject = async (comment?: string) => {
    if (!rejecting) return

    setIsRejecting(true)
    try {
      await rejectReservation(rejecting.id, comment)
      setRejecting(null)
      toast.success(t('topics.rejected'))
      await loadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRejecting(false)
    }
  }

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
  }

  const confirmDeleteTopic = async () => {
    if (!deletingTopic) return

    setIsDeletingTopic(true)
    try {
      await deleteTopic(deletingTopic.id)
      setDeletingTopic(null)
      toast.success(t('common.deletedToast'))
      await loadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingTopic(false)
    }
  }

  const requestColumns: DataTableColumn<Reservation>[] = [
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
    {
      key: 'topic',
      header: t('topics.title'),
      render: (reservation) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span>{reservation.topicTitle}</span>
            {reservation.origin === 'StudentProposal' && <Badge tone="neutral">{t('topics.proposalBadge')}</Badge>}
            {reservation.currentTopicId && <Badge tone="warning">{t('topics.changeBadge')}</Badge>}
          </div>
          {reservation.currentTopicId && (
            <p className="text-xs text-text-muted">{t('topics.currentTopicLabel', { title: reservation.currentTopicTitle })}</p>
          )}
        </div>
      )
    },
    { key: 'requestedAt', header: t('topics.requestedAt'), render: (reservation) => dateFormat.format(new Date(reservation.createdAt)) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (reservation) => (
        <div className="flex items-center gap-1">
          <Button variant="primary" size="sm" onClick={() => setApproving(reservation)}>{t('topics.approve')}</Button>
          <Button variant="secondary" size="sm" onClick={() => setRejecting(reservation)}>{t('topics.reject')}</Button>
        </div>
      )
    }
  ]

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
      render: (reservation) => (
        <Button variant="secondary" size="sm" onClick={() => setReleasing(reservation)}>{t('topics.release')}</Button>
      )
    }
  ]

  const ownTopicsColumns: DataTableColumn<Topic>[] = [
    { key: 'title', header: t('topics.title'), render: (topic) => topic.title },
    { key: 'department', header: t('topics.department'), render: (topic) => topic.departmentName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    { key: 'student', header: t('topics.student'), render: (topic) => topic.studentName ?? '—' },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => {
        const editable = topic.status === 'Available' && topic.origin === 'Catalogue'
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditTopic(topic)} disabled={!editable} />
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingTopic(topic)} disabled={!editable} />
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title={t('topics.myTopicsTitle')}
        actions={<Button icon={Plus} onClick={openCreateTopic}>{t('topics.addTopic')}</Button>}
      />

      {loadError && (
        <Card className="mb-6">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      <Card title={t('topics.requestsTitle')} className="mb-6">
        <DataTable
          columns={requestColumns}
          rows={pendingRequests}
          getRowKey={(reservation) => reservation.id}
          loading={isLoading}
          emptyState={<EmptyState message={t('topics.noRequests')} />}
        />
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
          rows={ownTopics}
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
        departments={departments}
        teachers={[]}
        onClose={closeTopicModal}
        onSaved={handleTopicSaved}
      />

      <ConfirmDialog
        open={Boolean(approving)}
        title={t('topics.approve')}
        message={approving ? t('topics.approveConfirm', { title: approving.topicTitle, student: approving.studentName }) : ''}
        tone="primary"
        loading={isApproving}
        onConfirm={() => void confirmApprove()}
        onCancel={() => setApproving(null)}
      />

      <DecisionCommentModal
        open={Boolean(rejecting)}
        title={t('topics.rejectTitle')}
        confirmLabel={t('topics.reject')}
        loading={isRejecting}
        onConfirm={(comment) => void confirmReject(comment)}
        onClose={() => setRejecting(null)}
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
