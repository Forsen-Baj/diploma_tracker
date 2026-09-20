import { Download, FileCode2, FilePlus2, FileText, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { deleteTemplate, downloadTemplateSource, getTemplates } from '../api/templatesApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { DownloadDocumentDialog } from '../components/documents/DownloadDocumentDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { TemplateEditorModal } from '../components/documents/TemplateEditorModal'
import { useToast } from '../components/ui/useToast'
import type { DocumentTemplate } from '../api/types'

export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const canCreate = user?.role === 'Admin' || user?.role === 'Teacher'

  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [downloadTarget, setDownloadTarget] = useState<DocumentTemplate | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | undefined>(undefined)
  const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [downloadingSourceId, setDownloadingSourceId] = useState<string | null>(null)

  // M14: `load` is triggered from several places (mount, a save, a delete) whose responses can
  // arrive out of order. A sequence ref (the `isCurrent` pattern generalised beyond one effect)
  // lets only the most recently started call apply its result.
  const loadSequence = useRef(0)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const load = async () => {
    const sequence = ++loadSequence.current
    setIsLoading(true)
    setLoadError('')
    try {
      const data = await getTemplates()
      if (loadSequence.current !== sequence) return
      setTemplates(data)
    } catch (err) {
      if (loadSequence.current !== sequence) return
      setLoadError(errorMessage(err))
    } finally {
      if (loadSequence.current === sequence) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCreate = () => {
    setEditingTemplate(undefined)
    setIsEditorOpen(true)
  }

  const openEdit = (template: DocumentTemplate) => {
    setEditingTemplate(template)
    setIsEditorOpen(true)
  }

  const closeEditor = () => setIsEditorOpen(false)

  const handleSaved = () => {
    setIsEditorOpen(false)
    toast.success(t('templates.saved'))
    void load()
  }

  const handleSourceDownload = async (template: DocumentTemplate) => {
    setDownloadingSourceId(template.id)
    try {
      await downloadTemplateSource(template.id, template.originalFileName)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloadingSourceId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deletingTemplate) return

    setIsDeleting(true)
    try {
      await deleteTemplate(deletingTemplate.id)
      setDeletingTemplate(null)
      toast.success(t('common.deletedToast'))
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDeleting(false)
    }
  }

  const audienceSummary = (template: DocumentTemplate): ReactNode => {
    const audience = template.audience
    if (!audience) return null

    const parts: ReactNode[] = []
    if (audience.visibleToAllStudents) parts.push(<Badge key="allStudents" tone="info">{t('templates.allStudentsBadge')}</Badge>)
    if (audience.visibleToAllTeachers) parts.push(<Badge key="allTeachers" tone="info">{t('templates.allTeachersBadge')}</Badge>)
    if (!audience.visibleToAllStudents || !audience.visibleToAllTeachers) {
      parts.push(
        <span key="counts">{t('templates.audienceSummary', { groups: audience.groups.length, teachers: audience.teachers.length })}</span>
      )
    }

    if (parts.length === 0) return null

    return <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">{parts}</div>
  }

  const columns: DataTableColumn<DocumentTemplate>[] = [
    {
      key: 'name',
      header: t('templates.name'),
      render: (template) => (
        <div>
          <p className="font-medium text-text-strong">{template.name}</p>
          {template.description && <p className="text-xs text-text-muted">{template.description}</p>}
          {template.canManage && audienceSummary(template)}
        </div>
      )
    },
    { key: 'owner', header: t('templates.owner'), render: (template) => template.ownerName },
    { key: 'updatedAt', header: t('templates.updatedAt'), render: (template) => dateFormat.format(new Date(template.updatedAt)) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (template) => (
        <div className="flex items-center gap-1">
          <Button variant="primary" size="sm" icon={Download} onClick={() => setDownloadTarget(template)}>
            {t('templates.download')}
          </Button>
          {template.canManage && (
            <>
              <Button variant="ghost" size="sm" icon={Pencil} aria-label={t('common.edit')} onClick={() => openEdit(template)} />
              <Button
                variant="ghost"
                size="sm"
                icon={FileCode2}
                aria-label={t('templates.sourceDownload')}
                loading={downloadingSourceId === template.id}
                disabled={downloadingSourceId !== null && downloadingSourceId !== template.id}
                onClick={() => void handleSourceDownload(template)}
              />
              <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('common.delete')} onClick={() => setDeletingTemplate(template)} />
            </>
          )}
        </div>
      )
    }
  ]

  return (
    <>
      <PageHeader
        title={t('templates.title')}
        description={t('templates.subtitle')}
        actions={canCreate ? <Button icon={FilePlus2} onClick={openCreate}>{t('templates.add')}</Button> : undefined}
      />

      <Card>
        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={templates}
            getRowKey={(template) => template.id}
            loading={isLoading}
            emptyState={<EmptyState icon={FileText} message={t('templates.empty')} />}
          />
        )}
      </Card>

      <DownloadDocumentDialog template={downloadTarget} open={Boolean(downloadTarget)} onClose={() => setDownloadTarget(null)} />

      <TemplateEditorModal
        open={isEditorOpen}
        template={editingTemplate}
        onClose={closeEditor}
        onSaved={handleSaved}
        onPartiallySaved={() => void load()}
      />

      <ConfirmDialog
        open={Boolean(deletingTemplate)}
        title={t('common.delete')}
        message={deletingTemplate ? t('templates.deleteConfirm', { name: deletingTemplate.name }) : ''}
        loading={isDeleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeletingTemplate(null)}
      />
    </>
  )
}
