import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { StepDetails } from '../components/workflow/StepDetails'

export function StudentTaskDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()

  return (
    <>
      <Link to="/student/tasks" className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {t('steps.backToMine')}
      </Link>

      {id && <StepDetails stepId={id} mode="student" />}
    </>
  )
}
