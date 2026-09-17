import { apiRequest } from './apiClient'
import type { CreateTaskTemplateRequest, TaskTemplate, UpdateTaskTemplateRequest } from './types'

export async function getTaskTemplates(facultyId?: string): Promise<TaskTemplate[]> {
  const query = facultyId ? `?facultyId=${encodeURIComponent(facultyId)}` : ''
  return apiRequest<TaskTemplate[]>(`/api/task-templates${query}`)
}

export async function createTaskTemplate(request: CreateTaskTemplateRequest): Promise<TaskTemplate> {
  return apiRequest<TaskTemplate>('/api/task-templates', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateTaskTemplate(id: string, request: UpdateTaskTemplateRequest): Promise<TaskTemplate> {
  return apiRequest<TaskTemplate>(`/api/task-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function activateTaskTemplate(id: string): Promise<TaskTemplate> {
  return apiRequest<TaskTemplate>(`/api/task-templates/${id}/activate`, {
    method: 'PATCH'
  })
}

export async function deactivateTaskTemplate(id: string): Promise<TaskTemplate> {
  return apiRequest<TaskTemplate>(`/api/task-templates/${id}/deactivate`, {
    method: 'PATCH'
  })
}
