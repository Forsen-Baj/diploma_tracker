import { apiRequest } from './apiClient'
import type { Admin, CreateAdminRequest, UpdateAdminRequest } from './types'

export async function getAdmins(): Promise<Admin[]> {
  return apiRequest<Admin[]>('/api/admins')
}

export async function createAdmin(request: CreateAdminRequest): Promise<Admin> {
  return apiRequest<Admin>('/api/admins', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateAdmin(id: string, request: UpdateAdminRequest): Promise<void> {
  await apiRequest<void>(`/api/admins/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function setAdminPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/api/admins/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password })
  })
}

export async function deactivateAdmin(id: string): Promise<void> {
  await apiRequest<void>(`/api/admins/${id}/deactivate`, {
    method: 'POST'
  })
}

export async function activateAdmin(id: string): Promise<void> {
  await apiRequest<void>(`/api/admins/${id}/activate`, {
    method: 'POST'
  })
}
