import { useEffect, useState } from 'react'
import { getHealth } from '../api/healthApi'
import type { HealthResponse } from '../api/types'

type HealthState = {
  isLoading: boolean
  data: HealthResponse | null
  error: string | null
}

export function HealthPage() {
  const [state, setState] = useState<HealthState>({
    isLoading: true,
    data: null,
    error: null
  })

  useEffect(() => {
    getHealth()
      .then((data) => {
        setState({
          isLoading: false,
          data,
          error: null
        })
      })
      .catch((error: Error) => {
        setState({
          isLoading: false,
          data: null,
          error: error.message
        })
      })
  }, [])

  return (
    <section className="page-card">
      <h1>Backend Health</h1>
      {state.isLoading && <p>Loading health status...</p>}
      {!state.isLoading && state.data && (
        <div>
          <p>Status: {state.data.status}</p>
          <p>Application: {state.data.application}</p>
        </div>
      )}
      {!state.isLoading && state.error && <p>Error: {state.error}</p>}
    </section>
  )
}
