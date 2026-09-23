import { ArrowLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { downloadArchivedFile, getArchivedGroup, purgeArchivedGroup } from '../api/archiveApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { useAuth } from '../auth/useAuth'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/useToast'
import { formatBytes } from '../components/workflow/formatBytes'
import type { ArchivedFile, ArchivedGroupDetails } from '../api/types'

type StudentFileGroup = {
  studentName: string
  studentNumber: string
  files: ArchivedFile[]
}

export function ArchivedGroupPage() {
  const { t, i18n } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { id } = useParams<{ id: string }>()
  const isAdmin = user?.role === 'Admin'

  const locale = i18n.language === 'en' ? 'en-GB' : 'uk-UA'
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale]
  )

  const [details, setDetails] = useState<ArchivedGroupDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [isPurgeOpen, setIsPurgeOpen] = useState(false)
  const [isPurging, setIsPurging] = useState(false)

  useEffect(() => {
    if (!id) {
      setIsLoading(false)
      return
    }

    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getArchivedGroup(id)
        if (!isCurrent) return
        setDetails(data)
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
  }, [id])

  const studentGroups = useMemo<StudentFileGroup[]>(() => {
    if (!details) return []

    const groups = new Map<string, StudentFileGroup>()
    for (const file of details.files) {
      const key = `${file.studentNumber}__${file.studentName}`
      const group = groups.get(key)
      if (group) {
        group.files.push(file)
      } else {
        groups.set(key, { studentName: file.studentName, studentNumber: file.studentNumber, files: [file] })
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        files: [...group.files].sort(
          (a, b) => a.stepOrder - b.stepOrder || a.version - b.version || (a.kind === b.kind ? 0 : a.kind === 'Main' ? -1 : 1)
        )
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName))
  }, [details])

  const handleDownload = async (file: ArchivedFile) => {
    setDownloadingFileId(file.id)
    try {
      await downloadArchivedFile(file.id, file.originalName)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloadingFileId(null)
    }
  }

  const confirmPurge = async () => {
    if (!details) return

    setIsPurging(true)
    try {
      await purgeArchivedGroup(details.id)
      setIsPurgeOpen(false)
      toast.success(t('archive.purged'))
      navigate('/archive')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setIsPurging(false)
    }
  }

  const columns: DataTableColumn<ArchivedFile>[] = [
    { key: 'step', header: t('archive.step'), render: (file) => `${file.stepOrder}. ${file.stepTitle}` },
    { key: 'version', header: t('archive.version'), render: (file) => file.version },
    { key: 'submittedAt', header: t('archive.submittedAt'), render: (file) => dateTimeFormat.format(new Date(file.submittedAt)) },
    {
      key: 'late',
      header: <span className="sr-only">{t('steps.late')}</span>,
      render: (file) => (file.isLate ? <Badge tone="warning">{t('steps.late')}</Badge> : null)
    },
    {
      key: 'decision',
      header: t('archive.decision'),
      render: (file) => (file.decision ? <Badge tone={file.decision === 'Approved' ? 'success' : 'warning'}>{t(`steps.decision.${file.decision}`)}</Badge> : null)
    },
    { key: 'mark', header: t('archive.mark'), render: (file) => (file.mark ?? '') },
    { key: 'reviewer', header: t('archive.reviewer'), render: (file) => file.reviewerName ?? '' },
    { key: 'comment', header: t('archive.comment'), render: (file) => file.reviewerComment ?? '' },
    {
      key: 'file',
      header: t('archive.file'),
      render: (file) => {
        const size = formatBytes(file.sizeBytes, locale)
        return (
          <div className="flex flex-col items-start gap-1">
            <p className="text-sm text-text-strong">
              {t(file.kind === 'Main' ? 'archive.mainFile' : 'archive.supportingFile')}: {file.originalName}
            </p>
            <p className="text-xs text-text-muted">{size.value} {t(`steps.fileSize.${size.unitKey}`)}</p>
            <Button
              variant="ghost"
              size="sm"
              loading={downloadingFileId === file.id}
              disabled={downloadingFileId !== null && downloadingFileId !== file.id}
              onClick={() => void handleDownload(file)}
            >
              {t('archive.download')}
            </Button>
          </div>
        )
      }
    }
  ]

  return (
    <>
      <Link to="/archive" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {t('archive.backToArchive')}
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

      {!isLoading && !loadError && details && (
        <>
          <PageHeader
            title={details.groupCode}
            description={`${details.academicYear} · ${details.departmentName}`}
            actions={isAdmin ? <Button variant="danger" onClick={() => setIsPurgeOpen(true)}>{t('archive.purge')}</Button> : undefined}
          />

          {details.reviewerNames.length > 0 && (
            <p className="mb-4 text-sm text-text-muted">{t('archive.reviewers')}: {details.reviewerNames.join(', ')}</p>
          )}

          {details.files.length === 0 && (
            <Card>
              <EmptyState message={t('archive.noFiles')} />
            </Card>
          )}

          {details.files.length > 0 && (
            <div className="flex flex-col gap-6">
              {studentGroups.map((group) => (
                <Card key={`${group.studentNumber}__${group.studentName}`} title={`${group.studentName} · ${group.studentNumber}`}>
                  <DataTable columns={columns} rows={group.files} getRowKey={(file) => file.id} />
                </Card>
              ))}
            </div>
          )}

          <ConfirmDialog
            open={isPurgeOpen}
            title={t('archive.purge')}
            message={t('archive.purgeConfirm', { code: details.groupCode, count: details.files.length })}
            confirmLabel={t('archive.purge')}
            loading={isPurging}
            onConfirm={() => void confirmPurge()}
            onCancel={() => setIsPurgeOpen(false)}
          />
        </>
      )}
    </>
  )
}
