import { apiDownload, apiRequest, saveBlob } from './apiClient'
import type { DocumentTemplate, EligibleStudent, MarkerInfo, TemplateInput } from './types'

// A `TypeError` thrown by `fetch` while uploading a file most often means Chrome refused to send a
// picked `File` whose bytes changed on disk mid-session (`net::ERR_UPLOAD_FILE_CHANGED`) rather
// than a real connectivity failure. `UploadNetworkError` is still a `TypeError`, so the shared
// `useErrorMessage` mapping keeps showing the generic network message unchanged; callers that care
// about the difference (e.g. to reset a file picker) can check `instanceof UploadNetworkError`.
export class UploadNetworkError extends TypeError {
  constructor(cause: unknown) {
    super('Upload failed: network error or the browser refused to send the file.')
    this.name = 'UploadNetworkError'
    this.cause = cause
  }
}

// Reads the picked file's current bytes and returns a fresh, in-memory snapshot. A `File` handle
// kept around after the operator edits the file on disk under the same name (e.g. fixes it in
// Word) still points at the old bytes as far as the browser is concerned; sending it as-is is what
// triggers `net::ERR_UPLOAD_FILE_CHANGED` on retry. Reading the bytes immediately before upload
// closes that window, so a retry always sends what is on disk now. Throws (typically a
// `DOMException` named `NotReadableError`) when the file was changed, moved or deleted again in the
// instant before this read; callers should treat that as "choose the file again", not a network
// error.
export async function snapshotFile(file: File): Promise<File> {
  const bytes = await file.arrayBuffer()
  return new File([bytes], file.name, { type: file.type })
}

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

export async function createTemplate(input: TemplateInput, file: File): Promise<DocumentTemplate> {
  try {
    return await apiRequest<DocumentTemplate>('/api/templates', { method: 'POST', body: toForm(input, file) })
  } catch (err) {
    if (err instanceof TypeError) throw new UploadNetworkError(err)
    throw err
  }
}

export function updateTemplate(id: string, input: TemplateInput): Promise<DocumentTemplate> {
  return apiRequest<DocumentTemplate>(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export async function replaceTemplateFile(id: string, file: File): Promise<DocumentTemplate> {
  const form = new FormData()
  form.append('file', file)
  try {
    return await apiRequest<DocumentTemplate>(`/api/templates/${id}/file`, { method: 'PUT', body: form })
  } catch (err) {
    if (err instanceof TypeError) throw new UploadNetworkError(err)
    throw err
  }
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
