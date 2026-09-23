import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { submitWork } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { FileInput } from '../ui/FileInput'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../ui/useToast'
import type { StepDetails } from '../../api/types'

type SubmitWorkFormProps = {
  step: StepDetails
  onSubmitted: (details: StepDetails) => void
}

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_SUPPORTING_FILES = 3
const MAIN_EXTENSIONS = ['.docx', '.pdf', '.pptx']
const BLOCKED_EXTENSIONS = ['.exe', '.dll', '.msi', '.bat', '.cmd', '.ps1', '.sh', '.js', '.vbs', '.jar', '.com', '.scr']

function extensionOf(fileName: string): string {
  // Mirrors the server's `TrimEnd('.', ' ')` so a name like "tool.exe." resolves to the same
  // extension on both sides instead of slipping past the client blocklist with a trailing dot.
  const trimmed = fileName.replace(/[. ]+$/, '')
  const index = trimmed.lastIndexOf('.')
  return index === -1 ? '' : trimmed.slice(index).toLowerCase()
}

export function SubmitWorkForm({ step, onSubmitted }: SubmitWorkFormProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [mainFile, setMainFile] = useState<File | null>(null)
  const [supportingFiles, setSupportingFiles] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [mainError, setMainError] = useState('')
  const [supportingError, setSupportingError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const validate = (): boolean => {
    let isValid = true

    if (!mainFile) {
      setMainError(t('errors.file.mainMissing'))
      isValid = false
    } else if (!MAIN_EXTENSIONS.includes(extensionOf(mainFile.name))) {
      setMainError(t('errors.file.typeNotAllowed'))
      isValid = false
    } else if (mainFile.size === 0) {
      setMainError(t('errors.file.mainMissing'))
      isValid = false
    } else if (mainFile.size > MAX_FILE_BYTES) {
      setMainError(t('errors.file.tooLarge'))
      isValid = false
    } else {
      setMainError('')
    }

    if (supportingFiles.length > MAX_SUPPORTING_FILES) {
      setSupportingError(t('errors.file.tooMany'))
      isValid = false
    } else if (supportingFiles.some((file) => BLOCKED_EXTENSIONS.includes(extensionOf(file.name)))) {
      setSupportingError(t('errors.file.typeNotAllowed'))
      isValid = false
    } else if (supportingFiles.some((file) => file.size > MAX_FILE_BYTES)) {
      setSupportingError(t('errors.file.tooLarge'))
      isValid = false
    } else {
      setSupportingError('')
    }

    return isValid
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate() || !mainFile) {
      return
    }

    setIsSubmitting(true)
    try {
      const details = await submitWork(step.id, mainFile, supportingFiles, message)
      setMainFile(null)
      setSupportingFiles([])
      setMessage('')
      setResetKey((key) => key + 1)
      toast.success(t('steps.submitted'))
      onSubmitted(details)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card title={t('steps.submitTitle')}>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        <FileInput
          label={t('steps.mainFile')}
          accept=".docx,.pdf,.pptx"
          hint={t('steps.mainHint')}
          error={mainError}
          resetKey={resetKey}
          onChange={(files) => setMainFile(files[0] ?? null)}
        />
        <FileInput
          label={t('steps.supportingFiles')}
          multiple
          hint={t('steps.supportingHint')}
          error={supportingError}
          resetKey={resetKey}
          onChange={setSupportingFiles}
        />
        <Textarea
          label={t('steps.message')}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <div>
          <Button type="submit" loading={isSubmitting}>{t('steps.submit')}</Button>
        </div>
      </form>
    </Card>
  )
}
