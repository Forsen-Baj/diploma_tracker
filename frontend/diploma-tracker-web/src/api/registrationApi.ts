import { apiRequest } from './apiClient'
import type { RegistrationStatus } from './types'

export async function getRegistrationStatus(): Promise<RegistrationStatus> {
  return apiRequest<RegistrationStatus>('/api/registration')
}

export async function setRegistrationStatus(open: boolean): Promise<void> {
  await apiRequest<void>('/api/registration', {
    method: 'PUT',
    body: JSON.stringify({ open })
  })
}
