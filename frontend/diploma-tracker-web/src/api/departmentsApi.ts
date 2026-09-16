import { apiRequest } from './apiClient'
import type { Department, DepartmentRequest } from './types'

export async function getDepartments(facultyId?: string): Promise<Department[]> {
  const query = facultyId ? `?facultyId=${encodeURIComponent(facultyId)}` : ''
  return apiRequest<Department[]>(`/api/departments${query}`)
}

export async function createDepartment(request: DepartmentRequest): Promise<Department> {
  return apiRequest<Department>('/api/departments', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateDepartment(id: string, request: DepartmentRequest): Promise<Department> {
  return apiRequest<Department>(`/api/departments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteDepartment(id: string): Promise<void> {
  await apiRequest<void>(`/api/departments/${id}`, {
    method: 'DELETE'
  })
}
