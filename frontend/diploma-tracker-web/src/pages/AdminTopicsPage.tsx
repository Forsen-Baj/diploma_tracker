import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../api/departmentsApi'
import { approveReservation, rejectReservation, releaseReservation } from '../api/reservationsApi'
import { getTeachers } from '../api/teachersApi'
import { deleteTopic, getTopics } from '../api/topicsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { SegmentedControl, type SegmentedOption } from '../components/ui/SegmentedControl'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { DecisionCommentModal } from '../components/topics/DecisionCommentModal'
import { TopicFormModal } from '../components/topics/TopicFormModal'
import { TopicStatusBadge } from '../components/topics/TopicStatusBadge'
import type { Department, Teacher, Topic, TopicStatus } from '../api/types'

type StatusFilter = 'all' | TopicStatus

export function AdminTopicsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [topics, setTopics] = useState<Topic[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const topicsRequestRef = useRef(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [supervisorId, setSupervisorId] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | undefined>(undefined)

  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null)
  const [isDeletingTopic, setIsDeletingTopic] = useState(false)

  const [approving, setApproving] = useState<Topic | null>(null)
  const [isApproving, setIsApproving] = useState(false)

  const [rejecting, setRejecting] = useState<Topic | null>(null)
  const [isRejecting, setIsRejecting] = useState(false)

  const [releasing, setReleasing] = useState<Topic | null>(null)
  const [isReleasing, setIsReleasing] = useState(false)

  const loadFilters = async () => {
    try {
      const [departmentsData, teachersData] = await Promise.all([getDepartments(), getTeachers()])
      setDepartments(departmentsData)
      setTeachers(teachersData)
    } catch (err) {
      setLoadError(errorMessage(err))
    }
  }

  const loadTopics = async () => {
    const requestId = ++topicsRequestRef.current
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await getTopics({
        search: search || undefined,
        departmentId: departmentId || undefined,
        supervisorId: supervisorId || undefined,
        status: status === 'all' ? undefined : status
      })
      if (topicsRequestRef.current !== requestId) return
      setTopics(data)
    } catch (err) {
      if (topicsRequestRef.current !== requestId) return
      setLoadError(errorMessage(err))
    } finally {
      if (topicsRequestRef.current === requestId) setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    void loadTopics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, departmentId, supervisorId, status])

  const departmentOptions: SelectOption[] = [
    { value: '', label: t('topics.allDepartments') },
    ...departments.map((department) => ({ value: department.id, label: `${department.name} · ${department.facultyName}` }))
  ]

  const supervisorOptions: SelectOption[] = [
    { value: '', label: t('topics.allSupervisors') },
    ...teachers.map((teacher) => ({
      value: teacher.id,
      label: teacher.isActive
        ? `${teacher.lastName} ${teacher.firstName}`
        : t('students.inactiveSupervisor', { name: `${teacher.lastName} ${teacher.firstName}` })
    }))
  ]

  const statusOptions: SegmentedOption[] = [
    { value: 'all', label: t('topics.filterAll') },
    { value: 'Available', label: t('topics.status.Available') },
    { value: 'Reserved', label: t('topics.status.Reserved') },
    { value: 'Approved', label: t('topics.status.Approved') }
  ]

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
    void loadTopics()
  }

  const confirmDeleteTopic = async () => {
    if (!deletingTopic) return

    setIsDeletingTopic(true)
    try {
      await deleteTopic(deletingTopic.id)
      setDeletingTopic(null)
      toast.success(t('common.deletedToast'))
      await loadTopics()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingTopic(false)
    }
  }

  const confirmApprove = async () => {
    if (!approving?.activeReservationId) return

    setIsApproving(true)
    try {
      await approveReservation(approving.activeReservationId)
      setApproving(null)
      toast.success(t('topics.approved'))
      await loadTopics()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsApproving(false)
    }
  }

  const confirmReject = async (comment?: string) => {
    if (!rejecting?.activeReservationId) return

    setIsRejecting(true)
    try {
      await rejectReservation(rejecting.activeReservationId, comment)
      setRejecting(null)
      toast.success(t('topics.rejected'))
      await loadTopics()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRejecting(false)
    }
  }

  const confirmRelease = async (comment?: string) => {
    if (!releasing?.activeReservationId) return

    setIsReleasing(true)
    try {
      await releaseReservation(releasing.activeReservationId, comment)
      setReleasing(null)
      toast.success(t('topics.released'))
      await loadTopics()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsReleasing(false)
    }
  }

  const columns: DataTableColumn<Topic>[] = [
    { key: 'title', header: t('topics.title'), render: (topic) => topic.title },
    { key: 'supervisor', header: t('topics.supervisor'), render: (topic) => topic.supervisorName },
    { key: 'department', header: t('topics.department'), render: (topic) => topic.departmentName },
    { key: 'status', header: t('common.status'), render: (topic) => <TopicStatusBadge status={topic.status} /> },
    {
      key: 'student',
      header: t('topics.student'),
      render: (topic) => (topic.studentName ? `${topic.studentName} · ${topic.groupCode ?? ''}` : t('common.notAssigned'))
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (topic) => {
        const deletable = topic.status === 'Available' && topic.origin === 'Catalogue'
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditTopic(topic)} />
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingTopic(topic)} disabled={!deletable} />
            {topic.activeReservationStatus === 'Pending' && (
              <>
                <Button variant="primary" size="sm" onClick={() => setApproving(topic)}>{t('topics.approve')}</Button>
                <Button variant="secondary" size="sm" onClick={() => setRejecting(topic)}>{t('topics.reject')}</Button>
              </>
            )}
            {topic.activeReservationStatus === 'Approved' && (
              <Button variant="secondary" size="sm" onClick={() => setReleasing(topic)}>{t('topics.release')}</Button>
            )}
          </div>
        )
      }
    }
  ]

  return (
    <>
      <PageHeader
        title={t('topics.adminTitle')}
        actions={<Button icon={Plus} onClick={openCreateTopic}>{t('topics.addTopic')}</Button>}
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="max-w-sm flex-1">
            <TextField label={t('topics.search')} placeholder={t('topics.searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <div className="max-w-xs flex-1">
            <Select label={t('topics.department')} value={departmentId} onChange={setDepartmentId} options={departmentOptions} />
          </div>
          <div className="max-w-xs flex-1">
            <Select label={t('topics.supervisor')} value={supervisorId} onChange={setSupervisorId} options={supervisorOptions} />
          </div>
          <SegmentedControl ariaLabel={t('common.status')} value={status} onChange={(value) => setStatus(value as StatusFilter)} options={statusOptions} />
        </div>

        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={topics}
            getRowKey={(topic) => topic.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('topics.noTopics')} />}
          />
        )}
      </Card>

      <TopicFormModal
        open={isTopicModalOpen}
        mode={editingTopic ? 'edit' : 'create'}
        initial={editingTopic}
        showSupervisor
        departments={departments}
        teachers={teachers}
        onClose={closeTopicModal}
        onSaved={handleTopicSaved}
      />

      <ConfirmDialog
        open={Boolean(deletingTopic)}
        title={t('topics.deleteTitle')}
        message={deletingTopic ? t('topics.deleteConfirm', { title: deletingTopic.title }) : ''}
        loading={isDeletingTopic}
        onConfirm={() => void confirmDeleteTopic()}
        onCancel={() => setDeletingTopic(null)}
      />

      <ConfirmDialog
        open={Boolean(approving)}
        title={t('topics.approve')}
        message={approving ? t('topics.approveConfirm', { title: approving.title, student: approving.studentName ?? '' }) : ''}
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
    </>
  )
}
