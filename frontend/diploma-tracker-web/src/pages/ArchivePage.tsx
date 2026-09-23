import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getArchivedGroups, getArchiveUsage } from '../api/archiveApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Select, type SelectOption } from '../components/ui/Select'
import { TextField } from '../components/ui/TextField'
import { formatBytes } from '../components/workflow/formatBytes'
import type { ArchivedGroupSummary, ArchiveUsage } from '../api/types'

export function ArchivePage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'Admin'

  const locale = i18n.language === 'en' ? 'en-GB' : 'uk-UA'

  const [groups, setGroups] = useState<ArchivedGroupSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  const [academicYear, setAcademicYear] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [usage, setUsage] = useState<ArchiveUsage | null>(null)

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale]
  )

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    const requestId = ++requestRef.current

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getArchivedGroups(academicYear || undefined, search || undefined)
        if (requestRef.current !== requestId) return
        setGroups(data)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYear, search])

  useEffect(() => {
    if (!isAdmin) return

    const loadUsage = async () => {
      try {
        setUsage(await getArchiveUsage())
      } catch {
        // The usage line is a convenience; its failure must not hide the archive list itself.
      }
    }
    void loadUsage()
  }, [isAdmin])

  const yearOptions: SelectOption[] = [
    { value: '', label: t('archive.allYears') },
    ...Array.from(new Set(groups.map((group) => group.academicYear)))
      .sort((a, b) => b.localeCompare(a))
      .map((year) => ({ value: year, label: year }))
  ]

  const formatSize = (bytes: number) => {
    const size = formatBytes(bytes, locale)
    return `${size.value} ${t(`steps.fileSize.${size.unitKey}`)}`
  }

  const columns: DataTableColumn<ArchivedGroupSummary>[] = [
    { key: 'groupCode', header: t('archive.groupCode'), render: (group) => group.groupCode },
    { key: 'academicYear', header: t('archive.academicYear'), render: (group) => group.academicYear },
    { key: 'department', header: t('archive.department'), render: (group) => group.departmentName },
    { key: 'faculty', header: t('archive.faculty'), render: (group) => group.facultyName },
    { key: 'students', header: t('archive.students'), render: (group) => group.studentCount },
    { key: 'files', header: t('archive.files'), render: (group) => group.fileCount },
    { key: 'size', header: t('archive.size'), render: (group) => formatSize(group.totalSizeBytes) },
    { key: 'archivedAt', header: t('archive.archivedAt'), render: (group) => dateFormat.format(new Date(group.createdAt)) },
    {
      key: 'status',
      header: t('common.status'),
      render: (group) => (
        <Badge tone={group.groupDeletedAt ? 'neutral' : 'info'}>
          {group.groupDeletedAt ? t('archive.groupDeleted') : t('archive.groupKept')}
        </Badge>
      )
    }
  ]

  return (
    <>
      <PageHeader title={t('archive.title')} description={t('archive.subtitle')} />

      {isAdmin && usage && (
        <p className="mb-4 text-sm text-text-muted">{t('archive.usage', { files: usage.fileCount, size: formatSize(usage.totalSizeBytes) })}</p>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1">
            <Select label={t('archive.academicYear')} value={academicYear} onChange={setAcademicYear} options={yearOptions} />
          </div>
          <div className="max-w-sm flex-1">
            <TextField
              label={t('archive.searchPlaceholder')}
              placeholder={t('archive.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>

        {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}
        {!loadError && (
          <DataTable
            columns={columns}
            rows={groups}
            getRowKey={(group) => group.id}
            loading={isLoading}
            emptyState={<EmptyState message={t('archive.empty')} />}
            onRowClick={(group) => navigate(`/archive/${group.id}`)}
          />
        )}
      </Card>
    </>
  )
}
