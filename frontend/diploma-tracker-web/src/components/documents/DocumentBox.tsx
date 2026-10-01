import { FileText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getDocuments } from '../../api/documentsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Badge } from '../ui/Badge'
import { DataTable, type DataTableColumn } from '../ui/DataTable'
import { EmptyState } from '../ui/EmptyState'
import { documentStateTone } from './documentTones'
import type { DocumentBoxName, DocumentListItem } from '../../api/types'

export function DocumentBox({ box }: { box: DocumentBoxName }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()

  const [items, setItems] = useState<DocumentListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }),
    [i18n.language]
  )

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getDocuments(box)
        if (requestRef.current !== requestId) return
        setItems(data)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box])

  const titleCell = (item: DocumentListItem) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-text-strong">{item.title}</span>
      {item.isRejected && <Badge tone="warning">{t('documents.rejectedBadge')}</Badge>}
    </div>
  )

  const inbox: DataTableColumn<DocumentListItem>[] = [
    { key: 'title', header: t('documents.columns.title'), render: titleCell },
    { key: 'owner', header: t('documents.columns.owner'), render: (item) => item.ownerName },
    { key: 'from', header: t('documents.columns.from'), render: (item) => item.fromName ?? '' },
    { key: 'since', header: t('documents.columns.since'), render: (item) => (item.since ? dateTimeFormat.format(new Date(item.since)) : '') },
    { key: 'comment', header: t('documents.columns.comment'), render: (item) => item.comment ?? '' }
  ]

  const overview: DataTableColumn<DocumentListItem>[] = [
    { key: 'title', header: t('documents.columns.title'), render: titleCell },
    ...(box === 'handled' ? [{ key: 'owner', header: t('documents.columns.owner'), render: (item: DocumentListItem) => item.ownerName }] : []),
    {
      key: 'state',
      header: t('documents.columns.state'),
      render: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={documentStateTone[item.state]}>{t(`documents.state.${item.state}`)}</Badge>
          {item.purpose && <Badge tone="neutral">{t(`documents.purpose.${item.purpose}`)}</Badge>}
        </div>
      )
    },
    { key: 'holder', header: t('documents.columns.holder'), render: (item) => item.holderName ?? '—' },
    { key: 'updatedAt', header: t('documents.columns.updatedAt'), render: (item) => dateTimeFormat.format(new Date(item.updatedAt)) }
  ]

  if (loadError) {
    return <p className="text-sm text-danger">{loadError}</p>
  }

  return (
    <DataTable
      columns={box === 'review' || box === 'signing' ? inbox : overview}
      rows={items}
      getRowKey={(item) => item.id}
      loading={isLoading}
      emptyState={<EmptyState icon={FileText} message={t(`documents.empty.${box}`)} />}
      onRowClick={(item) => navigate(`/documents/${item.id}`)}
    />
  )
}
