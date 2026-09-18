import { apiRequest } from './apiClient'
import type {
  AssignAllTaskTemplatesRequest,
  AssignAllTaskTemplatesResponse,
  CreateGroupTaskRequest,
  GroupTask,
  MyStudentTask,
  MyStudentTaskDetails,
  UpdateGroupTaskRequest
} from './types'

export async function getTasksForGroup(groupId: string): Promise<GroupTask[]> {
  return apiRequest<GroupTask[]>(`/api/groups/${groupId}/tasks`)
}

export async function createGroupTask(request: CreateGroupTaskRequest): Promise<GroupTask> {
  return apiRequest<GroupTask>('/api/group-tasks', {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function updateGroupTask(id: string, request: UpdateGroupTaskRequest): Promise<GroupTask> {
  return apiRequest<GroupTask>(`/api/group-tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(request)
  })
}

export async function deleteGroupTask(id: string): Promise<void> {
  await apiRequest<void>(`/api/group-tasks/${id}`, {
    method: 'DELETE'
  })
}

export async function assignAllTaskTemplates(groupId: string, request: AssignAllTaskTemplatesRequest): Promise<AssignAllTaskTemplatesResponse> {
  return apiRequest<AssignAllTaskTemplatesResponse>(`/api/groups/${groupId}/assign-all-task-templates`, {
    method: 'POST',
    body: JSON.stringify(request)
  })
}

export async function getMyStudentTasks(): Promise<MyStudentTask[]> {
  return apiRequest<MyStudentTask[]>('/api/student/my-tasks')
}

export async function getMyStudentTaskDetails(id: string): Promise<MyStudentTaskDetails> {
  return apiRequest<MyStudentTaskDetails>(`/api/student/my-tasks/${id}`)
}
