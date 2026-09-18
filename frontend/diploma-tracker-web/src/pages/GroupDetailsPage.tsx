import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { assignAllTaskTemplates, createGroupTask, deleteGroupTask, getTasksForGroup, updateGroupTask } from '../api/groupTasksApi'
import { addGroupReviewer, getGroupReviewers, getGroups, getGroupStudents, removeGroupReviewer } from '../api/groupsApi'
import { archiveGroupStudents } from '../api/studentsApi'
import { getTaskTemplates } from '../api/taskTemplatesApi'
import { getTeachers } from '../api/teachersApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Checkbox } from '../components/ui/Checkbox'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { Spinner } from '../components/ui/Spinner'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../utils/datetime'
import { groupLabel } from '../utils/groupLabel'
import { formatPeriod } from '../utils/period'
import type { Group, GroupReviewer, GroupStudent, GroupTask, TaskTemplate, Teacher } from '../api/types'

type BulkSelection = {
  startDate: string
  deadline: string
}

export function GroupDetailsPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()

  const [group, setGroup] = useState<Group | null>(null)
  const [reviewers, setReviewers] = useState<GroupReviewer[]>([])
  const [students, setStudents] = useState<GroupStudent[]>([])
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [selectedReviewerId, setSelectedReviewerId] = useState('')
  const [isAssigningReviewer, setIsAssigningReviewer] = useState(false)
  const [removingReviewer, setRemovingReviewer] = useState<GroupReviewer | null>(null)
  const [isRemovingReviewer, setIsRemovingReviewer] = useState(false)

  const [newTaskTemplateId, setNewTaskTemplateId] = useState('')
  const [newTaskStartDate, setNewTaskStartDate] = useState('')
  const [newTaskDeadline, setNewTaskDeadline] = useState('')
  const [isCreatingTask, setIsCreatingTask] = useState(false)

  const [bulkSelections, setBulkSelections] = useState<Record<string, BulkSelection>>({})
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)

  const [editingTask, setEditingTask] = useState<GroupTask | null>(null)
  const [editingTaskStartDate, setEditingTaskStartDate] = useState('')
  const [editingTaskDeadline, setEditingTaskDeadline] = useState('')
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [deletingTask, setDeletingTask] = useState<GroupTask | null>(null)
  const [isDeletingTask, setIsDeletingTask] = useState(false)

  const [isArchivingStudents, setIsArchivingStudents] = useState(false)
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const availableTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.isActive && !reviewers.some((reviewer) => reviewer.reviewerId === teacher.id)),
    [teachers, reviewers]
  )

  const reviewerOptions: SelectOption[] = useMemo(
    () => availableTeachers.map((teacher) => ({ value: teacher.id, label: `${teacher.firstName} ${teacher.lastName}` })),
    [availableTeachers]
  )

  const availableTemplates = useMemo(() => {
    const assigned = new Set(tasks.map((task) => task.taskTemplateId))
    return taskTemplates.filter((template) => template.isActive && !assigned.has(template.id) && template.facultyId === group?.facultyId)
  }, [taskTemplates, tasks, group])

  const templateOptions: SelectOption[] = useMemo(
    () => availableTemplates.map((template) => ({ value: template.id, label: `${template.order}. ${template.title}` })),
    [availableTemplates]
  )

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.taskOrder - b.taskOrder || a.deadline.localeCompare(b.deadline)),
    [tasks]
  )

  const bulkCandidates = useMemo(
    () => [...availableTemplates].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [availableTemplates]
  )

  const loadDetails = async () => {
    if (!groupId) return
    setIsLoading(true)
    setLoadError('')
    try {
      const [groupsData, reviewersData, studentsData, teachersData, templatesData, tasksData] = await Promise.all([
        getGroups(),
        getGroupReviewers(groupId),
        getGroupStudents(groupId),
        getTeachers(),
        getTaskTemplates(),
        getTasksForGroup(groupId)
      ])
      setGroup(groupsData.find((item) => item.id === groupId) ?? null)
      setReviewers(reviewersData)
      setStudents(studentsData)
      setTeachers(teachersData)
      setTaskTemplates(templatesData)
      setTasks(tasksData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadDetails()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const handleAssignReviewer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupId || !selectedReviewerId) return

    setIsAssigningReviewer(true)
    try {
      await addGroupReviewer(groupId, selectedReviewerId)
      setSelectedReviewerId('')
      toast.success(t('common.savedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsAssigningReviewer(false)
    }
  }

  const removeReviewer = async () => {
    if (!groupId || !removingReviewer) return

    setIsRemovingReviewer(true)
    try {
      await removeGroupReviewer(groupId, removingReviewer.reviewerId)
      setRemovingReviewer(null)
      toast.success(t('common.deletedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRemovingReviewer(false)
    }
  }

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupId || !newTaskTemplateId || !newTaskDeadline) {
      return
    }
    if (newTaskStartDate && newTaskStartDate > newTaskDeadline) {
      toast.error(t('errors.groupTask.startAfterDeadline'))
      return
    }

    setIsCreatingTask(true)
    try {
      await createGroupTask({
        groupId,
        taskTemplateId: newTaskTemplateId,
        startDate: newTaskStartDate ? fromDatetimeLocalValue(newTaskStartDate) : undefined,
        deadline: fromDatetimeLocalValue(newTaskDeadline)
      })
      setNewTaskTemplateId('')
      setNewTaskStartDate('')
      setNewTaskDeadline('')
      toast.success(t('common.savedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleBulkStartDateChange = (templateId: string, startDate: string) => {
    setBulkSelections((prev) => {
      if (!prev[templateId]) return prev
      return { ...prev, [templateId]: { ...prev[templateId], startDate } }
    })
  }

  const handleBulkDeadlineChange = (templateId: string, deadline: string) => {
    setBulkSelections((prev) => {
      const next = { ...prev }
      if (!deadline) {
        delete next[templateId]
        return next
      }
      next[templateId] = { startDate: prev[templateId]?.startDate ?? '', deadline }
      return next
    })
  }

  const handleBulkCheckedChange = (template: TaskTemplate, checked: boolean) => {
    setBulkSelections((prev) => {
      const next = { ...prev }
      if (!checked) {
        delete next[template.id]
        return next
      }
      next[template.id] = prev[template.id] ?? { startDate: '', deadline: '' }
      return next
    })
  }

  const handleAssignSelectedTasks = async () => {
    if (!groupId) {
      return
    }

    const selections = Object.entries(bulkSelections).filter(([, selection]) => Boolean(selection.deadline))

    if (selections.length === 0) {
      toast.error(t('groupDetails.selectAtLeastOne'))
      return
    }

    if (selections.some(([, selection]) => selection.startDate && selection.startDate > selection.deadline)) {
      toast.error(t('errors.groupTask.startAfterDeadline'))
      return
    }

    const items = selections.map(([taskTemplateId, selection]) => ({
      taskTemplateId,
      startDate: selection.startDate ? fromDatetimeLocalValue(selection.startDate) : undefined,
      deadline: fromDatetimeLocalValue(selection.deadline)
    }))

    setIsBulkAssigning(true)
    try {
      await assignAllTaskTemplates(groupId, { items })
      setBulkSelections({})
      toast.success(t('common.savedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsBulkAssigning(false)
    }
  }

  const startEditTask = (task: GroupTask) => {
    setEditingTask(task)
    setEditingTaskStartDate(task.startDate ? toDatetimeLocalValue(task.startDate) : '')
    setEditingTaskDeadline(toDatetimeLocalValue(task.deadline))
  }

  const closeEditTask = () => {
    if (isSavingTask) return
    setEditingTask(null)
  }

  const handleSaveTaskDeadline = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTask || !editingTaskDeadline) {
      return
    }
    if (editingTaskStartDate && editingTaskStartDate > editingTaskDeadline) {
      toast.error(t('errors.groupTask.startAfterDeadline'))
      return
    }

    setIsSavingTask(true)
    try {
      await updateGroupTask(editingTask.id, {
        startDate: editingTaskStartDate ? fromDatetimeLocalValue(editingTaskStartDate) : undefined,
        deadline: fromDatetimeLocalValue(editingTaskDeadline)
      })
      setEditingTask(null)
      toast.success(t('common.savedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingTask(false)
    }
  }

  const removeTask = async () => {
    if (!deletingTask) return

    setIsDeletingTask(true)
    try {
      await deleteGroupTask(deletingTask.id)
      setDeletingTask(null)
      toast.success(t('common.deletedToast'))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingTask(false)
    }
  }

  const confirmArchiveStudents = async () => {
    if (!groupId) return

    setIsArchivingStudents(true)
    try {
      const result = await archiveGroupStudents(groupId)
      setIsArchiveConfirmOpen(false)
      toast.success(t('groupDetails.archivedToast', { count: result.archived }))
      await loadDetails()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsArchivingStudents(false)
    }
  }

  const taskColumns: DataTableColumn<GroupTask>[] = [
    { key: 'order', header: t('groupDetails.order'), render: (task) => task.taskOrder },
    { key: 'title', header: t('groupDetails.template'), render: (task) => task.taskTitle },
    { key: 'period', header: t('groupDetails.period'), render: (task) => formatPeriod(task.startDate, task.deadline, dateFormat) },
    { key: 'studentTaskCount', header: t('groupDetails.studentTaskCount'), render: (task) => task.studentTaskCount },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (task) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('groupDetails.editPeriod')} onClick={() => startEditTask(task)} />
          {user?.role === 'Admin' && (
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingTask(task)} />
          )}
        </div>
      )
    }
  ]

  const bulkColumns: DataTableColumn<TaskTemplate>[] = [
    {
      key: 'select',
      header: '',
      render: (template) => (
        <Checkbox
          label=""
          ariaLabel={t('groupDetails.selectTemplate', { title: template.title })}
          checked={Boolean(bulkSelections[template.id] !== undefined)}
          onChange={(checked) => handleBulkCheckedChange(template, checked)}
        />
      )
    },
    { key: 'title', header: t('groupDetails.template'), render: (template) => `${template.order}. ${template.title}` },
    {
      key: 'startDate',
      header: t('groupDetails.startDate'),
      render: (template) => (
        <TextField
          label={<span className="sr-only">{t('groupDetails.startDate')} — {template.title}</span>}
          type="datetime-local"
          value={bulkSelections[template.id]?.startDate ?? ''}
          disabled={bulkSelections[template.id] === undefined}
          onChange={(event) => handleBulkStartDateChange(template.id, event.target.value)}
        />
      )
    },
    {
      key: 'deadline',
      header: t('groupDetails.deadline'),
      render: (template) => (
        <TextField
          label={<span className="sr-only">{t('groupDetails.deadline')} — {template.title}</span>}
          type="datetime-local"
          value={bulkSelections[template.id]?.deadline ?? ''}
          onChange={(event) => handleBulkDeadlineChange(template.id, event.target.value)}
        />
      )
    }
  ]

  const reviewerColumns: DataTableColumn<GroupReviewer>[] = [
    { key: 'name', header: t('groups.reviewer'), render: (reviewer) => `${reviewer.firstName} ${reviewer.lastName}` },
    { key: 'email', header: t('auth.email'), render: (reviewer) => reviewer.email },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (reviewer) => (
        <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.remove')} onClick={() => setRemovingReviewer(reviewer)} />
      )
    }
  ]

  const studentColumns: DataTableColumn<GroupStudent>[] = [
    { key: 'name', header: t('students.lastName'), render: (student) => `${student.firstName} ${student.lastName}` },
    { key: 'studentNumber', header: t('groups.studentNumber'), render: (student) => student.studentNumber },
    { key: 'email', header: t('auth.email'), render: (student) => student.email },
    { key: 'topic', header: t('groupDetails.topic'), render: (student) => student.diplomaTopic ?? t('common.notSet') },
    {
      key: 'supervisor',
      header: t('groupDetails.supervisor'),
      render: (student) => (student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorFirstName} ${student.supervisorLastName}` : t('common.notAssigned'))
    },
    {
      key: 'claimed',
      header: t('common.status'),
      render: (student) => (
        <Badge tone={student.isClaimed ? 'success' : 'warning'}>{student.isClaimed ? t('groups.claimed') : t('groups.notClaimed')}</Badge>
      )
    }
  ]

  const groupTitle = group ? groupLabel(group) : ''

  return (
    <>
      <Link to="/admin/groups" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {t('groups.backToGroups')}
      </Link>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && !group && (
        <Card>
          <EmptyState message={t('groupDetails.notFound')} />
        </Card>
      )}

      {!isLoading && !loadError && group && (
        <>
          <PageHeader title={groupTitle} description={`${group.academicYear} · ${group.departmentName}`} />

          <Card title={t('groupDetails.reviewers')} className="mb-6">
            <form onSubmit={handleAssignReviewer} className="mb-4 flex items-end gap-3">
              <div className="max-w-sm flex-1">
                <Select
                  label={t('groups.reviewer')}
                  value={selectedReviewerId}
                  onChange={setSelectedReviewerId}
                  options={reviewerOptions}
                  placeholder={t('common.select')}
                />
              </div>
              <Button type="submit" loading={isAssigningReviewer} disabled={!selectedReviewerId}>
                {t('groups.assignReviewer')}
              </Button>
            </form>
            <DataTable
              columns={reviewerColumns}
              rows={reviewers}
              getRowKey={(reviewer) => reviewer.id}
              emptyState={<EmptyState message={t('groups.noReviewers')} />}
            />
          </Card>

          <Card title={t('groupDetails.tasks')} className="mb-6">
            <form onSubmit={handleCreateTask} className="mb-6 flex items-end gap-3">
              <div className="max-w-sm flex-1">
                <Select
                  label={t('groupDetails.template')}
                  value={newTaskTemplateId}
                  onChange={setNewTaskTemplateId}
                  options={templateOptions}
                  placeholder={t('common.select')}
                />
              </div>
              <div className="max-w-xs flex-1">
                <TextField
                  label={t('groupDetails.startDate')}
                  hint={t('common.optional')}
                  type="datetime-local"
                  value={newTaskStartDate}
                  onChange={(e) => setNewTaskStartDate(e.target.value)}
                />
              </div>
              <div className="max-w-xs flex-1">
                <TextField
                  label={t('groupDetails.deadline')}
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                />
              </div>
              <Button type="submit" loading={isCreatingTask} disabled={!newTaskTemplateId || !newTaskDeadline}>
                {t('groupDetails.assignTask')}
              </Button>
            </form>

            <DataTable
              columns={taskColumns}
              rows={sortedTasks}
              getRowKey={(task) => task.id}
              emptyState={<EmptyState message={t('groupDetails.noTasks')} />}
            />

            <h3 className="mb-3 mt-6 text-sm font-semibold text-heading">{t('groupDetails.bulkTitle')}</h3>
            {bulkCandidates.length === 0 ? (
              <EmptyState message={t('groupDetails.allAssigned')} />
            ) : (
              <>
                <DataTable
                  columns={bulkColumns}
                  rows={bulkCandidates}
                  getRowKey={(template) => template.id}
                />
                <div className="mt-4">
                  <Button loading={isBulkAssigning} onClick={() => void handleAssignSelectedTasks()}>
                    {t('groupDetails.assignSelected')}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card
            title={t('groupDetails.students')}
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsArchiveConfirmOpen(true)}
                disabled={students.length === 0}
              >
                {t('groupDetails.archiveAllStudents')}
              </Button>
            }
          >
            <DataTable
              columns={studentColumns}
              rows={students}
              getRowKey={(student) => student.studentProfileId}
              emptyState={<EmptyState message={t('groupDetails.noStudents')} />}
            />
          </Card>
        </>
      )}

      <Modal
        open={Boolean(editingTask)}
        onClose={closeEditTask}
        title={t('groupDetails.editPeriod')}
        footer={
          <>
            <Button variant="secondary" onClick={closeEditTask} disabled={isSavingTask}>{t('common.cancel')}</Button>
            <Button form="edit-task-deadline-form" type="submit" loading={isSavingTask}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="edit-task-deadline-form" onSubmit={handleSaveTaskDeadline} className="flex flex-col gap-4">
          <TextField
            label={t('groupDetails.startDate')}
            hint={t('common.optional')}
            type="datetime-local"
            value={editingTaskStartDate}
            onChange={(e) => setEditingTaskStartDate(e.target.value)}
          />
          <TextField
            label={t('groupDetails.deadline')}
            type="datetime-local"
            value={editingTaskDeadline}
            onChange={(e) => setEditingTaskDeadline(e.target.value)}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingTask)}
        title={t('common.delete')}
        message={t('groupDetails.deleteTaskConfirm')}
        loading={isDeletingTask}
        onConfirm={() => void removeTask()}
        onCancel={() => setDeletingTask(null)}
      />

      <ConfirmDialog
        open={Boolean(removingReviewer)}
        title={t('common.remove')}
        message={t('groups.removeReviewerConfirm')}
        loading={isRemovingReviewer}
        onConfirm={() => void removeReviewer()}
        onCancel={() => setRemovingReviewer(null)}
      />

      <ConfirmDialog
        open={isArchiveConfirmOpen}
        title={t('groupDetails.archiveAllStudents')}
        message={group ? t('groupDetails.archiveAllStudentsConfirm', { code: group.code, count: students.length }) : ''}
        loading={isArchivingStudents}
        onConfirm={() => void confirmArchiveStudents()}
        onCancel={() => setIsArchiveConfirmOpen(false)}
      />
    </>
  )
}
