import { apiRequest } from './apiClient'
import type {
  AddGroupReviewerRequest,
  CreateGroupRequest,
  Group,
  GroupDeletionPreview,
  GroupReviewer,
  GroupStudent,
  UpdateGroupRequest
} from './types'

export async function getGroups(): Promise<Group[]> {
  return apiRequest<Group[]>('/api/groups')
}

export async function createGroup(request: CreateGroupRequest): Promise<Group> {
  return apiRequest<Group>('/api/groups', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateGroup(id: string, request: UpdateGroupRequest): Promise<Group> {
  return apiRequest<Group>(`/api/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteGroup(id: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${id}`, {
    method: 'DELETE'
  })
}

export async function getGroupDeletionPreview(id: string): Promise<GroupDeletionPreview> {
  return apiRequest<GroupDeletionPreview>(`/api/groups/${id}/deletion-preview`)
}

export async function getGroupReviewers(groupId: string): Promise<GroupReviewer[]> {
  return apiRequest<GroupReviewer[]>(`/api/groups/${groupId}/reviewers`)
}

export async function addGroupReviewer(groupId: string, reviewerId: string): Promise<GroupReviewer> {
  const request: AddGroupReviewerRequest = { reviewerId }
  return apiRequest<GroupReviewer>(`/api/groups/${groupId}/reviewers`, {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function removeGroupReviewer(groupId: string, reviewerId: string): Promise<void> {
  await apiRequest<void>(`/api/groups/${groupId}/reviewers/${reviewerId}`, {
    method: 'DELETE'
  })
}

export async function getGroupStudents(groupId: string): Promise<GroupStudent[]> {
  return apiRequest<GroupStudent[]>(`/api/groups/${groupId}/students`)
}
