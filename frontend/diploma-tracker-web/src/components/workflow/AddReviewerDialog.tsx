import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/apiClient'
import { addPanelReviewer, getStep, searchStaff } from '../../api/workflowApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { Modal } from '../ui/Modal'
import { Spinner } from '../ui/Spinner'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/useToast'
import type { StaffOption, StepDetails } from '../../api/types'

type AddReviewerDialogProps = {
  step: StepDetails
  onClose: () => void
  onAdded: (details: StepDetails) => void
}

export function AddReviewerDialog({ step, onClose, onAdded }: AddReviewerDialogProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<StaffOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const result = await searchStaff(search.trim())
        if (requestRef.current !== requestId) return
        setOptions(result)
      } catch (err) {
        if (requestRef.current !== requestId) return
        setLoadError(errorMessage(err))
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    const timer = window.setTimeout(() => {
      void load()
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // M11: a selection the search then hides (or the panel already picked up elsewhere) must not
  // stay enabled - "Add reviewer" would otherwise add someone no longer on screen.
  useEffect(() => {
    setSelectedId('')
  }, [search])

  const onPanel = new Set(step.panel.map((seat) => seat.reviewerId).filter((id): id is string => id !== null))
  const available = options.filter((option) => !onPanel.has(option.id))

  useEffect(() => {
    setSelectedId((current) => (current && available.some((option) => option.id === current) ? current : ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, step.panel])

  const handleAdd = async () => {
    if (!selectedId) return
    setIsSaving(true)
    try {
      const details = await addPanelReviewer(step.id, selectedId)
      toast.success(t('steps.reviewerAdded'))
      onAdded(details)
    } catch (err) {
      // M4: on a 409 (e.g. step.alreadyApproved because the panel just completed elsewhere),
      // re-fetch the step so the page reflects reality instead of leaving this dialog open on
      // stale data.
      if (err instanceof ApiError && err.status === 409) {
        try {
          onAdded(await getStep(step.id))
        } catch {
          // Ignore - the toast below still explains the original failure.
        }
      }
      toast.error(errorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={isSaving ? () => undefined : onClose}
      title={t('steps.addReviewerTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleAdd()} disabled={!selectedId} loading={isSaving}>
            {t('steps.addReviewer')}
          </Button>
        </>
      }
    >
      <TextField label={t('steps.reviewerSearch')} value={search} onChange={(event) => setSearch(event.target.value)} />
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {isLoading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
      {!isLoading && !loadError && available.length === 0 && <p className="text-sm text-text-muted">{t('steps.reviewerSearchEmpty')}</p>}
      {!isLoading && available.length > 0 && (
        <ul role="listbox" aria-label={t('steps.reviewerSearch')} className="flex max-h-64 flex-col gap-1 overflow-auto">
          {available.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={selectedId === option.id}
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  'w-full rounded-control px-3 py-2 text-left text-sm hover:bg-surface',
                  selectedId === option.id && 'bg-surface font-semibold'
                )}
              >
                <span className="block text-text-strong">{option.name}</span>
                <span className="block text-xs text-text-muted">
                  {t(`roles.${option.role}`)} · {option.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
