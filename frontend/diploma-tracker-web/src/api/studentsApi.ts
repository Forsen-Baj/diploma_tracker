import { apiRequest } from './apiClient'
import type { CreateStudentRequest, Student, StudentImportResult, UpdateStudentRequest } from './types'

export async function getStudents(): Promise<Student[]> {
  return apiRequest<Student[]>('/api/students')
}

export async function createStudent(request: CreateStudentRequest): Promise<Student> {
  return apiRequest<Student>('/api/students', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateStudent(id: string, request: UpdateStudentRequest): Promise<Student> {
  return apiRequest<Student>(`/api/students/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deactivateStudent(id: string): Promise<void> {
  await apiRequest<void>(`/api/students/${id}/deactivate`, {
    method: 'PATCH'
  })
}

export async function assignStudentGroup(id: string, groupId: string): Promise<Student> {
  return apiRequest<Student>(`/api/students/${id}/group`, {
    method: 'PUT',
    body: JSON.stringify({ groupId })
  })
}

export async function assignStudentSupervisor(id: string, supervisorId: string): Promise<Student> {
  return apiRequest<Student>(`/api/students/${id}/supervisor`, {
    method: 'PUT',
    body: JSON.stringify({ supervisorId })
  })
}

export async function resetStudentAccess(id: string): Promise<void> {
  await apiRequest<void>(`/api/students/${id}/reset-access`, {
    method: 'POST'
  })
}

export async function importStudents(groupId: string, file: File): Promise<StudentImportResult> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<StudentImportResult>(`/api/groups/${groupId}/students/import`, {
    method: 'POST',
    body: form
  })
}
