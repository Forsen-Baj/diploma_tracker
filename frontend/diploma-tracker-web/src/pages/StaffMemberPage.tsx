import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/apiClient'
import { getStaffMember, removeRoleAssignment } from '../api/staffApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { AddRoleModal } from '../components/staff/AddRoleModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/useToast'
import type { RoleAssignment, RoleAssignmentBlocker, StaffMember } from '../api/types'

/** Design 2026-09-27 (phase 12) §6: one staff member's roles, each with the faculty, department or
 *  group it applies to. A role still carrying work in its scope cannot be removed; the refusal lists
 *  that work so the administrator can hand it over first. */
export function StaffMemberPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [member, setMember] = useState<StaffMember | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [removing, setRemoving] = useState<RoleAssignment | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [blockers, setBlockers] = useState<RoleAssignmentBlocker[] | null>(null)
  const requestRef = useRef(0)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  const load = async () => {
    const requestId = ++requestRef.current
    setLoadError('')
    try {
      const data = await getStaffMember(id)
      if (requestRef.current !== requestId) return
      setMember(data)
    } catch (err) {
      if (requestRef.current !== requestId) return
      setLoadError(errorMessage(err))
    } finally {
      if (requestRef.current === requestId) setIsLoading(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    setMember(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleAdded = () => {
    setIsAddOpen(false)
    toast.success(t('staff.roleAdded'))
    void load()
  }

  const closeRemove = () => {
    if (isRemoving) return
    setRemoving(null)
    setBlockers(null)
  }

  const confirmRemove = async () => {
    if (!member || !removing) return
    setIsRemoving(true)
    try {
      await removeRoleAssignment(member.id, removing.id)
      setRemoving(null)
      toast.success(t('staff.roleRemoved'))
      void load()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'roleAssignment.inUse') {
        setBlockers((err.payload as { errors?: RoleAssignmentBlocker[] } | null)?.errors ?? [])
      } else {
        toast.error(errorMessage(err))
      }
    } finally {
      setIsRemoving(false)
    }
  }

  const backLink = (
    <Link to="/admin/staff" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
      <ArrowLeft className="size-4" aria-hidden />
      {t('staff.backToList')}
    </Link>
  )

  if (isLoading && !member) {
    return (
      <>
        {backLink}
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </>
    )
  }

  if (loadError || !member) {
    return (
      <>
        {backLink}
        <Card>
          <p className="text-sm text-danger">{loadError || t('errors.server.unexpected')}</p>
        </Card>
      </>
    )
  }

  const fullName = `${member.lastName} ${member.firstName}${member.patronymic ? ` ${member.patronymic}` : ''}`

  const columns: DataTableColumn<RoleAssignment>[] = [
    { key: 'role', header: t('staff.role'), render: (assignment) => t(`roles.${assignment.role}`) },
    { key: 'scopeKind', header: t('staff.scopeKind'), render: (assignment) => t(`staff.scopeKinds.${assignment.scopeKind}`) },
    {
      key: 'place',
      header: t('staff.place'),
      render: (assignment) => (
        <div className="flex flex-col">
          <span>{assignment.scopeName}</span>
          <span className="text-xs text-text-muted">{assignment.scopePath}</span>
        </div>
      )
    },
    { key: 'addedAt', header: t('staff.addedAt'), render: (assignment) => dateFormat.format(new Date(assignment.createdAt)) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (assignment) => (
        <Button variant="ghost" size="sm" icon={Trash2} aria-label={t('staff.removeRole')} onClick={() => setRemoving(assignment)} />
      )
    }
  ]

  let removeMessage: ReactNode = ''
  if (removing && blockers) {
    removeMessage = (
      <>
        <p>{t('staff.inUseIntro')}</p>
        <ul className="list-disc pl-5">
          {blockers.map((blocker, index) => (
            <li key={`${blocker.kind}-${index}`}>{`${t(`staff.blockers.${blocker.kind}`)}: ${blocker.label}`}</li>
          ))}
        </ul>
      </>
    )
  } else if (removing) {
    removeMessage = t('staff.removeRoleConfirm', { role: t(`roles.${removing.role}`), place: removing.scopePath })
  }

  return (
    <>
      {backLink}
      <PageHeader
        title={fullName}
        actions={<Button icon={Plus} onClick={() => setIsAddOpen(true)}>{t('staff.addRole')}</Button>}
      />

      <div className="flex flex-col gap-6">
        <Card>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-text-muted">{t('staff.email')}</dt>
              <dd className="text-text-strong">{member.email}</dd>
            </div>
            <div className="flex flex-col items-start gap-1">
              <dt className="text-text-muted">{t('staff.status')}</dt>
              <dd>
                <Badge tone={member.isActive ? 'success' : 'neutral'}>{member.isActive ? t('common.active') : t('common.inactive')}</Badge>
              </dd>
            </div>
          </dl>
        </Card>

        <Card title={t('staff.rolesTitle')}>
          <p className="mb-4 text-sm text-text-muted">{t('staff.rolesHint')}</p>
          <DataTable
            columns={columns}
            rows={member.assignments}
            getRowKey={(assignment) => assignment.id}
            emptyState={<EmptyState message={t('staff.noRolesHint')} />}
          />
        </Card>
      </div>

      {isAddOpen && (
        <AddRoleModal staffId={member.id} onClose={() => setIsAddOpen(false)} onAdded={handleAdded} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={blockers ? t('staff.inUseTitle') : t('staff.removeRole')}
        message={removeMessage}
        confirmLabel={t('staff.removeRole')}
        loading={isRemoving}
        hideConfirm={Boolean(blockers)}
        onConfirm={() => void confirmRemove()}
        onCancel={closeRemove}
      />
    </>
  )
}
