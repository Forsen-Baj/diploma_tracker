import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getGroups } from '../../api/groupsApi'
import { getGroupProgress } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Select, type SelectOption } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { GroupProgressMatrix } from '../workflow/GroupProgressMatrix'
import type { Group, GroupProgress } from '../../api/types'

// The group selector and progress matrix shared by the teacher and the administrator dashboard
// (task-15 brief, Step 1). Each viewer only ever sees the groups `getGroups()` scopes to them.
export function GroupProgressCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [groups, setGroups] = useState<Group[]>([])
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)
  const [groupsError, setGroupsError] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')

  const [progress, setProgress] = useState<GroupProgress | null>(null)
  const [isLoadingProgress, setIsLoadingProgress] = useState(false)
  const [progressError, setProgressError] = useState('')

  useEffect(() => {
    const load = async () => {
      setIsLoadingGroups(true)
      setGroupsError('')
      try {
        const data = await getGroups()
        setGroups(data)
        if (data.length === 1) {
          setSelectedGroupId(data[0].id)
        }
      } catch (err) {
        setGroupsError(errorMessage(err))
      } finally {
        setIsLoadingGroups(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedGroupId) {
      setProgress(null)
      setProgressError('')
      return
    }

    let isCurrent = true

    const load = async () => {
      setIsLoadingProgress(true)
      setProgressError('')
      try {
        const data = await getGroupProgress(selectedGroupId)
        if (!isCurrent) return
        setProgress(data)
      } catch (err) {
        if (!isCurrent) return
        setProgressError(errorMessage(err))
      } finally {
        if (isCurrent) setIsLoadingProgress(false)
      }
    }
    void load()

    return () => {
      isCurrent = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId])

  const groupOptions: SelectOption[] = groups.map((group) => ({
    value: group.id,
    label: `${group.code} — ${group.departmentName}, ${group.academicYear}`
  }))

  return (
    <Card title={t('dashboard.groupProgress')}>
      {isLoadingGroups && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoadingGroups && groupsError && <p className="text-sm text-danger">{groupsError}</p>}

      {!isLoadingGroups && !groupsError && (
        <>
          <div className="mb-4 max-w-sm">
            <Select
              label={t('dashboard.selectGroup')}
              value={selectedGroupId}
              onChange={setSelectedGroupId}
              options={groupOptions}
              placeholder={t('common.select')}
            />
          </div>

          {!selectedGroupId && <EmptyState message={t('dashboard.noGroupSelected')} />}

          {selectedGroupId && isLoadingProgress && (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )}

          {selectedGroupId && !isLoadingProgress && progressError && <p className="text-sm text-danger">{progressError}</p>}

          {selectedGroupId && !isLoadingProgress && !progressError && progress && (
            <GroupProgressMatrix progress={progress} onOpenStep={(studentTaskId) => navigate(`/review/steps/${studentTaskId}`)} />
          )}
        </>
      )}
    </Card>
  )
}
