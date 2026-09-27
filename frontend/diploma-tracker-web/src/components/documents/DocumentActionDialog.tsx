import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import {
  addDocumentVersion,
  completeDocument,
  forwardDocument,
  rejectDocument,
  sendDocument,
  updateDocument
} from '../../api/documentsApi'
import { snapshotFile } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { FileInput } from '../ui/FileInput'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import { documentFileAccept, documentMaxFileBytes } from './NewDocumentDialog'
import { PersonPicker } from './PersonPicker'
import type { DocumentDetails, DocumentPurpose } from '../../api/types'

export type DocumentDialogMode = 'send' | 'forward' | 'reject' | 'done' | 'version' | 'edit'

// Fix wave I1: a code in this set means the view the dialog was opened from is stale (someone else
// acted on the document, or the caller's role in it changed) rather than something the user can fix
// by editing the form. The dialog closes and the page reloads instead of leaving the user stuck
// retrying the same refused write.
const STALE_VIEW_CODES = new Set([
  'document.changed',
  'document.wrongState',
  'document.notHolder',
  'document.notOwner',
  'document.notFound'
])

type DocumentActionDialogProps = {
  mode: DocumentDialogMode
  document: DocumentDetails
  onClose: () => void
  onDone: (details: DocumentDetails) => void
  /** The write was refused because the view is stale: close the dialog and reload the document. */
  onRefused: () => void
}

export function DocumentActionDialog({ mode, document, onClose, onDone, onRefused }: DocumentActionDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const defaultTarget = document.rejectTargets.find((target) => target.isDefault) ?? document.rejectTargets[0]
  const [recipientId, setRecipientId] = useState('')
  const [purpose, setPurpose] = useState<DocumentPurpose>('Review')
  const [targetId, setTargetId] = useState(defaultTarget?.id ?? '')
  const [comment, setComment] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(document.title)
  const [description, setDescription] = useState(document.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // A signing turn needs the signed copy on the way out (§4.2); the server enforces it too.
  const fileRequired = mode === 'version' || ((mode === 'forward' || mode === 'done') && document.signedCopyRequired)
  const showsFile = mode === 'version' || mode === 'forward' || mode === 'done'
  const commentRequired = mode === 'reject'

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if ((mode === 'send' || mode === 'forward') && !recipientId) next.recipient = t('validation.required')
    if (mode === 'reject' && !targetId) next.target = t('validation.required')
    if (commentRequired && !comment.trim()) next.comment = t('validation.required')
    if (fileRequired && !file) next.file = t('validation.required')
    // Fix wave M8: refuse an oversized file before it uploads, the same way SubmitWorkForm does.
    else if (file && file.size > documentMaxFileBytes) next.file = t('errors.file.tooLarge')
    if (mode === 'edit' && !title.trim()) next.title = t('validation.required')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setIsSaving(true)
    try {
      let fresh: File | null = null
      if (file) {
        try {
          fresh = await snapshotFile(file)
        } catch {
          setErrors({ file: t('documents.fileChanged') })
          return
        }
      }

      const sequence = document.sequence
      const details =
        mode === 'send' ? await sendDocument(document.id, recipientId, purpose, comment, sequence)
        : mode === 'forward' ? await forwardDocument(document.id, recipientId, purpose, comment, fresh, sequence)
        : mode === 'reject' ? await rejectDocument(document.id, targetId, comment, sequence)
        : mode === 'done' ? await completeDocument(document.id, comment, fresh, sequence)
        : mode === 'version' ? await addDocumentVersion(document.id, fresh!, comment, sequence)
        : await updateDocument(document.id, title.trim(), description, sequence)

      toast.success(t(`documents.toasts.${mode}`))
      onDone(details)
    } catch (err) {
      toast.error(errorMessage(err))
      // Fix wave I1: a stale view keeps failing the same way on retry (the sequence never changes)
      // until the page reloads what is there now.
      if (err instanceof ApiError && err.code && STALE_VIEW_CODES.has(err.code)) {
        onRefused()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={isSaving ? () => undefined : onClose}
      title={t(`documents.dialog.${mode}`)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button onClick={() => void submit()} loading={isSaving}>{t(`documents.actions.${mode}`)}</Button>
        </>
      }
    >
      {mode === 'edit' && (
        <>
          <TextField label={t('documents.fields.title')} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} error={errors.title} />
          <Textarea label={t('documents.fields.description')} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
        </>
      )}

      {(mode === 'send' || mode === 'forward') && (
        <>
          <PersonPicker value={recipientId} onChange={setRecipientId} error={errors.recipient} />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-text-strong">{t('documents.fields.purpose')}</p>
            <SegmentedControl
              ariaLabel={t('documents.fields.purpose')}
              value={purpose}
              onChange={(value) => setPurpose(value as DocumentPurpose)}
              options={[
                { value: 'Review', label: t('documents.purpose.Review') },
                { value: 'Signing', label: t('documents.purpose.Signing') }
              ]}
            />
          </div>
        </>
      )}

      {mode === 'reject' && (
        <Select
          label={t('documents.fields.target')}
          value={targetId}
          onChange={setTargetId}
          options={document.rejectTargets.map((target) => ({ value: target.id, label: target.name }))}
          error={errors.target}
        />
      )}

      {showsFile && (
        <FileInput
          label={document.signedCopyRequired && mode !== 'version' ? t('documents.fields.signedCopy') : t('documents.fields.file')}
          hint={document.signedCopyRequired && mode !== 'version' ? t('documents.fields.signedCopyHint') : t('documents.fields.fileHint')}
          accept={documentFileAccept}
          onChange={(files) => setFile(files[0] ?? null)}
          error={errors.file}
        />
      )}

      {mode !== 'edit' && (
        <Textarea label={t('documents.fields.comment')} value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} error={errors.comment} />
      )}
    </Modal>
  )
}
