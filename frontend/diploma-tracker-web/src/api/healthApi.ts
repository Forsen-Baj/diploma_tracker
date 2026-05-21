import { apiRequest } from './apiClient'
import type { HealthResponse } from './types'

export async function getHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/api/health')
}
