import { apiRequest } from './apiClient'
import type { TopicSelectionSettings } from './types'

export function getTopicSelectionSettings(): Promise<TopicSelectionSettings> {
  return apiRequest<TopicSelectionSettings>('/api/settings/topic-selection')
}

export async function setTopicSelectionDeadline(deadline: string | null): Promise<void> {
  await apiRequest<void>('/api/settings/topic-selection', { method: 'PUT', body: JSON.stringify({ deadline }) })
}
