import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { generateDocument, getEligibleStudents } from '../../api/templatesApi'
import { getTopics } from '../../api/topicsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { Select, type SelectOption } from '../ui/Select'
import { useToast } from '../ui/useToast'
import type { DocumentTemplate, EligibleStudent, Topic } from '../../api/types'

type DownloadDocumentDialogProps = {
  template: DocumentTemplate | null
  open: boolean
  onClose: () => void
}

type Audience = 'blank' | 'forStudent'

export function DownloadDocumentDialog({ template, open, onClose }: DownloadDocumentDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  const isStudent = user?.role === 'Student'

  const [topics, setTopics] = useState<Topic[]>([])
  const [eligibleStudents, setEligibleStudents] = useState<EligibleStudent[]>([])
  const [topicId, setTopicId] = useState('')
  const [audience, setAudience] = useState<Audience>('blank')
  const [studentId, setStudentId] = useState('')
  const [studentError, setStudentError] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [listLoadError, setListLoadError] = useState(false)

  useEffect(() => {
    if (!open) return

    setTopicId('')
    setAudience('blank')
    setStudentId('')
    setStudentError('')
    setListLoadError(false)

    let isCurrent = true
    const load = async () => {
      try {
        if (isStudent) {
          const data = await getTopics()
          if (isCurrent) setTopics(data)
        } else {
          const data = await getEligibleStudents()
          if (isCurrent) setEligibleStudents(data)
        }
      } catch {
        // The selector list is a convenience; its failure must not block a default download,
        // but the operator must be told the list could not be loaded (M10).
        if (isCurrent) setListLoadError(true)
      }
    }
    void load()

    return () => {
      isCurrent = false
    }
  }, [open, isStudent])

  const close = () => {
    if (isDownloading) return
    onClose()
  }

  const topicOptions: SelectOption[] = [
    { value: '', label: t('templates.myTopicDefault') },
    ...topics.map((topic) => ({ value: topic.id, label: topic.title }))
  ]

  const studentOptions: SelectOption[] = eligibleStudents.map((student) => ({
    value: student.id,
    label: `${student.name} · ${student.groupCode} · ${student.groupAcademicYear}`
  }))

  const listHint = listLoadError ? t('templates.listLoadError') : undefined

  const audienceOptions: SegmentedOption[] = [
    { value: 'blank', label: t('templates.blank') },
    { value: 'forStudent', label: t('templates.forStudent') }
  ]

  const handleDownload = async () => {
    if (!template) return

    if (!isStudent && audience === 'forStudent' && !studentId) {
      setStudentError(t('validation.required'))
      return
    }
    setStudentError('')

    setIsDownloading(true)
    try {
      const request = isStudent
        ? { topicId: topicId || undefined }
        : audience === 'forStudent'
          ? { studentId: studentId || undefined }
          : {}
      await generateDocument(template.id, request, `${template.name}.docx`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={template ? t('templates.downloadTitle', { name: template.name }) : ''}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isDownloading}>{t('common.cancel')}</Button>
          <Button loading={isDownloading} onClick={() => void handleDownload()}>{t('templates.download')}</Button>
        </>
      }
    >
      {isStudent ? (
        <Select label={t('templates.topic')} value={topicId} onChange={setTopicId} options={topicOptions} hint={listHint} />
      ) : (
        <>
          <SegmentedControl
            ariaLabel={t('templates.downloadAudienceLabel')}
            value={audience}
            onChange={(value) => setAudience(value as Audience)}
            options={audienceOptions}
          />
          {audience === 'forStudent' && (
            <Select
              label={t('templates.student')}
              value={studentId}
              onChange={setStudentId}
              options={studentOptions}
              placeholder={t('common.select')}
              error={studentError}
              hint={listHint}
            />
          )}
        </>
      )}
    </Modal>
  )
}
