import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createTopic, updateTopic } from '../../api/topicsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { Department, Teacher, Topic } from '../../api/types'

type TopicFormModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Topic
  showSupervisor: boolean
  departments: Department[]
  teachers: Teacher[]
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  title: string
  description: string
  departmentId: string
  supervisorId: string
}

const emptyForm: FormState = { title: '', description: '', departmentId: '', supervisorId: '' }

export function TopicFormModal({ open, mode, initial, showSupervisor, departments, teachers, onClose, onSaved }: TopicFormModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [departmentError, setDepartmentError] = useState('')
  const [supervisorError, setSupervisorError] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      initial
        ? {
            title: initial.title,
            description: initial.description ?? '',
            departmentId: initial.departmentId,
            supervisorId: initial.supervisorId
          }
        : emptyForm
    )
    setDepartmentError('')
    setSupervisorError('')
    setError('')
  }, [open, initial])

  const departmentOptions: SelectOption[] = departments.map((department) => ({
    value: department.id,
    label: `${department.name} · ${department.facultyName}`
  }))

  const activeTeachers = teachers.filter((teacher) => teacher.isActive)
  const supervisorOptions: SelectOption[] = activeTeachers.map((teacher) => ({
    value: teacher.id,
    label: `${teacher.lastName} ${teacher.firstName}`
  }))
  // A topic's supervisor can be deactivated after the topic was created; keep them selectable and
  // labelled so editing the topic (e.g. to fix a typo) doesn't appear to show "no supervisor".
  if (initial?.supervisorId && !activeTeachers.some((teacher) => teacher.id === initial.supervisorId)) {
    supervisorOptions.push({ value: initial.supervisorId, label: t('students.inactiveSupervisor', { name: initial.supervisorName }) })
  }

  const showSupervisorMoveWarning = showSupervisor && initial && (initial.status === 'Reserved' || initial.status === 'Approved')

  const close = () => {
    if (isSaving) return
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const departmentMissing = !form.departmentId
    const supervisorMissing = showSupervisor && !form.supervisorId
    setDepartmentError(departmentMissing ? t('validation.required') : '')
    setSupervisorError(supervisorMissing ? t('validation.required') : '')

    if (departmentMissing || supervisorMissing) {
      return
    }

    const request = {
      title: form.title.trim(),
      description: optional(form.description),
      departmentId: form.departmentId,
      supervisorId: showSupervisor ? optional(form.supervisorId) : undefined
    }

    setError('')
    setIsSaving(true)
    try {
      if (mode === 'edit' && initial) {
        await updateTopic(initial.id, request)
      } else {
        await createTopic(request)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={mode === 'edit' ? t('topics.editTopic') : t('topics.addTopic')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="topic-form" type="submit" loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      <form id="topic-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField
          label={t('topics.title')}
          maxLength={300}
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          required
        />
        <Textarea
          label={t('topics.description')}
          maxLength={4000}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
        <Select
          label={t('topics.department')}
          value={form.departmentId}
          onChange={(value) => setForm((prev) => ({ ...prev, departmentId: value }))}
          options={departmentOptions}
          placeholder={t('common.select')}
          error={departmentError}
        />
        {showSupervisor && (
          <Select
            label={t('topics.supervisor')}
            value={form.supervisorId}
            onChange={(value) => setForm((prev) => ({ ...prev, supervisorId: value }))}
            options={supervisorOptions}
            placeholder={t('common.select')}
            hint={showSupervisorMoveWarning ? t('topics.supervisorMoveWarning') : undefined}
            error={supervisorError}
          />
        )}
      </form>
    </Modal>
  )
}
