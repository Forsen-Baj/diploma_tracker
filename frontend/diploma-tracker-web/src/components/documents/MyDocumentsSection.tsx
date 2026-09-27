import { FilePlus2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SegmentedControl } from '../ui/SegmentedControl'
import { DocumentBox } from './DocumentBox'
import { NewDocumentDialog } from './NewDocumentDialog'

export function MyDocumentsSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [box, setBox] = useState<'mine' | 'handled'>('mine')
  const [isCreating, setIsCreating] = useState(false)

  return (
    <Card
      title={t('documents.sections.mine')}
      actions={<Button icon={FilePlus2} onClick={() => setIsCreating(true)}>{t('documents.new')}</Button>}
    >
      <div className="mb-4">
        <SegmentedControl
          size="sm"
          ariaLabel={t('documents.mineSwitchLabel')}
          value={box}
          onChange={(value) => setBox(value as 'mine' | 'handled')}
          options={[
            { value: 'mine', label: t('documents.mineSwitch.mine') },
            { value: 'handled', label: t('documents.mineSwitch.handled') }
          ]}
        />
      </div>
      <DocumentBox key={box} box={box} />
      {isCreating && (
        <NewDocumentDialog
          onClose={() => setIsCreating(false)}
          onCreated={(document) => navigate(`/documents/${document.id}`)}
        />
      )}
    </Card>
  )
}
