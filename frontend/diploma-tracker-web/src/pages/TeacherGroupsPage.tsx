import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../api/groupsApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import type { Group } from '../api/types'

export function TeacherGroupsPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()

  const [groups, setGroups] = useState<Group[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        setGroups(await getGroups())
      } catch (err) {
        setLoadError(errorMessage(err))
      } finally {
        setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns: DataTableColumn<Group>[] = [
    { key: 'code', header: t('groups.code'), render: (group) => group.code },
    { key: 'academicYear', header: t('groups.academicYear'), render: (group) => group.academicYear },
    { key: 'department', header: t('groups.department'), render: (group) => group.departmentName }
  ]

  return (
    <>
      <PageHeader title={t('progress.groupsTitle')} />

      <Card>
        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={groups}
            getRowKey={(group) => group.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('progress.noGroups')} />}
            onRowClick={(group) => navigate(`/teacher/groups/${group.id}`)}
          />
        )}
      </Card>
    </>
  )
}
