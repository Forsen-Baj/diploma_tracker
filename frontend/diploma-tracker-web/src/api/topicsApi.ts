import { apiRequest } from './apiClient'
import type { SupervisorOption, Topic, TopicQuery, TopicRequest } from './types'

function toQueryString(query: TopicQuery): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function getTopics(query: TopicQuery = {}): Promise<Topic[]> {
  return apiRequest<Topic[]>(`/api/topics${toQueryString(query)}`)
}

export function getTopic(id: string): Promise<Topic> {
  return apiRequest<Topic>(`/api/topics/${id}`)
}

export function createTopic(request: TopicRequest): Promise<Topic> {
  return apiRequest<Topic>('/api/topics', { method: 'POST', body: JSON.stringify(request) })
}

export function updateTopic(id: string, request: TopicRequest): Promise<Topic> {
  return apiRequest<Topic>(`/api/topics/${id}`, { method: 'PUT', body: JSON.stringify(request) })
}

export async function deleteTopic(id: string): Promise<void> {
  await apiRequest<void>(`/api/topics/${id}`, { method: 'DELETE' })
}

export function getTopicSupervisors(): Promise<SupervisorOption[]> {
  return apiRequest<SupervisorOption[]>('/api/topics/supervisors')
}
