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
import type { Direction, SupervisorOption, Topic } from '../../api/types'

type TopicFormModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initial?: Topic
  showSupervisor: boolean
  directions: Direction[]
  supervisors: SupervisorOption[]
  /** Phase 12 §4: when given, the supervisors on offer are loaded for the chosen direction's
   *  department (the teachers who cover it) instead of taken from `supervisors`. */
  loadSupervisors?: (departmentId: string) => Promise<SupervisorOption[]>
  /** Pre-selects the direction and hides the picker (a direction manager's "Add topic" on a direction row). */
  fixedDirectionId?: string
  /** Design 2026-09-27 §4.3: only an administrator moves a topic to another direction, so the
   *  picker is locked when anyone else edits a topic. */
  canMoveDirection?: boolean
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  title: string
  description: string
  directionId: string
  supervisorId: string
}

const emptyForm: FormState = { title: '', description: '', directionId: '', supervisorId: '' }

export function TopicFormModal({ open, mode, initial, showSupervisor, directions, supervisors, loadSupervisors, fixedDirectionId, canMoveDirection = true, onClose, onSaved }: TopicFormModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [directionError, setDirectionError] = useState('')
  const [supervisorError, setSupervisorError] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [loadedSupervisors, setLoadedSupervisors] = useState<SupervisorOption[]>([])

  useEffect(() => {
    if (!open) return
    setForm(
      initial
        ? {
            title: initial.title,
            description: initial.description ?? '',
            directionId: initial.directionId,
            supervisorId: initial.supervisorId
          }
        : { ...emptyForm, directionId: fixedDirectionId ?? '' }
    )
    setDirectionError('')
    setSupervisorError('')
    setError('')
  }, [open, initial, fixedDirectionId])

  const selectedDepartmentId = directions.find((d) => d.id === form.directionId)?.departmentId ?? ''
  // The topic's supervisor is held work: kept while the topic stays in its department.
  const keepsInitialSupervisor = Boolean(initial) && selectedDepartmentId === initial?.departmentId

  useEffect(() => {
    if (!open || !loadSupervisors) return
    if (!selectedDepartmentId) {
      setLoadedSupervisors([])
      return
    }

    let cancelled = false
    loadSupervisors(selectedDepartmentId)
      .then((options) => {
        if (cancelled) return
        setLoadedSupervisors(options)
        // A supervisor picked for another department does not carry over.
        setForm((prev) =>
          options.some((s) => s.id === prev.supervisorId) || (keepsInitialSupervisor && prev.supervisorId === initial?.supervisorId)
            ? prev
            : { ...prev, supervisorId: '' })
      })
      .catch((err) => {
        if (cancelled) return
        setLoadedSupervisors([])
        setError(errorMessage(err))
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDepartmentId])

  // §8: the picker lists the directions by department.
  const directionOptions: SelectOption[] = [...directions]
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.name.localeCompare(b.name))
    .map((direction) => ({
      value: direction.id,
      label: `${direction.departmentName} · ${direction.name}`
    }))
  const directionLocked = mode === 'edit' && !canMoveDirection

  const offeredSupervisors = loadSupervisors ? loadedSupervisors : supervisors
  const supervisorOptions: SelectOption[] = offeredSupervisors.map((s) => ({ value: s.id, label: s.name }))
  // A topic's supervisor can be deactivated after the topic was created; keep them selectable and
  // labelled so editing the topic (e.g. to fix a typo) doesn't appear to show "no supervisor".
  if (initial?.supervisorId && (!loadSupervisors || keepsInitialSupervisor) && !offeredSupervisors.some((s) => s.id === initial.supervisorId)) {
    supervisorOptions.push({ value: initial.supervisorId, label: t('students.inactiveSupervisor', { name: initial.supervisorName }) })
  }

  // A Reserved topic's requester takes the supervisor only when the request completes (§5.2), so
  // only a topic a student already holds moves their supervisor at once.
  const showSupervisorMoveWarning = showSupervisor && initial && initial.status === 'Approved'

  const close = () => {
    if (isSaving) return
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const directionMissing = !form.directionId
    const supervisorMissing = showSupervisor && !form.supervisorId
    setDirectionError(directionMissing ? t('validation.required') : '')
    setSupervisorError(supervisorMissing ? t('validation.required') : '')

    if (directionMissing || supervisorMissing) {
      return
    }

    const request = {
      title: form.title.trim(),
      description: optional(form.description),
      directionId: form.directionId,
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
        {!fixedDirectionId && (
          <Select
            label={t('topics.direction')}
            value={form.directionId}
            onChange={(value) => setForm((prev) => ({ ...prev, directionId: value }))}
            options={directionOptions}
            placeholder={t('common.select')}
            disabled={directionLocked}
            hint={directionLocked ? t('topics.directionLocked') : undefined}
            error={directionError}
          />
        )}
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
