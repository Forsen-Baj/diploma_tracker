import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getHealth } from '../api/healthApi'
import { useErrorMessage } from '../api/useErrorMessage'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { Spinner } from '../components/ui/Spinner'
import type { HealthResponse } from '../api/types'

type HealthState = {
  isLoading: boolean
  data: HealthResponse | null
  error: string | null
}

export function HealthPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [state, setState] = useState<HealthState>({
    isLoading: true,
    data: null,
    error: null
  })

  useEffect(() => {
    getHealth()
      .then((data) => {
        setState({ isLoading: false, data, error: null })
      })
      .catch((err: unknown) => {
        setState({ isLoading: false, data: null, error: errorMessage(err) })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <PageHeader title={t('health.title')} />
      <Card>
        {state.isLoading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {!state.isLoading && state.error && <p className="text-sm text-danger">{state.error}</p>}
        {!state.isLoading && state.data && (
          <div className="flex items-center gap-3">
            <Badge tone={state.data.status === 'Healthy' ? 'success' : 'danger'}>{state.data.status}</Badge>
            <span className="text-sm text-text-strong">
              {t('health.application')}: {state.data.application}
            </span>
          </div>
        )}
      </Card>
    </>
  )
}
