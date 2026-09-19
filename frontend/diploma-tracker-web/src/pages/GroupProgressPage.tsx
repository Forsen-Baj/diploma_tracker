import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getGroupStudents } from '../api/groupsApi'
import { getGroupProgress } from '../api/workflowApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { GroupProgressMatrix } from '../components/workflow/GroupProgressMatrix'
import type { GroupProgress, GroupStudent } from '../api/types'

export function GroupProgressPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()
  const { groupId } = useParams<{ groupId: string }>()

  const [progress, setProgress] = useState<GroupProgress | null>(null)
  const [students, setStudents] = useState<GroupStudent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!groupId) {
      setIsLoading(false)
      return
    }

    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const [progressData, studentsData] = await Promise.all([getGroupProgress(groupId), getGroupStudents(groupId)])
        if (!isCurrent) return
        setProgress(progressData)
        setStudents(studentsData)
      } catch (err) {
        if (!isCurrent) return
        setLoadError(errorMessage(err))
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    void load()

    return () => {
      isCurrent = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const studentColumns: DataTableColumn<GroupStudent>[] = [
    { key: 'name', header: t('students.lastName'), render: (student) => `${student.firstName} ${student.lastName}` },
    { key: 'studentNumber', header: t('groups.studentNumber'), render: (student) => student.studentNumber },
    { key: 'email', header: t('auth.email'), render: (student) => student.email },
    { key: 'topic', header: t('groupDetails.topic'), render: (student) => student.topicTitle ?? t('common.notSet') },
    {
      key: 'supervisor',
      header: t('groupDetails.supervisor'),
      render: (student) => (student.supervisorFirstName && student.supervisorLastName ? `${student.supervisorFirstName} ${student.supervisorLastName}` : t('common.notAssigned'))
    },
    {
      key: 'claimed',
      header: t('common.status'),
      render: (student) => (
        <Badge tone={student.isClaimed ? 'success' : 'warning'}>{student.isClaimed ? t('groups.claimed') : t('groups.notClaimed')}</Badge>
      )
    }
  ]

  return (
    <>
      <Link to="/teacher/groups" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {t('progress.backToGroups')}
      </Link>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {!isLoading && loadError && (
        <Card>
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!isLoading && !loadError && progress && (
        <>
          <PageHeader title={progress.groupCode} />

          <Card title={t('progress.title')} className="mb-6">
            <GroupProgressMatrix progress={progress} onOpenStep={(studentTaskId) => navigate(`/review/steps/${studentTaskId}`)} />
          </Card>

          <Card title={t('groupDetails.students')}>
            <DataTable
              columns={studentColumns}
              rows={students}
              getRowKey={(student) => student.studentProfileId}
              emptyState={<EmptyState message={t('groupDetails.noStudents')} />}
            />
          </Card>
        </>
      )}
    </>
  )
}
