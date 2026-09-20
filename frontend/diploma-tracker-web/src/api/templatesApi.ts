import { apiDownload, apiRequest, saveBlob } from './apiClient'
import type { DocumentTemplate, EligibleStudent, MarkerInfo, TemplateInput } from './types'

function toForm(input: TemplateInput, file: File): FormData {
  const form = new FormData()
  form.append('name', input.name)
  if (input.description) form.append('description', input.description)
  form.append('visibleToAllStudents', String(input.visibleToAllStudents))
  form.append('visibleToAllTeachers', String(input.visibleToAllTeachers))
  input.groupIds.forEach((id) => form.append('groupIds', id))
  input.teacherIds.forEach((id) => form.append('teacherIds', id))
  form.append('file', file)
  return form
}

export function getTemplates(): Promise<DocumentTemplate[]> {
  return apiRequest<DocumentTemplate[]>('/api/templates')
}

export function getTemplateMarkers(): Promise<MarkerInfo[]> {
  return apiRequest<MarkerInfo[]>('/api/templates/markers')
}

export function getEligibleStudents(): Promise<EligibleStudent[]> {
  return apiRequest<EligibleStudent[]>('/api/templates/students')
}

export function createTemplate(input: TemplateInput, file: File): Promise<DocumentTemplate> {
  return apiRequest<DocumentTemplate>('/api/templates', { method: 'POST', body: toForm(input, file) })
}

export function updateTemplate(id: string, input: TemplateInput): Promise<DocumentTemplate> {
  return apiRequest<DocumentTemplate>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function replaceTemplateFile(id: string, file: File): Promise<DocumentTemplate> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<DocumentTemplate>(`/api/templates/${id}/file`, { method: 'PUT', body: form })
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiRequest<void>(`/api/templates/${id}`, { method: 'DELETE' })
}

export async function downloadTemplateSource(id: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/templates/${id}/source`)
  saveBlob(blob, fileName ?? fallbackName)
}

export async function generateDocument(
  id: string,
  request: { studentId?: string; topicId?: string },
  fallbackName: string
): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/templates/${id}/generate`, {
    method: 'POST',
    body: JSON.stringify(request)
  })
  saveBlob(blob, fileName ?? fallbackName)
}
