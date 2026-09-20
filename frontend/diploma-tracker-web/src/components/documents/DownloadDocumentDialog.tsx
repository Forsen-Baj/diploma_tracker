import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import { getMyReservations } from '../../api/reservationsApi'
import { generateDocument, getEligibleStudents } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl'
import { Select, type SelectOption } from '../ui/Select'
import { useToast } from '../ui/useToast'
import type { DocumentTemplate, EligibleStudent, Reservation } from '../../api/types'

// A student's own topic candidates: only reservations that are still relevant (approved, or a
// pending request/change) and that actually carry a topic. There is never more than one Approved
// reservation and at most one Pending one at a time, so this is at most a 2-item list in practice.
type ReservationWithTopic = Reservation & { topicId: string }

function myTopicsFrom(reservations: Reservation[]): ReservationWithTopic[] {
  return reservations.filter(
    (reservation): reservation is ReservationWithTopic =>
      (reservation.status === 'Approved' || reservation.status === 'Pending') && Boolean(reservation.topicId)
  )
}

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

  const [reservations, setReservations] = useState<Reservation[]>([])
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
          const data = await getMyReservations()
          if (!isCurrent) return
          setReservations(data)
          // Default the selector (when there is one) to the approved topic, not the pending
          // change request.
          const candidates = myTopicsFrom(data)
          const approved = candidates.find((reservation) => reservation.status === 'Approved')
          setTopicId(approved?.topicId ?? candidates[0]?.topicId ?? '')
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

  const myTopics = myTopicsFrom(reservations)
  const topicOptions: SelectOption[] = myTopics.map((reservation) => ({ value: reservation.topicId, label: reservation.topicTitle }))

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
      // A single linked topic is passed to the backend implicitly (it looks up the student's own
      // topic); a `topicId` is only sent when the student actually chose between two candidates.
      const request = isStudent
        ? myTopics.length > 1
          ? { topicId: topicId || undefined }
          : {}
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
        myTopics.length > 1 ? (
          <Select label={t('templates.topic')} value={topicId} onChange={setTopicId} options={topicOptions} hint={listHint} />
        ) : myTopics.length === 1 ? (
          <p className="text-sm text-text-strong">{t('templates.topicContext', { title: myTopics[0].topicTitle })}</p>
        ) : (
          listLoadError && <p className="text-xs text-danger">{t('templates.listLoadError')}</p>
        )
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
