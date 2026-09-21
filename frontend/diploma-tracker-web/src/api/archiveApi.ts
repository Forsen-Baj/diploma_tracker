import { apiDownload, apiRequest, saveBlob } from './apiClient'
import type { ArchiveUsage, ArchivedGroupDetails, ArchivedGroupSummary } from './types'

export function getArchivedGroups(academicYear?: string, search?: string): Promise<ArchivedGroupSummary[]> {
  const params = new URLSearchParams()
  if (academicYear) params.set('academicYear', academicYear)
  if (search) params.set('search', search)
  const query = params.toString()
  return apiRequest<ArchivedGroupSummary[]>(`/api/archive/groups${query ? `?${query}` : ''}`)
}

export function getArchivedGroup(id: string): Promise<ArchivedGroupDetails> {
  return apiRequest<ArchivedGroupDetails>(`/api/archive/groups/${id}`)
}

export function getArchiveUsage(): Promise<ArchiveUsage> {
  return apiRequest<ArchiveUsage>('/api/archive/usage')
}

export function purgeArchivedGroup(id: string): Promise<void> {
  return apiRequest<void>(`/api/archive/groups/${id}`, { method: 'DELETE' })
}

export async function downloadArchivedFile(fileId: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await apiDownload(`/api/archive/files/${fileId}`)
  saveBlob(blob, fileName ?? fallbackName)
}
