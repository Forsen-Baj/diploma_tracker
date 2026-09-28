import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getDepartments } from '../../api/departmentsApi'
import { getFaculties } from '../../api/facultiesApi'
import { getGroups } from '../../api/groupsApi'
import { addRoleAssignment } from '../../api/staffApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { staffRoles } from '../layout/navigation'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Select, type SelectOption } from '../ui/Select'
import type { Department, Faculty, Group, RoleAssignment, RoleScopeKind, StaffRole } from '../../api/types'

type AddRoleModalProps = {
  staffId: string
  onClose: () => void
  onAdded: (assignment: RoleAssignment) => void
}

/** Design 2026-09-27 (phase 12) §6: a role and the faculty, department or group it applies to, picked
 *  from the top down. A direction manager is never assigned to a group. */
export function AddRoleModal({ staffId, onClose, onAdded }: AddRoleModalProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [faculties, setFaculties] = useState<Faculty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [role, setRole] = useState<StaffRole>('Teacher')
  const [scopeKind, setScopeKind] = useState<RoleScopeKind>('Department')
  const [facultyId, setFacultyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getFaculties(), getDepartments(), getGroups()])
      .then(([facultyData, departmentData, groupData]) => {
        if (cancelled) return
        setFaculties(facultyData)
        setDepartments(departmentData)
        setGroups(groupData)
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roleOptions: SelectOption[] = staffRoles.map((value) => ({ value, label: t(`roles.${value}`) }))
  const kinds: RoleScopeKind[] = role === 'DirectionManager' ? ['Faculty', 'Department'] : ['Faculty', 'Department', 'Group']
  const facultyOptions: SelectOption[] = faculties.map((f) => ({ value: f.id, label: f.name }))
  const departmentOptions: SelectOption[] = useMemo(
    () => departments.filter((d) => d.facultyId === facultyId).map((d) => ({ value: d.id, label: d.name })),
    [departments, facultyId]
  )
  const groupOptions: SelectOption[] = useMemo(
    () => groups.filter((g) => g.departmentId === departmentId).map((g) => ({ value: g.id, label: `${g.code} (${g.academicYear})` })),
    [groups, departmentId]
  )
  const scopeId = scopeKind === 'Faculty' ? facultyId : scopeKind === 'Department' ? departmentId : groupId

  const changeRole = (value: string) => {
    const next = value as StaffRole
    setRole(next)
    if (next === 'DirectionManager' && scopeKind === 'Group') setScopeKind('Department')
  }

  const changeFaculty = (value: string) => {
    setFacultyId(value)
    setDepartmentId('')
    setGroupId('')
  }

  const changeDepartment = (value: string) => {
    setDepartmentId(value)
    setGroupId('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!scopeId) return
    setIsSaving(true)
    setError('')
    try {
      onAdded(await addRoleAssignment(staffId, { role, scopeKind, scopeId }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!isSaving) onClose() }}
      title={t('staff.addRole')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button form="add-role-form" type="submit" loading={isSaving} disabled={!scopeId}>{t('common.save')}</Button>
        </>
      }
    >
      <form id="add-role-form" onSubmit={submit} className="flex flex-col gap-4">
        <Select label={t('staff.role')} value={role} onChange={changeRole} options={roleOptions} />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-heading">{t('staff.scopeKind')}</span>
          <SegmentedControl
            ariaLabel={t('staff.scopeKind')}
            value={scopeKind}
            onChange={(value) => setScopeKind(value as RoleScopeKind)}
            options={kinds.map((kind) => ({ value: kind, label: t(`staff.scopeKinds.${kind}`) }))}
          />
          {role === 'DirectionManager' && <p className="text-xs text-text-muted">{t('staff.managerScopeHint')}</p>}
        </div>
        <Select label={t('staff.faculty')} value={facultyId} onChange={changeFaculty} options={facultyOptions} placeholder={t('common.select')} />
        {scopeKind !== 'Faculty' && (
          <Select label={t('staff.department')} value={departmentId} onChange={changeDepartment} options={departmentOptions}
            placeholder={t('common.select')} disabled={!facultyId} />
        )}
        {scopeKind === 'Group' && (
          <Select label={t('staff.group')} value={groupId} onChange={setGroupId} options={groupOptions}
            placeholder={t('common.select')} disabled={!departmentId} />
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  )
}
