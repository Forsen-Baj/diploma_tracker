import { FileText, Paperclip } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadSubmissionFile } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { useToast } from '../ui/useToast'
import { formatBytes } from './formatBytes'
import type { Submission } from '../../api/types'

type StepTimelineProps = {
  timeline: Submission[]
}

export function StepTimeline({ timeline }: StepTimelineProps) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)

  const locale = i18n.language === 'en' ? 'en-GB' : 'uk-UA'
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale]
  )

  const handleDownload = async (fileId: string, originalName: string) => {
    setDownloadingFileId(fileId)
    try {
      await downloadSubmissionFile(fileId, originalName)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloadingFileId(null)
    }
  }

  if (timeline.length === 0) {
    return <EmptyState message={t('steps.noSubmissions')} />
  }

  return (
    <div className="flex flex-col gap-4">
      {timeline.map((submission) => (
        <div key={submission.id} className="rounded-card bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-heading">{t('steps.version', { version: submission.version })}</p>
            <p className="text-xs text-text-muted">{dateTimeFormat.format(new Date(submission.submittedAt))}</p>
            {submission.isLate && <Badge tone="warning">{t('steps.late')}</Badge>}
          </div>

          {submission.message && <p className="mt-2 whitespace-pre-line text-sm text-text-strong">{submission.message}</p>}

          {submission.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {submission.files.map((file) => {
                const size = formatBytes(file.sizeBytes, locale)
                return (
                  <Button
                    key={file.id}
                    variant="ghost"
                    size="sm"
                    icon={file.kind === 'Main' ? FileText : Paperclip}
                    loading={downloadingFileId === file.id}
                    disabled={downloadingFileId !== null && downloadingFileId !== file.id}
                    onClick={() => void handleDownload(file.id, file.originalName)}
                  >
                    {file.originalName} · {size.value} {t(`steps.fileSize.${size.unitKey}`)}
                  </Button>
                )
              })}
            </div>
          )}

          {submission.decision && (
            <div className={cn('mt-4 border-l-2 pl-4', submission.decision === 'Approved' ? 'border-success' : 'border-warning')}>
              <p className="text-sm font-semibold text-heading">{t(`steps.decision.${submission.decision}`)}</p>
              <p className="text-xs text-text-muted">
                {submission.reviewerName}
                {submission.decidedAt ? ` · ${dateTimeFormat.format(new Date(submission.decidedAt))}` : ''}
              </p>
              {submission.mark !== null && <p className="mt-1 text-sm text-text-strong">{t('steps.markValue', { mark: submission.mark })}</p>}
              {submission.reviewerComment && <p className="mt-1 whitespace-pre-line text-sm text-text-strong">{submission.reviewerComment}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
