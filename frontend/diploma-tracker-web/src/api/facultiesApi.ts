import { apiRequest } from './apiClient'
import type { Faculty, FacultyRequest } from './types'

export async function getFaculties(): Promise<Faculty[]> {
  return apiRequest<Faculty[]>('/api/faculties')
}

export async function createFaculty(request: FacultyRequest): Promise<Faculty> {
  return apiRequest<Faculty>('/api/faculties', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateFaculty(id: string, request: FacultyRequest): Promise<Faculty> {
  return apiRequest<Faculty>(`/api/faculties/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteFaculty(id: string): Promise<void> {
  await apiRequest<void>(`/api/faculties/${id}`, {
    method: 'DELETE'
  })
}
