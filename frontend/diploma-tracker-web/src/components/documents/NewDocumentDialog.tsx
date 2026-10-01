import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createDocument } from '../../api/documentsApi'
import { snapshotFile } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { FileInput } from '../ui/FileInput'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import type { DocumentDetails } from '../../api/types'

export const documentFileAccept = '.pdf,.docx,.pptx,.png,.jpg,.jpeg'
// Fix wave M8: matches the server's cap (SubmissionFileRules.MaxFileBytes) so an oversized file is
// refused before the upload starts, the same way SubmitWorkForm already does.
export const documentMaxFileBytes = 20 * 1024 * 1024
type NewDocumentDialogProps = {
  onClose: () => void
  onCreated: (document: DocumentDetails) => void
}

export function NewDocumentDialog({ onClose, onCreated }: NewDocumentDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [titleError, setTitleError] = useState('')
  const [fileError, setFileError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const submit = async () => {
    const tooLarge = Boolean(file) && file!.size > documentMaxFileBytes
    setTitleError(title.trim() ? '' : t('validation.required'))
    setFileError(!file ? t('validation.required') : tooLarge ? t('errors.file.tooLarge') : '')
    if (!title.trim() || !file || tooLarge) return

    setIsSaving(true)
    try {
      let fresh: File
      try {
        fresh = await snapshotFile(file)
      } catch {
        setFileError(t('documents.fileChanged'))
        return
      }
      const document = await createDocument(title.trim(), description, fresh)
      toast.success(t('documents.toasts.created'))
      onCreated(document)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={isSaving ? () => undefined : onClose}
      title={t('documents.newTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button onClick={() => void submit()} loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      <TextField label={t('documents.fields.title')} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} error={titleError} />
      <Textarea label={t('documents.fields.description')} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
      <FileInput label={t('documents.fields.file')} hint={t('documents.fields.fileHint')} accept={documentFileAccept} onChange={(files) => setFile(files[0] ?? null)} error={fileError} />
    </Modal>
  )
}
