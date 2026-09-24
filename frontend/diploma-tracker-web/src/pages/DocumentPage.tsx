import { ArrowLeft, Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteDocument, downloadDocumentVersion, getDocument, recallDocument } from '../api/documentsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { DocumentActionDialog, type DocumentDialogMode } from '../components/documents/DocumentActionDialog'
import { DocumentTimeline } from '../components/documents/DocumentTimeline'
import { documentStateTone } from '../components/documents/documentTones'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { Textarea } from '../components/ui/Textarea'
import { useToast } from '../components/ui/useToast'
import { refreshDocumentCounts } from '../components/layout/useDocumentCounts'
import { formatBytes } from '../components/workflow/formatBytes'
import type { DocumentDetails } from '../api/types'

// Fix wave M16: /documents/abc hits the {id:guid} route constraint, and the API answers a bare 404
// with no code. Refuse it on the client before asking, with the same message a real 404 would show.
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function DocumentPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [document, setDocument] = useState<DocumentDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [dialog, setDialog] = useState<DocumentDialogMode | null>(null)
  const [confirm, setConfirm] = useState<'recall' | 'delete' | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [recallComment, setRecallComment] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const requestRef = useRef(0)

  const locale = i18n.language === 'en' ? 'en-GB' : 'uk-UA'
  const dateTimeFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }), [locale])

  const load = async () => {
    const requestId = ++requestRef.current
    setIsLoading(true)
    setLoadError('')
    if (!GUID_PATTERN.test(id)) {
      setLoadError(t('errors.document.notFound'))
      setIsLoading(false)
      return
    }
    try {
      const data = await getDocument(id)
      if (requestRef.current !== requestId) return
      setDocument(data)
    } catch (err) {
      if (requestRef.current !== requestId) return
      setLoadError(errorMessage(err))
    } finally {
      if (requestRef.current === requestId) setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const confirmAction = async () => {
    if (!document || !confirm) return
    setIsConfirming(true)
    try {
      if (confirm === 'delete') {
        // Fix wave I2: every write carries expectedSequence, delete included.
        await deleteDocument(document.id, document.sequence)
        toast.success(t('documents.toasts.deleted'))
        navigate('/documents?section=mine')
        return
      }
      setDocument(await recallDocument(document.id, recallComment, document.sequence))
      toast.success(t('documents.toasts.recalled'))
      setConfirm(null)
      setRecallComment('')
      refreshDocumentCounts()
    } catch (err) {
      toast.error(errorMessage(err))
      // A stale view is the likely cause of a refusal here: reload what is there now.
      void load()
      setConfirm(null)
    } finally {
      setIsConfirming(false)
    }
  }

  const download = async (versionId: string, name: string) => {
    setDownloadingId(versionId)
    try {
      await downloadDocumentVersion(versionId, name)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading && !document) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    )
  }

  if (loadError || !document) {
    return (
      <Card>
        <p className="text-sm text-danger">{loadError || t('errors.server.unexpected')}</p>
      </Card>
    )
  }

  const actions: { mode: DocumentDialogMode; allowed: boolean; primary?: boolean }[] = [
    { mode: 'send', allowed: document.canSend, primary: true },
    { mode: 'forward', allowed: document.canForward, primary: true },
    { mode: 'done', allowed: document.canDone },
    { mode: 'reject', allowed: document.canReject },
    { mode: 'version', allowed: document.canAddVersion },
    { mode: 'edit', allowed: document.canEdit }
  ]
  const hasActions = actions.some((action) => action.allowed) || document.canRecall || document.canDelete

  return (
    <>
      <PageHeader
        title={document.title}
        description={`${t('documents.owner')}: ${document.ownerName}`}
        actions={
          <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/documents')}>
            {t('documents.back')}
          </Button>
        }
      />

      {document.rejection && (
        <Card className="mb-6 border-warning">
          <p className="text-sm font-semibold text-warning">{t('documents.rejectedTitle', { name: document.rejection.fromName })}</p>
          {document.rejection.comment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{document.rejection.comment}</p>}
        </Card>
      )}

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.columns.state')}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge tone={documentStateTone[document.state]}>{t(`documents.state.${document.state}`)}</Badge>
              {document.purpose && <Badge tone="neutral">{t(`documents.purpose.${document.purpose}`)}</Badge>}
            </div>
            {document.state === 'Completed' && document.completedByName && (
              <p className="mt-1 text-xs text-text-muted">{t('documents.completedBy', { name: document.completedByName })}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.holder')}</p>
            <p className="text-sm text-text-strong">{document.holderName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">{t('documents.versions')}</p>
            <p className="text-sm text-text-strong">{document.versions.length}</p>
          </div>
        </div>
        {document.description && <p className="mt-4 whitespace-pre-line text-sm text-text-strong">{document.description}</p>}
      </Card>

      {hasActions && (
        <Card title={t('documents.actions.title')} className="mb-6">
          {document.signedCopyRequired && <p className="mb-3 text-sm text-text-muted">{t('documents.signedCopyNeeded')}</p>}
          <div className="flex flex-wrap gap-2">
            {actions.filter((action) => action.allowed).map((action) => (
              <Button key={action.mode} variant={action.primary ? 'primary' : 'secondary'} onClick={() => setDialog(action.mode)}>
                {t(`documents.actions.${action.mode}`)}
              </Button>
            ))}
            {document.canRecall && <Button variant="secondary" onClick={() => setConfirm('recall')}>{t('documents.actions.recall')}</Button>}
            {document.canDelete && <Button variant="danger" onClick={() => setConfirm('delete')}>{t('documents.actions.delete')}</Button>}
          </div>
        </Card>
      )}

      <Card title={t('documents.versions')} className="mb-6">
        <ul className="flex flex-col divide-y divide-border-subtle">
          {[...document.versions].reverse().map((version) => {
            const size = formatBytes(version.sizeBytes, locale)
            return (
              <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-strong">
                    {t('documents.version', { number: version.number })} · {version.originalName}
                  </p>
                  <p className="text-xs text-text-muted">
                    {version.uploadedByName} · {dateTimeFormat.format(new Date(version.uploadedAt))} · {size.value} {t(`steps.fileSize.${size.unitKey}`)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  loading={downloadingId === version.id}
                  disabled={downloadingId !== null && downloadingId !== version.id}
                  onClick={() => void download(version.id, version.originalName)}
                >
                  {t('templates.download')}
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card title={t('documents.timeline')}>
        <DocumentTimeline events={document.events} />
      </Card>

      {dialog && (
        <DocumentActionDialog
          mode={dialog}
          document={document}
          onClose={() => setDialog(null)}
          onDone={(details) => {
            setDialog(null)
            setDocument(details)
            refreshDocumentCounts()
          }}
          onRefused={() => {
            setDialog(null)
            void load()
          }}
        />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={t(confirm === 'delete' ? 'documents.actions.delete' : 'documents.actions.recall')}
        message={
          confirm === 'delete' ? (
            t('documents.deleteConfirm', { title: document.title })
          ) : (
            <>
              <p>{t('documents.recallConfirm', { name: document.holderName ?? '' })}</p>
              <Textarea
                label={t('documents.fields.comment')}
                value={recallComment}
                maxLength={2000}
                onChange={(event) => setRecallComment(event.target.value)}
              />
            </>
          )
        }
        tone={confirm === 'delete' ? 'danger' : 'primary'}
        loading={isConfirming}
        onConfirm={() => void confirmAction()}
        onCancel={() => {
          setConfirm(null)
          setRecallComment('')
        }}
      />
    </>
  )
}
