import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getDocumentCounts } from '../api/documentsApi'
import { DocumentBox } from '../components/documents/DocumentBox'
import { MyDocumentsSection } from '../components/documents/MyDocumentsSection'
import { TemplatesSection } from '../components/documents/TemplatesSection'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Spinner } from '../components/ui/Spinner'
import type { DocumentCounts } from '../api/types'

type Section = 'review' | 'signing' | 'mine' | 'templates'
const sections: Section[] = ['review', 'signing', 'mine', 'templates']
const isSection = (value: string | null): value is Section => value !== null && (sections as string[]).includes(value)

export function DocumentsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [counts, setCounts] = useState<DocumentCounts | null>(null)

  useEffect(() => {
    let isCurrent = true
    getDocumentCounts()
      .then((data) => {
        if (isCurrent) setCounts(data)
      })
      .catch(() => {
        if (isCurrent) setCounts({ review: 0, signing: 0 })
      })
    return () => {
      isCurrent = false
    }
  }, [])

  // §4.7: the first section with something waiting opens by default.
  const requested = searchParams.get('section')
  const section: Section | null = isSection(requested)
    ? requested
    : counts === null
      ? null
      : counts.review > 0
        ? 'review'
        : counts.signing > 0
          ? 'signing'
          : 'mine'

  const withCount = (label: string, count: number | undefined) => (count ? `${label} (${count})` : label)

  return (
    <>
      <PageHeader title={t('documents.title')} description={t('documents.subtitle')} />

      <div className="mb-6">
        <SegmentedControl
          ariaLabel={t('documents.sectionsLabel')}
          value={section ?? ''}
          onChange={(value) => setSearchParams({ section: value })}
          options={[
            { value: 'review', label: withCount(t('documents.sections.review'), counts?.review) },
            { value: 'signing', label: withCount(t('documents.sections.signing'), counts?.signing) },
            { value: 'mine', label: t('documents.sections.mine') },
            { value: 'templates', label: t('documents.sections.templates') }
          ]}
        />
      </div>

      {section === null && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
      {(section === 'review' || section === 'signing') && (
        <Card title={t(`documents.sections.${section}`)}>
          <DocumentBox key={section} box={section} />
        </Card>
      )}
      {section === 'mine' && <MyDocumentsSection />}
      {section === 'templates' && <TemplatesSection />}
    </>
  )
}
