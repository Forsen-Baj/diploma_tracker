import { apiRequest } from './apiClient'
import type {
  ArchiveGroupStudentsResponse,
  ArchiveStudentsRequest,
  ArchiveStudentsResponse,
  CreateStudentRequest,
  RestoreStudentsRequest,
  RestoreStudentsResponse,
  Student,
  StudentImportResult,
  UpdateStudentRequest
} from './types'

export async function getStudents(archived = false): Promise<Student[]> {
  const query = archived ? '?archived=true' : ''
  return apiRequest<Student[]>(`/api/students${query}`)
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

export async function archiveStudents(studentIds: string[]): Promise<ArchiveStudentsResponse> {
  const request: ArchiveStudentsRequest = { studentIds }
  return apiRequest<ArchiveStudentsResponse>('/api/students/archive', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function restoreStudents(studentIds: string[]): Promise<RestoreStudentsResponse> {
  const request: RestoreStudentsRequest = { studentIds }
  return apiRequest<RestoreStudentsResponse>('/api/students/restore', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function archiveGroupStudents(groupId: string): Promise<ArchiveGroupStudentsResponse> {
  return apiRequest<ArchiveGroupStudentsResponse>(`/api/groups/${groupId}/students/archive`, {
    method: 'POST'
  })
}
