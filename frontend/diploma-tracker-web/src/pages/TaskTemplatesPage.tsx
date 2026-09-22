import { GripVertical, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type HTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { getFaculties } from '../api/facultiesApi'
import { activateTaskTemplate, createTaskTemplate, deactivateTaskTemplate, getTaskTemplates, reorderTaskTemplates, updateTaskTemplate } from '../api/taskTemplatesApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Checkbox } from '../components/ui/Checkbox'
import { cn } from '../components/ui/cn'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/useToast'
import type { Faculty, TaskTemplate } from '../api/types'

type TemplateFormState = {
  title: string
  description: string
  order: string
  isActive: boolean
}

const emptyForm: TemplateFormState = { title: '', description: '', order: '', isActive: true }

export function TaskTemplatesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'

  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [isLoadingFaculties, setIsLoadingFaculties] = useState(true)
  const [facultiesLoadError, setFacultiesLoadError] = useState('')
  const [selectedFacultyId, setSelectedFacultyId] = useState('')

  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(emptyForm)
  const [titleError, setTitleError] = useState('')
  const [orderError, setOrderError] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  const [deactivatingTemplate, setDeactivatingTemplate] = useState<TaskTemplate | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [activatingTemplateId, setActivatingTemplateId] = useState<string | null>(null)

  const facultyOptions: SelectOption[] = useMemo(
    () => faculties.map((faculty) => ({ value: faculty.id, label: faculty.name })),
    [faculties]
  )

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [templates]
  )

  const loadFaculties = useCallback(async () => {
    setIsLoadingFaculties(true)
    setFacultiesLoadError('')
    try {
      const data = await getFaculties()
      setFaculties(data)
      setSelectedFacultyId((current) => (data.some((faculty) => faculty.id === current) ? current : (data[0]?.id ?? '')))
    } catch (err) {
      setFacultiesLoadError(errorMessage(err))
    } finally {
      setIsLoadingFaculties(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTemplates = useCallback(async (facultyId: string) => {
    if (!facultyId) {
      setTemplates([])
      return
    }

    setIsLoading(true)
    setLoadError('')
    try {
      setTemplates(await getTaskTemplates(facultyId))
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadFaculties()
  }, [loadFaculties])

  useEffect(() => {
    void loadTemplates(selectedFacultyId)
  }, [loadTemplates, selectedFacultyId])

  // The order is unique per faculty, so reordering only makes sense once a single faculty is
  // selected; it is also an administrator-only action.
  const canReorder = isAdmin && Boolean(selectedFacultyId)
  const [isReordering, setIsReordering] = useState(false)
  const dragIndexRef = useRef<number | null>(null)

  // Tracks the faculty currently selected so a reorder response (or its rollback) that arrives
  // after the admin switched faculty can be told apart from one that still applies.
  const selectedFacultyIdRef = useRef(selectedFacultyId)
  useEffect(() => {
    selectedFacultyIdRef.current = selectedFacultyId
  }, [selectedFacultyId])

  const applyReorder = async (reordered: TaskTemplate[]) => {
    const requestFacultyId = selectedFacultyId
    const previous = templates
    const renumbered = reordered.map((template, index) => ({ ...template, order: index + 1 }))
    setTemplates(renumbered)
    setIsReordering(true)
    try {
      const response = await reorderTaskTemplates(requestFacultyId, renumbered.map((template) => template.id))
      if (selectedFacultyIdRef.current !== requestFacultyId) return
      setTemplates(response)
      toast.success(t('taskTemplates.reordered'))
    } catch (err) {
      if (selectedFacultyIdRef.current !== requestFacultyId) return
      setTemplates(previous)
      toast.error(errorMessage(err))
    } finally {
      setIsReordering(false)
    }
  }

  const moveTemplate = (fromIndex: number, toIndex: number) => {
    if (!canReorder || isReordering) return
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= sortedTemplates.length) return

    const reordered = [...sortedTemplates]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    void applyReorder(reordered)
  }

  const handleDragStart = (event: DragEvent<HTMLTableRowElement>, index: number) => {
    dragIndexRef.current = index
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', sortedTemplates[index].id)
  }

  const handleDrop = (event: DragEvent<HTMLTableRowElement>, index: number) => {
    event.preventDefault()
    const fromIndex = dragIndexRef.current
    dragIndexRef.current = null
    if (fromIndex === null) return
    moveTemplate(fromIndex, index)
  }

  const templateRowProps = (template: TaskTemplate): HTMLAttributes<HTMLTableRowElement> => {
    if (!canReorder || isReordering) return {}

    const index = sortedTemplates.findIndex((item) => item.id === template.id)
    return {
      draggable: true,
      onDragStart: (event) => handleDragStart(event, index),
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => handleDrop(event, index)
    }
  }

  const openCreateTemplate = () => {
    setEditingTemplate(null)
    setTemplateForm(emptyForm)
    setTitleError('')
    setOrderError('')
    setIsTemplateModalOpen(true)
  }

  const openEditTemplate = (template: TaskTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      title: template.title,
      description: template.description ?? '',
      order: String(template.order),
      isActive: template.isActive
    })
    setTitleError('')
    setOrderError('')
    setIsTemplateModalOpen(true)
  }

  const closeTemplateModal = () => {
    if (isSavingTemplate) return
    setIsTemplateModalOpen(false)
  }

  const submitTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedTitle = templateForm.title.trim()
    const order = Number(templateForm.order)
    const titleMissing = !trimmedTitle
    const orderMissing = !templateForm.order
    const orderOutOfRange = !orderMissing && (!Number.isInteger(order) || order < 1)
    setTitleError(titleMissing ? t('validation.required') : '')
    setOrderError(orderMissing ? t('validation.required') : orderOutOfRange ? t('errors.taskTemplate.orderInvalid') : '')

    if (titleMissing || orderMissing || orderOutOfRange || !selectedFacultyId) {
      return
    }

    setIsSavingTemplate(true)
    try {
      if (editingTemplate) {
        await updateTaskTemplate(editingTemplate.id, {
          facultyId: editingTemplate.facultyId,
          title: trimmedTitle,
          description: templateForm.description.trim(),
          order,
          isActive: templateForm.isActive
        })
      } else {
        await createTaskTemplate({
          facultyId: selectedFacultyId,
          title: trimmedTitle,
          description: templateForm.description.trim(),
          order
        })
      }
      setIsTemplateModalOpen(false)
      toast.success(t('common.savedToast'))
      await loadTemplates(selectedFacultyId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivatingTemplate) return

    setIsDeactivating(true)
    try {
      await deactivateTaskTemplate(deactivatingTemplate.id)
      setDeactivatingTemplate(null)
      toast.success(t('common.savedToast'))
      await loadTemplates(selectedFacultyId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeactivating(false)
    }
  }

  const handleActivate = async (template: TaskTemplate) => {
    setActivatingTemplateId(template.id)
    try {
      await activateTaskTemplate(template.id)
      toast.success(t('common.savedToast'))
      await loadTemplates(selectedFacultyId)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setActivatingTemplateId(null)
    }
  }

  const reorderColumn: DataTableColumn<TaskTemplate> = {
    key: 'reorder',
    header: <span className="sr-only">{t('taskTemplates.dragHandle')}</span>,
    render: (template) => {
      const index = sortedTemplates.findIndex((item) => item.id === template.id)
      return (
        <div className="flex items-center gap-1">
          <span
            className={cn('inline-flex items-center text-text-muted', canReorder ? 'cursor-grab' : 'cursor-not-allowed opacity-50')}
            aria-label={t('taskTemplates.dragHandle')}
          >
            <GripVertical className="size-4" aria-hidden />
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('taskTemplates.moveUp')}
            disabled={!canReorder || isReordering || index <= 0}
            onClick={() => moveTemplate(index, index - 1)}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('taskTemplates.moveDown')}
            disabled={!canReorder || isReordering || index >= sortedTemplates.length - 1}
            onClick={() => moveTemplate(index, index + 1)}
          >
            ↓
          </Button>
        </div>
      )
    }
  }

  const templateColumns: DataTableColumn<TaskTemplate>[] = [
    ...(isAdmin ? [reorderColumn] : []),
    { key: 'order', header: t('taskTemplates.order'), render: (template) => template.order },
    {
      key: 'title',
      header: t('taskTemplates.titleField'),
      render: (template) => (
        <div>
          <div>{template.title}</div>
          <div className="text-xs text-text-muted">{template.description || t('common.noDescription')}</div>
        </div>
      )
    },
    {
      key: 'active',
      header: t('common.status'),
      render: (template) => <Badge tone={template.isActive ? 'success' : 'neutral'}>{template.isActive ? t('common.active') : t('common.inactive')}</Badge>
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (template) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEditTemplate(template)} />
          {template.isActive ? (
            <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('taskTemplates.deactivate')} onClick={() => setDeactivatingTemplate(template)} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              aria-label={t('taskTemplates.activate')}
              loading={activatingTemplateId === template.id}
              onClick={() => void handleActivate(template)}
            />
          )}
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('taskTemplates.title')}
        actions={<Button icon={Plus} onClick={openCreateTemplate} disabled={!selectedFacultyId}>{t('taskTemplates.add')}</Button>}
      />

      <Card className="mb-6">
        {facultiesLoadError && <p className="text-sm text-danger">{facultiesLoadError}</p>}
        {!facultiesLoadError && (
          <div className="max-w-sm">
            <Select
              label={t('taskTemplates.faculty')}
              value={selectedFacultyId}
              onChange={setSelectedFacultyId}
              options={facultyOptions}
              placeholder={t('common.select')}
              disabled={isLoadingFaculties}
            />
          </div>
        )}
      </Card>

      <Card>
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        {!loadError && !selectedFacultyId && !isLoadingFaculties && (
          <EmptyState message={t('taskTemplates.selectFaculty')} />
        )}
        {!loadError && selectedFacultyId && (
          <>
            {canReorder && <p className="mb-3 text-xs text-text-muted">{t('taskTemplates.reorderHint')}</p>}
            <DataTable
              columns={templateColumns}
              rows={sortedTemplates}
              getRowKey={(template) => template.id}
              loading={isLoading}
              emptyState={<EmptyState message={t('taskTemplates.noTemplates')} />}
              rowProps={isAdmin ? templateRowProps : undefined}
            />
          </>
        )}
      </Card>

      <Modal
        open={isTemplateModalOpen}
        onClose={closeTemplateModal}
        title={editingTemplate ? t('taskTemplates.edit') : t('taskTemplates.add')}
        footer={
          <>
            <Button variant="secondary" onClick={closeTemplateModal} disabled={isSavingTemplate}>{t('common.cancel')}</Button>
            <Button form="task-template-form" type="submit" loading={isSavingTemplate}>{t('common.save')}</Button>
          </>
        }
      >
        <form id="task-template-form" onSubmit={submitTemplate} className="flex flex-col gap-4">
          {editingTemplate && (
            <TextField label={t('taskTemplates.faculty')} value={editingTemplate.facultyName} disabled readOnly />
          )}
          <TextField
            label={t('taskTemplates.titleField')}
            maxLength={200}
            value={templateForm.title}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, title: e.target.value }))}
            error={titleError}
          />
          <Textarea
            label={t('taskTemplates.description')}
            maxLength={1000}
            value={templateForm.description}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <TextField
            label={t('taskTemplates.order')}
            type="number"
            min={1}
            value={templateForm.order}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, order: e.target.value }))}
            error={orderError}
          />
          {editingTemplate && (
            <Checkbox
              label={t('taskTemplates.active')}
              checked={templateForm.isActive}
              onChange={(checked) => setTemplateForm((prev) => ({ ...prev, isActive: checked }))}
            />
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivatingTemplate)}
        title={t('taskTemplates.deactivate')}
        message={deactivatingTemplate ? t('taskTemplates.deactivateConfirm', { title: deactivatingTemplate.title }) : ''}
        loading={isDeactivating}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setDeactivatingTemplate(null)}
      />
    </>
  )
}
