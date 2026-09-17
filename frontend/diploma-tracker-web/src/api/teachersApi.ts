import { apiRequest } from './apiClient'
import type { CreateTeacherRequest, Teacher, UpdateTeacherRequest } from './types'

export async function getTeachers(): Promise<Teacher[]> {
  return apiRequest<Teacher[]>('/api/teachers')
}

export async function createTeacher(request: CreateTeacherRequest): Promise<Teacher> {
  return apiRequest<Teacher>('/api/teachers', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateTeacher(id: string, request: UpdateTeacherRequest): Promise<Teacher> {
  return apiRequest<Teacher>(`/api/teachers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deactivateTeacher(id: string): Promise<void> {
  await apiRequest<void>(`/api/teachers/${id}/deactivate`, {
    method: 'PATCH'
  })
}

export async function setTeacherPassword(id: string, password: string): Promise<void> {
  await apiRequest<void>(`/api/teachers/${id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ password })
  })
}
