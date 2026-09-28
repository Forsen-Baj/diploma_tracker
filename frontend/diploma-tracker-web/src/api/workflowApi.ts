import { apiDownload, apiRequest, saveBlob } from './apiClient'
import type { GroupProgress, Paged, ReviewStateFilter, ReviewStudentItem, StepDetails, StudentProgress, StudentStep } from './types'

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

export function approveSubmission(id: string, mark: number | null, comment?: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/approve`, { method: 'POST', body: JSON.stringify({ mark: mark ?? undefined, comment }) })
}

export function returnSubmission(id: string, comment: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/submissions/${id}/return`, { method: 'POST', body: JSON.stringify({ comment }) })
}

export async function downloadSubmissionFile(fileId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/submission-files/${fileId}`)
  saveBlob(blob, fileName ?? fallbackName)
}

// O3: the Review tab's overview - every visible student and where they are, with a state
// filter. Replaces this page's earlier use of /api/review/queue (submissions awaiting a
// decision only); that endpoint is kept for the dashboards' own "waiting for review" lists.
export function getReviewStudents(
  groupId?: string,
  late?: boolean,
  state?: ReviewStateFilter,
  page = 1,
  pageSize = 25
): Promise<Paged<ReviewStudentItem>> {
  const params = new URLSearchParams()
  if (groupId) params.set('groupId', groupId)
  if (late !== undefined) params.set('late', String(late))
  if (state && state !== 'All') params.set('state', state)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  return apiRequest<Paged<ReviewStudentItem>>(`/api/review/students?${params.toString()}`)
}

export function getGroupProgress(groupId: string): Promise<GroupProgress> {
  return apiRequest<GroupProgress>(`/api/groups/${groupId}/progress`)
}

export function getMyProgress(): Promise<StudentProgress> {
  return apiRequest<StudentProgress>('/api/students/me/progress')
}

export function addPanelReviewer(stepId: string, reviewerId: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${stepId}/reviewers`, { method: 'POST', body: JSON.stringify({ reviewerId }) })
}

export function removePanelReviewer(stepId: string, reviewerId: string): Promise<StepDetails> {
  return apiRequest<StepDetails>(`/api/student-tasks/${stepId}/reviewers/${reviewerId}`, { method: 'DELETE' })
}
