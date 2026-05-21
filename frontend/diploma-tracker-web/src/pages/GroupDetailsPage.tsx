import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { assignAllTaskTemplates, createGroupTask, deleteGroupTask, getTasksForGroup, updateGroupTask } from '../api/groupTasksApi'
import { addGroupReviewer, getGroupReviewers, getGroups, getGroupStudents, removeGroupReviewer } from '../api/groupsApi'
import { getTaskTemplates } from '../api/taskTemplatesApi'
import { getTeachers } from '../api/teachersApi'
import { useAuth } from '../auth/AuthContext'
import type { Group, GroupReviewer, GroupStudent, GroupTask, TaskTemplate, Teacher } from '../api/types'
import { ErrorModal, isApiConflict } from '../components/ErrorModal'

export function GroupDetailsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [reviewers, setReviewers] = useState<GroupReviewer[]>([])
  const [students, setStudents] = useState<GroupStudent[]>([])
  const [tasks, setTasks] = useState<GroupTask[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([])
  const [selectedReviewerId, setSelectedReviewerId] = useState('')
  const [newTaskTemplateId, setNewTaskTemplateId] = useState('')
  const [newTaskDeadline, setNewTaskDeadline] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskDeadline, setEditingTaskDeadline] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAssigning, setIsAssigning] = useState(false)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [isBulkAssigning, setIsBulkAssigning] = useState(false)
  const [isSavingTask, setIsSavingTask] = useState(false)
  const [removingReviewerId, setRemovingReviewerId] = useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [bulkSelections, setBulkSelections] = useState<Record<string, string>>({})
  const [bulkResultMessage, setBulkResultMessage] = useState('')

  const availableTeachers = useMemo(
    () => teachers.filter((teacher) => teacher.isActive && !reviewers.some((reviewer) => reviewer.reviewerId === teacher.id)),
    [teachers, reviewers]
  )

  const availableTemplates = useMemo(() => {
    const assigned = new Set(tasks.map((task) => task.taskTemplateId))
    return taskTemplates.filter((template) => template.isActive && !assigned.has(template.id))
  }, [taskTemplates, tasks])

  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => a.taskOrder - b.taskOrder || a.deadline.localeCompare(b.deadline)), [tasks])

  const bulkCandidates = useMemo(() => availableTemplates.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)), [availableTemplates])

  const loadDetails = async () => {
    if (!groupId) return
    setIsLoading(true)
    setError('')
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
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDetails()
  }, [groupId])

  const handleAssignReviewer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupId || !selectedReviewerId) return

    setIsAssigning(true)
    setError('')
    try {
      await addGroupReviewer(groupId, selectedReviewerId)
      setSelectedReviewerId('')
      await loadDetails()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsAssigning(false)
    }
  }

  const handleRemoveReviewer = async (reviewerId: string) => {
    if (!groupId || !window.confirm('Remove this reviewer from the group?')) return

    setRemovingReviewerId(reviewerId)
    setError('')
    try {
      await removeGroupReviewer(groupId, reviewerId)
      await loadDetails()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRemovingReviewerId(null)
    }
  }

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupId || !newTaskTemplateId || !newTaskDeadline) {
      return
    }

    setIsCreatingTask(true)
    setError('')
    try {
      await createGroupTask({
        groupId,
        taskTemplateId: newTaskTemplateId,
        deadline: new Date(newTaskDeadline).toISOString()
      })
      setNewTaskTemplateId('')
      setNewTaskDeadline('')
      await loadDetails()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsCreatingTask(false)
    }
  }

  const handleBulkDeadlineChange = (templateId: string, deadline: string) => {
    setBulkSelections((prev) => {
      const next = { ...prev }
      if (!deadline) {
        delete next[templateId]
        return next
      }
      next[templateId] = deadline
      return next
    })
  }

  const handleAssignSelectedTasks = async () => {
    if (!groupId) {
      return
    }

    const items = Object.entries(bulkSelections).map(([taskTemplateId, deadline]) => ({
      taskTemplateId,
      deadline: new Date(deadline).toISOString()
    }))

    if (items.length === 0) {
      setError('Select at least one template and deadline.')
      return
    }

    setIsBulkAssigning(true)
    setError('')
    setBulkResultMessage('')
    try {
      const result = await assignAllTaskTemplates(groupId, { items })
      setBulkSelections({})
      setBulkResultMessage(`Created ${result.createdGroupTaskCount} task(s), skipped ${result.skippedExistingGroupTaskCount}, created ${result.createdStudentTaskCount} student task(s).`)
      await loadDetails()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsBulkAssigning(false)
    }
  }

  const startEditTask = (task: GroupTask) => {
    setEditingTaskId(task.id)
    setEditingTaskDeadline(new Date(task.deadline).toISOString().slice(0, 16))
  }

  const cancelEditTask = () => {
    setEditingTaskId(null)
    setEditingTaskDeadline('')
  }

  const handleSaveTaskDeadline = async (taskId: string) => {
    if (!editingTaskDeadline) {
      return
    }

    setIsSavingTask(true)
    setError('')
    try {
      await updateGroupTask(taskId, { deadline: new Date(editingTaskDeadline).toISOString() })
      cancelEditTask()
      await loadDetails()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSavingTask(false)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Delete this group task and all pending student tasks?')) {
      return
    }

    setDeletingTaskId(taskId)
    setError('')
    try {
      await deleteGroupTask(taskId)
      await loadDetails()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setDeletingTaskId(null)
    }
  }

  return (
    <div className="groups-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <p><Link to="/admin/groups">Back to Groups</Link></p>
        {isLoading && <p>Loading group details...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && !group && <p>Group not found.</p>}
        {!isLoading && !error && group && (
          <>
            <h1>{group.name}</h1>
            <p><strong>Academic year:</strong> {group.academicYear}</p>
            <p>{group.description || 'No description'}</p>
          </>
        )}
      </section>

      {group && (
        <>
          <section className="page-card">
            <h2>Reviewers</h2>
            <form className="group-form" onSubmit={handleAssignReviewer}>
              <div className="group-form-grid">
                <select className="field-input" value={selectedReviewerId} onChange={(e) => setSelectedReviewerId(e.target.value)}>
                  <option value="">Select teacher reviewer</option>
                  {availableTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                  ))}
                </select>
              </div>
              <button className="primary-button" type="submit" disabled={isAssigning || !selectedReviewerId}>{isAssigning ? 'Assigning...' : 'Assign Reviewer'}</button>
            </form>
            {reviewers.length === 0 && <p>No reviewers assigned.</p>}
            {reviewers.length > 0 && (
              <div className="list-grid">
                {reviewers.map((reviewer) => (
                  <article className="entity-card" key={reviewer.id}>
                    <h3>{reviewer.firstName} {reviewer.lastName}</h3>
                    <p>{reviewer.email}</p>
                    <button className="secondary-button" onClick={() => handleRemoveReviewer(reviewer.reviewerId)} disabled={removingReviewerId === reviewer.reviewerId}>{removingReviewerId === reviewer.reviewerId ? 'Removing...' : 'Remove'}</button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="page-card">
            <h2>Group Tasks</h2>
            <form className="group-form" onSubmit={handleCreateTask}>
              <div className="group-form-grid">
                <select className="field-input" value={newTaskTemplateId} onChange={(e) => setNewTaskTemplateId(e.target.value)}>
                  <option value="">Select active task template</option>
                  {availableTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.order}. {template.title}</option>
                  ))}
                </select>
                <input className="field-input" type="datetime-local" value={newTaskDeadline} onChange={(e) => setNewTaskDeadline(e.target.value)} />
              </div>
              <button className="primary-button" type="submit" disabled={isCreatingTask || !newTaskTemplateId || !newTaskDeadline}>{isCreatingTask ? 'Assigning...' : 'Assign Task'}</button>
            </form>

            {sortedTasks.length === 0 && <p>No tasks assigned to this group.</p>}
            {sortedTasks.length > 0 && (
              <div className="list-grid">
                {sortedTasks.map((task) => (
                  <article className="entity-card" key={task.id}>
                    <h3>{task.taskOrder}. {task.taskTitle}</h3>
                    <p>{task.taskDescription || 'No description'}</p>
                    <p><strong>Deadline:</strong> {new Date(task.deadline).toLocaleString()}</p>
                    <p><strong>Student task count:</strong> {task.studentTaskCount}</p>
                    {editingTaskId === task.id ? (
                      <div className="actions-row">
                        <input className="field-input" type="datetime-local" value={editingTaskDeadline} onChange={(e) => setEditingTaskDeadline(e.target.value)} />
                        <button className="secondary-button" onClick={() => handleSaveTaskDeadline(task.id)} disabled={isSavingTask}>{isSavingTask ? 'Saving...' : 'Save'}</button>
                        <button className="secondary-button" onClick={cancelEditTask} disabled={isSavingTask}>Cancel</button>
                      </div>
                    ) : (
                      <div className="actions-row">
                        <button className="secondary-button" onClick={() => startEditTask(task)}>Edit Deadline</button>
                        {user?.role === 'Admin' && (
                          <button className="secondary-button" onClick={() => handleDeleteTask(task.id)} disabled={deletingTaskId === task.id}>{deletingTaskId === task.id ? 'Deleting...' : 'Delete'}</button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <hr />
            <h3>Assign Selected Active Templates</h3>
            {bulkCandidates.length === 0 && <p>All active templates are already assigned.</p>}
            {bulkCandidates.length > 0 && (
              <>
                <div className="list-grid">
                  {bulkCandidates.map((template) => (
                    <article className="entity-card" key={template.id}>
                      <h3>{template.order}. {template.title}</h3>
                      <p>{template.description || 'No description'}</p>
                      <input
                        className="field-input"
                        type="datetime-local"
                        value={bulkSelections[template.id] ?? ''}
                        onChange={(e) => handleBulkDeadlineChange(template.id, e.target.value)}
                      />
                    </article>
                  ))}
                </div>
                <div className="actions-row" style={{ marginTop: '12px' }}>
                  <button className="primary-button" onClick={handleAssignSelectedTasks} disabled={isBulkAssigning}>
                    {isBulkAssigning ? 'Assigning selected...' : 'Assign Selected Tasks'}
                  </button>
                </div>
                {bulkResultMessage && <p>{bulkResultMessage}</p>}
              </>
            )}
          </section>

          <section className="page-card">
            <h2>Students in Group</h2>
            {students.length === 0 && <p>No students assigned to this group.</p>}
            {students.length > 0 && (
              <div className="list-grid">
                {students.map((student) => (
                  <article className="entity-card" key={student.studentProfileId}>
                    <h3>{student.firstName} {student.lastName}</h3>
                    <p>{student.email}</p>
                    <p><strong>Status:</strong> <span className={student.isActive ? 'status-active' : 'status-inactive'}>{student.isActive ? 'Active' : 'Inactive'}</span></p>
                    <p><strong>Diploma topic:</strong> {student.diplomaTopic}</p>
                    <p><strong>Supervisor:</strong> {student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorFirstName} ${student.supervisorLastName}` : 'Not assigned'}</p>
                    <p><strong>Supervisor email:</strong> {student.supervisorEmail ?? 'Not assigned'}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
