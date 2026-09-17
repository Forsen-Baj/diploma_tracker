import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { getDepartments } from '../api/departmentsApi'
import { addGroupReviewer, createGroup, deleteGroup, getGroupReviewers, getGroups, removeGroupReviewer, updateGroup } from '../api/groupsApi'
import { getTeachers } from '../api/teachersApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import { groupLabel } from '../utils/groupLabel'
import { optional } from '../utils/optional'
import type { Department, Group, GroupReviewer, Teacher } from '../api/types'

type GroupFormState = {
  departmentId: string
  code: string
  name: string
  description: string
  academicYear: string
}

const emptyGroupForm: GroupFormState = { departmentId: '', code: '', name: '', description: '', academicYear: '' }

export function GroupsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [reviewers, setReviewers] = useState<GroupReviewer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm)
  const [departmentError, setDepartmentError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [academicYearError, setAcademicYearError] = useState('')
  const [isSavingGroup, setIsSavingGroup] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)

  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('')
  const [isLoadingReviewers, setIsLoadingReviewers] = useState(false)
  const [isAddingReviewer, setIsAddingReviewer] = useState(false)
  const [removingReviewer, setRemovingReviewer] = useState<GroupReviewer | null>(null)
  const [isRemovingReviewer, setIsRemovingReviewer] = useState(false)

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.code.localeCompare(b.code) || a.academicYear.localeCompare(b.academicYear)),
    [groups]
  )
  const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers])
  const availableTeachers = useMemo(
    () => activeTeachers.filter((teacher) => !reviewers.some((reviewer) => reviewer.reviewerId === teacher.id)),
    [activeTeachers, reviewers]
  )

  const departmentOptions: SelectOption[] = useMemo(
    () => departments.map((department) => ({ value: department.id, label: `${department.name} · ${department.facultyName}` })),
    [departments]
  )

  const groupOptions: SelectOption[] = useMemo(
    () => sortedGroups.map((group) => ({ value: group.id, label: `${groupLabel(group)} (${group.academicYear})` })),
    [sortedGroups]
  )

  const reviewerOptions: SelectOption[] = useMemo(
    () => availableTeachers.map((teacher) => ({ value: teacher.id, label: `${teacher.firstName} ${teacher.lastName}` })),
    [availableTeachers]
  )

  const loadGroupsAndTeachers = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [groupsData, teachersData, departmentsData] = await Promise.all([getGroups(), getTeachers(), getDepartments()])
      setGroups(groupsData)
      setTeachers(teachersData)
      setDepartments(departmentsData)
      setSelectedGroupId((current) => (current || groupsData[0]?.id) ?? '')
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadReviewers = async (groupId: string) => {
    setIsLoadingReviewers(true)
    try {
      const data = await getGroupReviewers(groupId)
      setReviewers(data)
    } catch (err) {
      toast.error(errorMessage(err))
      setReviewers([])
    } finally {
      setIsLoadingReviewers(false)
    }
  }

  useEffect(() => {
    void loadGroupsAndTeachers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedReviewerId('')
    if (selectedGroupId) {
      void loadReviewers(selectedGroupId)
    } else {
      setReviewers([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId])

  const openCreateGroup = () => {
    setEditingGroup(null)
    setGroupForm(emptyGroupForm)
    setDepartmentError('')
    setCodeError('')
    setAcademicYearError('')
    setIsGroupModalOpen(true)
  }

  const openEditGroup = (group: Group) => {
    setEditingGroup(group)
    setGroupForm({
      departmentId: group.departmentId,
      code: group.code,
      name: group.name ?? '',
      description: group.description ?? '',
      academicYear: group.academicYear
    })
    setDepartmentError('')
    setCodeError('')
    setAcademicYearError('')
    setIsGroupModalOpen(true)
  }

  const closeGroupModal = () => {
    if (isSavingGroup) return
    setIsGroupModalOpen(false)
  }

  const submitGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedCode = groupForm.code.trim()
    const trimmedName = groupForm.name.trim()
    const trimmedAcademicYear = groupForm.academicYear.trim()
    const trimmedDescription = groupForm.description.trim()
    setDepartmentError(groupForm.departmentId ? '' : t('validation.required'))
    setCodeError(trimmedCode ? '' : t('validation.required'))
    setAcademicYearError(trimmedAcademicYear ? '' : t('validation.required'))
    if (!groupForm.departmentId || !trimmedCode || !trimmedAcademicYear) {
      return
    }

    setIsSavingGroup(true)
    const request = {
      departmentId: groupForm.departmentId,
      code: trimmedCode,
      name: optional(trimmedName),
      description: optional(trimmedDescription),
      academicYear: trimmedAcademicYear
    }
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, request)
      } else {
        await createGroup(request)
      }
      setIsGroupModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadGroupsAndTeachers()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // The department list may be stale (for example, deleted from another tab).
        await loadGroupsAndTeachers()
      }
      toast.error(errorMessage(err))
    } finally {
      setIsSavingGroup(false)
    }
  }

  const removeGroup = async () => {
    if (!deletingGroup) return

    setIsDeletingGroup(true)
    try {
      await deleteGroup(deletingGroup.id)
      if (selectedGroupId === deletingGroup.id) {
        setSelectedGroupId('')
      }
      setDeletingGroup(null)
      toast.success(t('common.deletedToast'))
      await loadGroupsAndTeachers()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingGroup(false)
    }
  }

  const handleAddReviewer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedGroupId || !selectedReviewerId) {
      return
    }

    setIsAddingReviewer(true)
    try {
      await addGroupReviewer(selectedGroupId, selectedReviewerId)
      setSelectedReviewerId('')
      toast.success(t('common.savedToast'))
      await loadReviewers(selectedGroupId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsAddingReviewer(false)
    }
  }

  const removeReviewer = async () => {
    if (!selectedGroupId || !removingReviewer) return

    setIsRemovingReviewer(true)
    try {
      await removeGroupReviewer(selectedGroupId, removingReviewer.reviewerId)
      setRemovingReviewer(null)
      toast.success(t('common.deletedToast'))
      await loadReviewers(selectedGroupId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsRemovingReviewer(false)
    }
  }

  const groupColumns: DataTableColumn<Group>[] = [
    {
      key: 'code',
      header: t('groups.code'),
      render: (group) => (
        <div>
          <div className="font-semibold">{group.code}</div>
          {group.name && <div className="text-xs text-text-muted">{group.name}</div>}
        </div>
      )
    },
    { key: 'academicYear', header: t('groups.academicYear'), render: (group) => group.academicYear },
    {
      key: 'department',
      header: t('groups.department'),
      render: (group) => (
        <div>
          <div>{group.departmentName}</div>
          <div className="text-xs text-text-muted">{group.facultyName}</div>
        </div>
      )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (group) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={ArrowRight} aria-label={t('groups.openDetails')} onClick={() => navigate(`/admin/groups/${group.id}`)} />
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditGroup(group)} />
          <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingGroup(group)} />
        </div>
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

  return (
    <>
      <PageHeader
        title={t('groups.title')}
        actions={<Button icon={Plus} onClick={openCreateGroup}>{t('groups.addGroup')}</Button>}
      />

      <Card className="mb-6">
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={groupColumns}
            rows={sortedGroups}
            getRowKey={(group) => group.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('groups.noGroups')} />}
          />
        )}
      </Card>

      <Card title={t('groups.reviewersTitle')}>
        <div className="mb-4 max-w-sm">
          <Select
            label={t('groups.group')}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            options={groupOptions}
            placeholder={t('common.select')}
          />
        </div>

        {selectedGroupId && (
          <>
            <form onSubmit={handleAddReviewer} className="mb-4 flex items-end gap-3">
              <div className="max-w-sm flex-1">
                <Select
                  label={t('groups.reviewer')}
                  value={selectedReviewerId}
                  onChange={setSelectedReviewerId}
                  options={reviewerOptions}
                  placeholder={t('common.select')}
                />
              </div>
              <Button type="submit" loading={isAddingReviewer} disabled={!selectedReviewerId}>
                {t('groups.assignReviewer')}
              </Button>
            </form>

            <DataTable
              columns={reviewerColumns}
              rows={reviewers}
              getRowKey={(reviewer) => reviewer.id}
              loading={isLoadingReviewers}
              emptyState={<EmptyState message={t('groups.noReviewers')} />}
            />
          </>
        )}
      </Card>

      <Modal
        open={isGroupModalOpen}
        onClose={closeGroupModal}
        title={editingGroup ? t('groups.editGroup') : t('groups.addGroup')}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeGroupModal} disabled={isSavingGroup}>{t('common.cancel')}</Button>
            <Button form="group-form" type="submit" loading={isSavingGroup}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="group-form" onSubmit={submitGroup} className="flex flex-col gap-4">
          <Select
            label={t('groups.department')}
            value={groupForm.departmentId}
            onChange={(value) => setGroupForm((prev) => ({ ...prev, departmentId: value }))}
            options={departmentOptions}
            placeholder={t('common.select')}
            error={departmentError}
          />
          <TextField
            label={t('groups.code')}
            maxLength={32}
            value={groupForm.code}
            onChange={(e) => setGroupForm((prev) => ({ ...prev, code: e.target.value }))}
            error={codeError}
            required
          />
          <TextField
            label={t('groups.name')}
            maxLength={200}
            hint={t('common.optional')}
            value={groupForm.name}
            onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <TextField
            label={t('groups.academicYear')}
            maxLength={50}
            value={groupForm.academicYear}
            onChange={(e) => setGroupForm((prev) => ({ ...prev, academicYear: e.target.value }))}
            error={academicYearError}
          />
          <Textarea
            label={t('groups.description')}
            maxLength={1000}
            value={groupForm.description}
            onChange={(e) => setGroupForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingGroup)}
        title={t('common.delete')}
        message={deletingGroup ? t('groups.deleteConfirm', { code: deletingGroup.code }) : ''}
        loading={isDeletingGroup}
        onConfirm={() => void removeGroup()}
        onCancel={() => setDeletingGroup(null)}
      />

      <ConfirmDialog
        open={Boolean(removingReviewer)}
        title={t('common.remove')}
        message={t('groups.removeReviewerConfirm')}
        loading={isRemovingReviewer}
        onConfirm={() => void removeReviewer()}
        onCancel={() => setRemovingReviewer(null)}
      />
    </>
  )
}
