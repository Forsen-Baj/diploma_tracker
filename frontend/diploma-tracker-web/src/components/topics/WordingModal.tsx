import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { WordingRequest } from '../../api/types'

type WordingModalProps = {
  open: boolean
  title: ReactNode
  hint: string
  confirmLabel: string
  initialTitle: string
  initialDescription: string | null
  loading?: boolean
  onConfirm: (request: WordingRequest) => void
  onClose: () => void
}

/** A topic's title and description: an approver's edit, or a returned student's resubmission. */
export function WordingModal({ open, title, hint, confirmLabel, initialTitle, initialDescription, loading = false, onConfirm, onClose }: WordingModalProps) {
  const { t } = useTranslation()
  const [topicTitle, setTopicTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setTopicTitle(initialTitle)
      setDescription(initialDescription ?? '')
    }
  }, [open, initialTitle, initialDescription])

  const close = () => {
    if (loading) return
    onClose()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onConfirm({ title: topicTitle.trim(), description: optional(description) })
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={loading}>{t('common.cancel')}</Button>
          <Button form="wording-form" type="submit" loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">{hint}</p>
      <form id="wording-form" onSubmit={submit} className="flex flex-col gap-4">
        <TextField label={t('topics.title')} maxLength={300} value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} required />
        <Textarea label={t('topics.description')} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>
    </Modal>
  )
}
