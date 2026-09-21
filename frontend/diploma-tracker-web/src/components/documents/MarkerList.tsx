import { Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getTemplateMarkers } from '../../api/templatesApi'
import { useErrorMessage } from '../../api/useErrorMessage'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../ui/useToast'
import type { MarkerInfo } from '../../api/types'

export function MarkerList() {
  const { t } = useTranslation()
  const toast = useToast()
  const errorMessage = useErrorMessage()

  const [markers, setMarkers] = useState<MarkerInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const markerTextRefs = useRef<Record<string, HTMLSpanElement | null>>({})

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      setIsLoading(true)
      setLoadError('')
      try {
        const data = await getTemplateMarkers()
        if (isCurrent) setMarkers(data)
      } catch (err) {
        if (isCurrent) setLoadError(errorMessage(err))
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }
    void load()

    return () => {
      isCurrent = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectMarkerText = (key: string) => {
    const element = markerTextRefs.current[key]
    if (!element) return
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const copyMarker = async (key: string, marker: string) => {
    if (!navigator.clipboard) {
      selectMarkerText(key)
      toast.error(t('templates.clipboardUnavailable'))
      return
    }
    try {
      await navigator.clipboard.writeText(marker)
      toast.success(t('templates.copied'))
    } catch (err) {
      selectMarkerText(key)
      toast.error(errorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  }

  if (loadError) {
    return <p className="text-sm text-danger">{loadError}</p>
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {markers.map((marker) => {
        const descriptionKey = marker.key.replace(/\./g, '_')
        return (
          <div key={marker.key} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                ref={(element) => {
                  markerTextRefs.current[marker.key] = element
                }}
                className="w-fit rounded-control bg-surface px-2 py-1 font-mono text-xs text-text-strong"
              >
                {marker.marker}
              </span>
              <span className="text-xs text-text-muted">{String(t(`templates.markerDescriptions.${descriptionKey}` as never))}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={Copy}
              aria-label={t('templates.copyMarkerAria', { marker: marker.key })}
              onClick={() => void copyMarker(marker.key, marker.marker)}
            />
          </div>
        )
      })}
    </div>
  )
}
