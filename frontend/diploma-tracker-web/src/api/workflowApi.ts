import { apiDownload, apiRequest } from './apiClient'
import type { GroupProgress, ReviewQueueItem, StepDetails, StudentProgress, StudentStep } from './types'

export function getMySteps(): Promise<StudentStep[]> {
  return apiRequest<StudentStep[]>('/api/student-tasks/mine')
}

export function getStep(id: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${id}`)
}

export function submitWork(id: string, mainFile: File, supportingFiles: File[], message: string): Promise<StepDetails> {
  const form = new FormData()
  form.append('mainFile', mainFile)
  supportingFiles.forEach((file) => form.append('supportingFiles', file))
  if (message.trim()) form.append('message', message.trim())
  return apiRequest<StepDetails>(`/api/student-tasks/${id}/submissions`, { method: 'POST', body: form })
}

export function approveSubmission(id: string, mark: number, comment?: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/approve`, { method: 'POST', body: JSON.stringify({ mark, comment }) })
}

export function returnSubmission(id: string, comment: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/return`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function downloadSubmissionFile(fileId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/submission-files/${fileId}`)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName ?? fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking in the same tick can abort the download in Firefox and Safari; a short delay lets
  // the browser start reading the blob first.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function getReviewQueue(groupId?: string, late?: boolean): Promise<ReviewQueueItem[]> {
  const params = new URLSearchParams()
  if (groupId) params.set('groupId', groupId)
  if (late !== undefined) params.set('late', String(late))
  const query = params.toString()
  return apiRequest<ReviewQueueItem[]>(`/api/review/queue${query ? `?${query}` : ''}`)
}

export function getGroupProgress(groupId: string): Promise<GroupProgress> {
  return apiRequest<GroupProgress>(`/api/groups/${groupId}/progress`)
}

export function getMyProgress(): Promise<StudentProgress> {
  return apiRequest<StudentProgress>('/api/students/me/progress')
}
