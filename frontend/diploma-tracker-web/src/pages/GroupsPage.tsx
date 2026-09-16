import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, isApiConflict } from '../api/apiClient'
import { addGroupReviewer, createGroup, deleteGroup, getGroupReviewers, getGroups, removeGroupReviewer, updateGroup } from '../api/groupsApi'
import { getTeachers } from '../api/teachersApi'
import { getDepartments } from '../api/departmentsApi'
import type { Department, Group, GroupReviewer, Teacher } from '../api/types'
import { ErrorModal } from '../components/ErrorModal'

type CreateFormState = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}

type EditFormState = {
  departmentId: string
  name: string
  description: string
  academicYear: string
}

const emptyCreateForm: CreateFormState = {
  departmentId: '',
  name: '',
  description: '',
  academicYear: ''
}

const emptyEditForm: EditFormState = {
  departmentId: '',
  name: '',
  description: '',
  academicYear: ''
}

export function GroupsPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [reviewers, setReviewers] = useState<GroupReviewer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('')
  const [isLoadingReviewers, setIsLoadingReviewers] = useState(false)
  const [isAddingReviewer, setIsAddingReviewer] = useState(false)
  const [removingReviewerId, setRemovingReviewerId] = useState<string | null>(null)

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.name.localeCompare(b.name) || a.academicYear.localeCompare(b.academicYear)), [groups])
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])
  const availableTeachers = useMemo(() => activeTeachers.filter((teacher) => !reviewers.some((reviewer) => reviewer.reviewerId === teacher.id)), [activeTeachers, reviewers])

  const loadGroupsAndTeachers = async () => {
    setIsLoading(true)
    setError('')
    try {
      const [groupsData, teachersData, departmentsData] = await Promise.all([getGroups(), getTeachers(), getDepartments()])
      setGroups(groupsData)
      setTeachers(teachersData)
      setDepartments(departmentsData)
      if (!selectedGroupId && groupsData.length > 0) {
        setSelectedGroupId(groupsData[0].id)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadReviewers = async (groupId: string) => {
    setIsLoadingReviewers(true)
    setError('')
    try {
      const data = await getGroupReviewers(groupId)
      setReviewers(data)
    } catch (err) {
      setError((err as Error).message)
      setReviewers([])
    } finally {
      setIsLoadingReviewers(false)
    }
  }

  useEffect(() => {
    loadGroupsAndTeachers()
  }, [])

  useEffect(() => {
    if (selectedGroupId) {
      loadReviewers(selectedGroupId)
    } else {
      setReviewers([])
    }
  }, [selectedGroupId])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError('')
    try {
      await createGroup(createForm)
      setCreateForm(emptyCreateForm)
      await loadGroupsAndTeachers()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsCreating(false)
    }
  }

  const startEdit = (group: Group) => {
    setEditingGroupId(group.id)
    setEditForm({
      departmentId: group.departmentId,
      name: group.name,
      description: group.description ?? '',
      academicYear: group.academicYear
    })
  }

  const cancelEdit = () => {
    setEditingGroupId(null)
    setEditForm(emptyEditForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingGroupId) {
      return
    }

    setIsSavingEdit(true)
    setError('')
    try {
      await updateGroup(editingGroupId, editForm)
      cancelEdit()
      await loadGroupsAndTeachers()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group?')) {
      return
    }

    setDeletingGroupId(groupId)
    setError('')
    try {
      await deleteGroup(groupId)
      if (selectedGroupId === groupId) {
        setSelectedGroupId('')
      }
      await loadGroupsAndTeachers()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setDeletingGroupId(null)
    }
  }

  const handleAddReviewer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGroupId || !selectedReviewerId) {
      return
    }

    setIsAddingReviewer(true)
    setError('')
    try {
      await addGroupReviewer(selectedGroupId, selectedReviewerId)
      setSelectedReviewerId('')
      await loadReviewers(selectedGroupId)
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsAddingReviewer(false)
    }
  }

  const handleRemoveReviewer = async (reviewerId: string) => {
    if (!selectedGroupId || !window.confirm('Remove this reviewer from the group?')) {
      return
    }

    setRemovingReviewerId(reviewerId)
    setError('')
    try {
      await removeGroupReviewer(selectedGroupId, reviewerId)
      await loadReviewers(selectedGroupId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRemovingReviewerId(null)
    }
  }

  return (
    <div className="groups-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Manage Groups</h1>
        <form className="group-form" onSubmit={handleCreate}>
          <div className="group-form-grid">
            <select className="field-input" value={createForm.departmentId} onChange={(e) => setCreateForm((prev) => ({ ...prev, departmentId: e.target.value }))} required>
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.facultyName} — {department.name}</option>
              ))}
            </select>
            <input className="field-input" placeholder="Group name" value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <input className="field-input" placeholder="Academic year" value={createForm.academicYear} onChange={(e) => setCreateForm((prev) => ({ ...prev, academicYear: e.target.value }))} required />
            <input className="field-input" placeholder="Description" value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Group'}</button>
        </form>
      </section>

      {editingGroupId && (
        <section className="page-card">
          <h2>Edit Group</h2>
          <form className="group-form" onSubmit={handleSaveEdit}>
            <div className="group-form-grid">
              <select className="field-input" value={editForm.departmentId} onChange={(e) => setEditForm((prev) => ({ ...prev, departmentId: e.target.value }))} required>
                <option value="">Select department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.facultyName} — {department.name}</option>
                ))}
              </select>
              <input className="field-input" placeholder="Group name" value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} required />
              <input className="field-input" placeholder="Academic year" value={editForm.academicYear} onChange={(e) => setEditForm((prev) => ({ ...prev, academicYear: e.target.value }))} required />
              <input className="field-input" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Groups</h2>
        {isLoading && <p>Loading groups...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedGroups.length === 0 && <p>No groups found.</p>}
        {!isLoading && !error && sortedGroups.length > 0 && (
          <div className="list-grid">
            {sortedGroups.map((group) => (
              <article className="entity-card" key={group.id}>
                <h3>{group.name}</h3>
                <p><strong>Academic year:</strong> {group.academicYear}</p>
                <p><strong>Department:</strong> {group.departmentName} ({group.facultyName})</p>
                <p>{group.description || 'No description'}</p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(group)}>Edit</button>
                  <button className="secondary-button" onClick={() => navigate(`/admin/groups/${group.id}`)}>Details</button>
                  <button className="secondary-button" onClick={() => setSelectedGroupId(group.id)}>Reviewers</button>
                  <button className="secondary-button" onClick={() => handleDelete(group.id)} disabled={deletingGroupId === group.id}>{deletingGroupId === group.id ? 'Deleting...' : 'Delete'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="page-card">
        <h2>Group Reviewers</h2>
        <select className="field-input" value={selectedGroupId} onChange={(e) => setSelectedGroupId(e.target.value)}>
          <option value="">Select group</option>
          {sortedGroups.map((group) => (
            <option key={group.id} value={group.id}>{group.name} ({group.academicYear})</option>
          ))}
        </select>

        {selectedGroupId && (
          <>
            <form className="group-form" onSubmit={handleAddReviewer}>
              <div className="group-form-grid">
                <select className="field-input" value={selectedReviewerId} onChange={(e) => setSelectedReviewerId(e.target.value)} required>
                  <option value="">Select teacher reviewer</option>
                  {availableTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                  ))}
                </select>
              </div>
              <button className="primary-button" type="submit" disabled={isAddingReviewer || !selectedReviewerId}>{isAddingReviewer ? 'Assigning...' : 'Assign Reviewer'}</button>
            </form>

            {isLoadingReviewers && <p>Loading reviewers...</p>}
            {!isLoadingReviewers && reviewers.length === 0 && <p>No reviewers assigned.</p>}
            {!isLoadingReviewers && reviewers.length > 0 && (
              <div className="list-grid">
                {reviewers.map((reviewer) => (
                  <article className="entity-card" key={reviewer.id}>
                    <h3>{reviewer.firstName} {reviewer.lastName}</h3>
                    <p>{reviewer.email}</p>
                    <div className="actions-row">
                      <button className="secondary-button" onClick={() => handleRemoveReviewer(reviewer.reviewerId)} disabled={removingReviewerId === reviewer.reviewerId}>{removingReviewerId === reviewer.reviewerId ? 'Removing...' : 'Remove'}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
