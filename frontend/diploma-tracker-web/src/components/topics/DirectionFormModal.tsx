import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createDirection, updateDirection } from '../../api/directionsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { Department, Direction, StaffOption } from '../../api/types'

type DirectionFormModalProps = {
  open: boolean
  initial?: Direction
  departments: Department[]
  /** Direction managers, for an administrator's form; ignored otherwise. */
  managers: StaffOption[]
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

export function DirectionFormModal({ open, initial, departments, managers, isAdmin, onClose, onSaved }: DirectionFormModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [departmentError, setDepartmentError] = useState('')
  const [managerError, setManagerError] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setDepartmentId(initial?.departmentId ?? '')
    setManagerId(initial?.managerId ?? '')
    setDepartmentError('')
    setManagerError('')
    setError('')
  }, [open, initial])

  const departmentOptions: SelectOption[] = departments.map((d) => ({ value: d.id, label: `${d.name} · ${d.facultyName}` }))
  const managerOptions: SelectOption[] = managers.map((m) => ({ value: m.id, label: m.name }))
  if (initial && !managers.some((m) => m.id === initial.managerId)) {
    managerOptions.push({ value: initial.managerId, label: initial.managerName })
  }

  const close = () => {
    if (isSaving) return
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const departmentMissing = !departmentId
    const managerMissing = isAdmin && !managerId
    setDepartmentError(departmentMissing ? t('validation.required') : '')
    setManagerError(managerMissing ? t('validation.required') : '')
    if (departmentMissing || managerMissing) return

    const request = {
      departmentId,
      name: name.trim(),
      description: optional(description),
      managerId: isAdmin ? managerId : undefined
    }

    setError('')
    setIsSaving(true)
    try {
      if (initial) {
        await updateDirection(initial.id, request)
      } else {
        await createDirection(request)
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  const managerChanged = isAdmin && initial && managerId !== initial.managerId

  return (
    <Modal
      open={open}
      onClose={close}
      title={initial ? t('directions.edit') : t('directions.add')}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="direction-form" type="submit" loading={isSaving}>{t('common.save')}</Button>
        </>
      }
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      <form id="direction-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <TextField label={t('directions.name')} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} required />
        <Textarea label={t('directions.description')} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label={t('directions.department')}
          value={departmentId}
          onChange={setDepartmentId}
          options={departmentOptions}
          placeholder={t('common.select')}
          error={departmentError}
        />
        {isAdmin && (
          managerOptions.length === 0 ? (
            <p className="text-sm text-text-muted">{t('directions.noManagers')}</p>
          ) : (
            <Select
              label={t('directions.manager')}
              value={managerId}
              onChange={setManagerId}
              options={managerOptions}
              placeholder={t('common.select')}
              hint={managerChanged ? t('directions.managerHint') : undefined}
              error={managerError}
            />
          )
        )}
      </form>
    </Modal>
  )
}
