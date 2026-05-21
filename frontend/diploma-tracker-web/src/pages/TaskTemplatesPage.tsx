import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../api/apiClient'
import { activateTaskTemplate, createTaskTemplate, deactivateTaskTemplate, getTaskTemplates, updateTaskTemplate } from '../api/taskTemplatesApi'
import type { TaskTemplate } from '../api/types'
import { ErrorModal, isApiConflict } from '../components/ErrorModal'

type CreateFormState = {
  title: string
  description: string
  order: string
}

type EditFormState = {
  title: string
  description: string
  order: string
  isActive: boolean
}

const emptyCreateForm: CreateFormState = {
  title: '',
  description: '',
  order: ''
}

const emptyEditForm: EditFormState = {
  title: '',
  description: '',
  order: '',
  isActive: true
}

export function TaskTemplatesPage() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm)
  const [isCreating, setIsCreating] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isChangingStateId, setIsChangingStateId] = useState<string | null>(null)

  const sortedTemplates = useMemo(() => [...templates].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)), [templates])

  const loadTemplates = async () => {
    setIsLoading(true)
    setError('')
    try {
      const data = await getTaskTemplates()
      setTemplates(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError('')
    try {
      await createTaskTemplate({
        title: createForm.title,
        description: createForm.description,
        order: Number(createForm.order)
      })
      setCreateForm(emptyCreateForm)
      await loadTemplates()
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

  const startEdit = (template: TaskTemplate) => {
    setEditingTemplateId(template.id)
    setEditForm({
      title: template.title,
      description: template.description ?? '',
      order: String(template.order),
      isActive: template.isActive
    })
  }

  const cancelEdit = () => {
    setEditingTemplateId(null)
    setEditForm(emptyEditForm)
  }

  const handleSaveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingTemplateId) {
      return
    }

    setIsSavingEdit(true)
    setError('')
    try {
      await updateTaskTemplate(editingTemplateId, {
        title: editForm.title,
        description: editForm.description,
        order: Number(editForm.order),
        isActive: editForm.isActive
      })
      cancelEdit()
      await loadTemplates()
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

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('Are you sure you want to deactivate this task template?')) {
      return
    }

    setIsChangingStateId(id)
    setError('')
    try {
      await deactivateTaskTemplate(id)
      await loadTemplates()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsChangingStateId(null)
    }
  }

  const handleActivate = async (id: string) => {
    setIsChangingStateId(id)
    setError('')
    try {
      await activateTaskTemplate(id)
      await loadTemplates()
    } catch (err) {
      if (isApiConflict(err)) {
        setModalMessage((err as ApiError).message)
      } else {
        setError((err as Error).message)
      }
    } finally {
      setIsChangingStateId(null)
    }
  }

  return (
    <div className="groups-page">
      {modalMessage && <ErrorModal message={modalMessage} onClose={() => setModalMessage('')} />}

      <section className="page-card">
        <h1>Task Templates</h1>
        <form className="group-form" onSubmit={handleCreate}>
          <div className="group-form-grid">
            <input className="field-input" placeholder="Title" value={createForm.title} onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))} required />
            <input className="field-input" placeholder="Order" type="number" min={1} value={createForm.order} onChange={(e) => setCreateForm((prev) => ({ ...prev, order: e.target.value }))} required />
            <input className="field-input" placeholder="Description" value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} />
          </div>
          <button className="primary-button" type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : 'Create Template'}</button>
        </form>
      </section>

      {editingTemplateId && (
        <section className="page-card">
          <h2>Edit Task Template</h2>
          <form className="group-form" onSubmit={handleSaveEdit}>
            <div className="group-form-grid">
              <input className="field-input" placeholder="Title" value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} required />
              <input className="field-input" placeholder="Order" type="number" min={1} value={editForm.order} onChange={(e) => setEditForm((prev) => ({ ...prev, order: e.target.value }))} required />
              <input className="field-input" placeholder="Description" value={editForm.description} onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))} />
              <label className="field-label"><input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.checked }))} /> Active</label>
            </div>
            <div className="actions-row">
              <button className="primary-button" type="submit" disabled={isSavingEdit}>{isSavingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={isSavingEdit}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="page-card">
        <h2>Templates</h2>
        {isLoading && <p>Loading templates...</p>}
        {!isLoading && error && <p className="error-text">{error}</p>}
        {!isLoading && !error && sortedTemplates.length === 0 && <p>No task templates found.</p>}
        {!isLoading && !error && sortedTemplates.length > 0 && (
          <div className="list-grid">
            {sortedTemplates.map((template) => (
              <article className="entity-card" key={template.id}>
                <h3>{template.order}. {template.title}</h3>
                <p>{template.description || 'No description'}</p>
                <p><strong>Status:</strong> <span className={template.isActive ? 'status-active' : 'status-inactive'}>{template.isActive ? 'Active' : 'Inactive'}</span></p>
                <div className="actions-row">
                  <button className="secondary-button" onClick={() => startEdit(template)}>Edit</button>
                  {template.isActive ? (
                    <button className="secondary-button" onClick={() => handleDeactivate(template.id)} disabled={isChangingStateId === template.id}>{isChangingStateId === template.id ? 'Updating...' : 'Deactivate'}</button>
                  ) : (
                    <button className="secondary-button" onClick={() => handleActivate(template.id)} disabled={isChangingStateId === template.id}>{isChangingStateId === template.id ? 'Updating...' : 'Activate'}</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
