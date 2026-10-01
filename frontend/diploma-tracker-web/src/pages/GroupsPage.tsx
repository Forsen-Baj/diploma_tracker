import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { getDepartments } from '../api/departmentsApi'
import { createGroup, deleteGroup, getGroupDeletionPreview, getGroups, updateGroup } from '../api/groupsApi'
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
import { optional } from '../utils/optional'
import type { Department, Group, GroupDeletionPreview } from '../api/types'

type GroupFormState = {
  departmentId: string
  code: string
  description: string
  academicYear: string
}

const emptyGroupForm: GroupFormState = { departmentId: '', code: '', description: '', academicYear: '' }

export function GroupsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
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
  const [deletionPreview, setDeletionPreview] = useState<GroupDeletionPreview | null>(null)
  const [isDeletingGroup, setIsDeletingGroup] = useState(false)
  const [previewLoadingGroupId, setPreviewLoadingGroupId] = useState<string | null>(null)

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.code.localeCompare(b.code) || a.academicYear.localeCompare(b.academicYear)),
    [groups]
  )
  const departmentOptions: SelectOption[] = useMemo(
    () => departments.map((department) => ({ value: department.id, label: `${department.name} · ${department.facultyName}` })),
    [departments]
  )

  const loadGroups = async () => {
    setIsLoading(true)
    setLoadError('')
    try {
      const [groupsData, departmentsData] = await Promise.all([getGroups(), getDepartments()])
      setGroups(groupsData)
      setDepartments(departmentsData)
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      await loadGroups()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // The department list may be stale (for example, deleted from another tab).
        await loadGroups()
      }
      toast.error(errorMessage(err))
    } finally {
      setIsSavingGroup(false)
    }
  }

  const openDeleteGroup = async (group: Group) => {
    setPreviewLoadingGroupId(group.id)
    try {
      const preview = await getGroupDeletionPreview(group.id)
      setDeletionPreview(preview)
      setDeletingGroup(group)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPreviewLoadingGroupId(null)
    }
  }

  const closeDeleteGroup = () => {
    if (isDeletingGroup) return
    setDeletingGroup(null)
    setDeletionPreview(null)
  }

  const removeGroup = async () => {
    if (!deletingGroup) return

    setIsDeletingGroup(true)
    try {
      await deleteGroup(deletingGroup.id)
      setDeletingGroup(null)
      setDeletionPreview(null)
      toast.success(t('common.deletedToast'))
      await loadGroups()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeletingGroup(false)
    }
  }

  const deleteGroupBlocked = Boolean(deletionPreview && deletionPreview.activeStudentCount > 0)

  const deleteGroupMessage = deletingGroup && deletionPreview && (
    <>
      <p>{t('groups.deleteConfirm', { code: deletingGroup.code })}</p>
      {deleteGroupBlocked ? (
        <p>{t('groups.deleteBlockedActiveStudents')}</p>
      ) : (
        <>
          {deletionPreview.archivedStudentCount > 0 && (
            <p>{t('groups.deleteAccounts', { count: deletionPreview.archivedStudentCount })}</p>
          )}
          {deletionPreview.fileCount > 0 && <p>{t('groups.deleteFiles', { count: deletionPreview.fileCount })}</p>}
          {deletionPreview.documentCount > 0 && <p>{t('groups.deleteDocuments', { count: deletionPreview.documentCount })}</p>}
        </>
      )}
    </>
  )

  const groupColumns: DataTableColumn<Group>[] = [
    {
      key: 'code',
      header: t('groups.code'),
      render: (group) => <div className="font-semibold">{group.code}</div>
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
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            aria-label={t('common.delete')}
            loading={previewLoadingGroupId === group.id}
            onClick={() => void openDeleteGroup(group)}
          />
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('groups.title')}
        actions={<Button icon={Plus} onClick={openCreateGroup}>{t('groups.addGroup')}</Button>}
      />

      <Card>
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
            label={t('groups.academicYear')}
            maxLength={20}
            hint={t('groups.academicYearHint')}
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
        message={deleteGroupMessage}
        hideConfirm={deleteGroupBlocked}
        loading={isDeletingGroup}
        onConfirm={() => void removeGroup()}
        onCancel={closeDeleteGroup}
      />
    </>
  )
}
