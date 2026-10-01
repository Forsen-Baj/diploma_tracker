import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router-dom'
import { StepDetails } from '../components/workflow/StepDetails'
import type { StepBackState } from '../utils/reviewStepBack'

export function ReviewStepPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const location = useLocation()

  // A pasted URL or a reload drops react-router location state, so a missing/invalid state
  // falls back to the review queue - the same default the page always had. Both fields are
  // required together (review fix round 1, Minor): a partial state - backKind set without a
  // matching backTo, or vice versa - falls back too, rather than showing a label that disagrees
  // with where the link actually goes.
  const rawState = location.state as Partial<StepBackState> | null
  const state = rawState?.backTo && rawState?.backKind ? (rawState as StepBackState) : null
  const backTo = state?.backTo ?? '/review'
  const backLabel =
    state?.backKind === 'group'
      ? t('review.backToGroup')
      : state?.backKind === 'dashboard'
        ? t('review.backToDashboard')
        : t('review.backToQueue')

  return (
    <>
      <Link to={backTo} className="mb-4 inline-flex h-10 items-center gap-2 rounded-control bg-transparent px-4 text-sm font-medium text-accent hover:bg-surface">
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>

      {id && <StepDetails stepId={id} mode="reviewer" />}
    </>
  )
}
