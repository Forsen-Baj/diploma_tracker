import { apiRequest } from './apiClient'
import type { Direction, DirectionQuery, DirectionRequest } from './types'

function toQueryString(query: DirectionQuery): string {
  const params = new URLSearchParams()
  if (query.departmentId) params.set('departmentId', query.departmentId)
  if (query.managerId) params.set('managerId', query.managerId)
  if (query.mine) params.set('mine', 'true')
  if (query.covered) params.set('covered', 'true')
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function getDirections(query: DirectionQuery = {}): Promise<Direction[]> {
  return apiRequest<Direction[]>(`/api/directions${toQueryString(query)}`)
}

export function createDirection(request: DirectionRequest): Promise<Direction> {
  return apiRequest<Direction>('/api/directions', { method: 'POST', body: JSON.stringify(request) })
}

export function updateDirection(id: string, request: DirectionRequest): Promise<Direction> {
  return apiRequest<Direction>(`/api/directions/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deleteDirection(id: string): Promise<void> {
  await apiRequest<void>(`/api/directions/${id}`, { method: 'DELETE' })
}
