import { apiDownload, apiRequest, saveBlob } from './apiClient'
import { UploadNetworkError } from './templatesApi'
import type { DocumentBoxName, DocumentCounts, DocumentDetails, DocumentListItem, DocumentPurpose, DocumentRecipient } from './types'

// Files passed here are already snapshots (`snapshotFile`) taken by the dialog at submit, so a file
// fixed in Word and chosen again uploads its current bytes (PROJECT_MEMORY: never upload a picked
// handle directly).
async function upload<T>(path: string, form: FormData): Promise<T> {
  try {
    return await apiRequest<T>(path, { method: 'POST', body: form })
  } catch (err) {
    if (err instanceof TypeError) throw new UploadNetworkError(err)
    throw err
  }
}

function form(fields: Record<string, string | number | null | undefined>, file?: File | null): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') data.append(key, String(value))
  }
  if (file) data.append('file', file)
  return data
}

export function getDocuments(box: DocumentBoxName): Promise<DocumentListItem[]> {
  return apiRequest<DocumentListItem[]>(`/api/documents?box=${box}`)
}

export function getDocumentCounts(): Promise<DocumentCounts> {
  return apiRequest<DocumentCounts>('/api/documents/counts')
}

export function getDocument(id: string): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}`)
}

export function searchRecipients(search: string): Promise<DocumentRecipient[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const query = params.toString()
  return apiRequest<DocumentRecipient[]>(`/api/documents/recipients${query ? `?${query}` : ''}`)
}

export function createDocument(title: string, description: string, file: File): Promise<DocumentDetails> {
  return upload<DocumentDetails>('/api/documents', form({ title, description: description.trim() }, file))
}

export function updateDocument(id: string, title: string, description: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ title, description: description.trim() || null, expectedSequence })
  })
}

export function deleteDocument(id: string, expectedSequence: number): Promise<void> {
  return apiRequest<void>(`/api/documents/${id}?expectedSequence=${expectedSequence}`, { method: 'DELETE' })
}

export function addDocumentVersion(id: string, file: File, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/versions`, form({ comment: comment.trim(), expectedSequence }, file))
}

export function sendDocument(id: string, recipientId: string, purpose: DocumentPurpose, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ recipientId, purpose, comment: comment.trim() || null, expectedSequence })
  })
}

export function forwardDocument(
  id: string,
  recipientId: string,
  purpose: DocumentPurpose,
  comment: string,
  file: File | null,
  expectedSequence: number
): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/forward`, form({ recipientId, purpose, comment: comment.trim(), expectedSequence }, file))
}

export function rejectDocument(id: string, targetId: string | null, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ targetId, comment: comment.trim(), expectedSequence })
  })
}

export function completeDocument(id: string, comment: string, file: File | null, expectedSequence: number): Promise<DocumentDetails> {
  return upload<DocumentDetails>(`/api/documents/${id}/done`, form({ comment: comment.trim(), expectedSequence }, file))
}

export function recallDocument(id: string, comment: string, expectedSequence: number): Promise<DocumentDetails> {
  return apiRequest<DocumentDetails>(`/api/documents/${id}/recall`, {
    method: 'POST',
    body: JSON.stringify({ comment: comment.trim() || null, expectedSequence })
  })
}

export async function downloadDocumentVersion(versionId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/document-versions/${versionId}`)
  saveBlob(blob, fileName ?? fallbackName)
}
