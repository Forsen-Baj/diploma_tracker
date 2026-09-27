import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchRecipients } from '../../api/documentsApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { cn } from '../ui/cn'
import { Spinner } from '../ui/Spinner'
import { TextField } from '../ui/TextField'
import type { DocumentRecipient } from '../../api/types'

type PersonPickerProps = {
  value: string
  onChange: (id: string) => void
  error?: string
}

export function PersonPicker({ value, onChange, error }: PersonPickerProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<DocumentRecipient[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  // Fix wave M7: once the search text changes, the list underneath it changes too - drop a
  // selection the user can no longer see rather than silently submitting it.
  const handleSearchChange = (nextSearch: string) => {
    setSearch(nextSearch)
    if (value) onChange('')
  }

  useEffect(() => {
    const requestId = ++requestRef.current
    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const result = await searchRecipients(search.trim())
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

  return (
    <div className="flex flex-col gap-2">
      <TextField label={t('documents.fields.recipient')} value={search} onChange={(event) => handleSearchChange(event.target.value)} placeholder={t('documents.recipientSearch')} error={error} />
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {isLoading && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}
      {!isLoading && !loadError && options.length === 0 && <p className="text-sm text-text-muted">{t('documents.recipientEmpty')}</p>}
      {!isLoading && options.length > 0 && (
        // Review I2 (task 7 fix round 1): the browser's default focus outline is drawn OUTSIDE the
        // button box, and this list's own overflow-auto clips it at the edges - the actual
        // "scuffed corners" the owner saw on Pass on/Send (the only document dialogs that render
        // this list). p-1 gives the outline room, and an INSET ring (ring-inset) can never be
        // clipped by overflow, unlike an outside outline/ring.
        <ul role="listbox" aria-label={t('documents.fields.recipient')} className="flex max-h-48 flex-col gap-1 overflow-auto p-1">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={value === option.id}
                onClick={() => onChange(option.id)}
                className={cn(
                  'w-full rounded-control px-3 py-2 text-left text-sm hover:bg-surface',
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                  value === option.id && 'bg-surface font-semibold'
                )}
              >
                <span className="block text-text-strong">{option.name}</span>
                <span className="block text-xs text-text-muted">
                  {t(`roles.${option.role}`)}
                  {option.groupCode ? ` · ${option.groupCode}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
