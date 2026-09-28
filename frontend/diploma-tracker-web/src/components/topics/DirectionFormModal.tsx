import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createDirection, updateDirection } from '../../api/directionsApi'
import { getStaff } from '../../api/staffApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select, type SelectOption } from '../ui/Select'
import { TextField } from '../ui/TextField'
import { Textarea } from '../ui/Textarea'
import { optional } from '../../utils/optional'
import type { Department, Direction, SupervisorOption } from '../../api/types'

type DirectionFormModalProps = {
  open: boolean
  initial?: Direction
  /** The departments on offer: every one for an administrator, the covered ones for a manager. */
  departments: Department[]
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

export function DirectionFormModal({ open, initial, departments, isAdmin, onClose, onSaved }: DirectionFormModalProps) {
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
  const [managers, setManagers] = useState<SupervisorOption[]>([])
  const [isLoadingManagers, setIsLoadingManagers] = useState(false)

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

  // Design 2026-09-27 (phase 12) §4: an administrator names a manager who covers the direction's
  // department, so the list is loaded for the chosen department and reloaded when it changes. The
  // administrator's staff list is not capped, unlike the picker endpoint.
  useEffect(() => {
    if (!open || !isAdmin || !departmentId) {
      setManagers([])
      return
    }

    let cancelled = false
    setIsLoadingManagers(true)
    getStaff({ role: 'DirectionManager', departmentId })
      .then((staff) => {
        if (cancelled) return
        const options = staff.map((m) => ({ id: m.id, name: [m.lastName, m.firstName, m.patronymic].filter(Boolean).join(' ') }))
        setManagers(options)
        // A manager picked for another department does not carry over; the current one is kept
        // while the department is unchanged (work already held is not re-checked).
        setManagerId((current) =>
          options.some((m) => m.id === current) || (initial && current === initial.managerId && departmentId === initial.departmentId)
            ? current
            : '')
      })
      .catch((err) => {
        if (cancelled) return
        setManagers([])
        setError(errorMessage(err))
      })
      .finally(() => { if (!cancelled) setIsLoadingManagers(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin, departmentId, initial])

  const departmentOptions: SelectOption[] = departments.map((d) => ({ value: d.id, label: `${d.name} · ${d.facultyName}` }))
  // The direction's own department stays selectable when editing, even when it is not on offer.
  if (initial && !departments.some((d) => d.id === initial.departmentId)) {
    departmentOptions.push({ value: initial.departmentId, label: `${initial.departmentName} · ${initial.facultyName}` })
  }
  const managerOptions: SelectOption[] = managers.map((m) => ({ value: m.id, label: m.name }))
  if (initial && departmentId === initial.departmentId && !managers.some((m) => m.id === initial.managerId)) {
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
          !departmentId ? (
            <Select
              label={t('directions.manager')}
              value=""
              onChange={setManagerId}
              options={[]}
              placeholder={t('common.select')}
              hint={t('directions.managerPickDepartment')}
              error={managerError}
              disabled
            />
          ) : !isLoadingManagers && managerOptions.length === 0 ? (
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
